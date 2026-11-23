/**
 * Source models → what the games load (docs/tasks/M1-10-assets-avatar.md):
 *
 *   bun run assets                                  every games/<game>/assets/src/*.glb
 *   bun run assets games/bridge/assets/src/x.glb    only the given files
 *
 * Output goes to games/<game>/assets/dist/<same name>.glb and is committed, so
 * only whoever changes models needs `ktx` from KTX-Software (no Homebrew formula:
 * install the .pkg from https://github.com/KhronosGroup/KTX-Software/releases).
 *
 * Steps: dedup + prune → resample animations → cap texture size → KTX2 / Basis
 * textures → meshopt geometry.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";

import { NodeIO } from "@gltf-transform/core";
import type { Document, Texture } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRTextureBasisu } from "@gltf-transform/extensions";
import {
  dedup,
  getTextureColorSpace,
  listTextureSlots,
  meshopt,
  prune,
  resample,
  textureCompress,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const ROOT = resolve(import.meta.dir, "..");
/** Bigger textures are scaled down, keeping the aspect ratio. */
export const MAX_TEXTURE_SIZE = 1024;
const KTX_INSTALL =
  "https://github.com/KhronosGroup/KTX-Software/releases (macOS: the Darwin .pkg)";

export interface KtxEncoding {
  /** ETC1S (BasisLZ) is small and fine for colour; UASTC keeps data like normals intact. */
  codec: "basis-lz" | "uastc";
  colorSpace: "srgb" | "linear";
}

/**
 * How to encode a texture, from the material slots that use it. Colour goes to
 * ETC1S in sRGB. Normal maps go to UASTC: ETC1S block artefacts show up as
 * lighting seams. Other data (occlusion, roughness, metalness) stays linear.
 */
export function ktxEncoding(
  slots: readonly string[],
  colorSpace: string | null,
): KtxEncoding {
  const linear = colorSpace !== "srgb";
  if (slots.some((slot) => /normal/i.test(slot))) {
    return { codec: "uastc", colorSpace: "linear" };
  }
  return { codec: "basis-lz", colorSpace: linear ? "linear" : "srgb" };
}

/** Arguments for `ktx create` (KTX-Software 4.4+). */
export function ktxCreateArgs(
  encoding: KtxEncoding,
  input: string,
  output: string,
): string[] {
  const args = [
    "create",
    "--format",
    encoding.colorSpace === "srgb" ? "R8G8B8A8_SRGB" : "R8G8B8A8_UNORM",
    "--assign-tf",
    encoding.colorSpace === "srgb" ? "srgb" : "linear",
    "--encode",
    encoding.codec,
    "--generate-mipmap",
  ];
  if (encoding.codec === "uastc") {
    // UASTC alone is big; Zstandard brings it close to ETC1S on the wire.
    args.push("--uastc-quality", "2", "--zstd", "18");
  } else {
    args.push("--clevel", "4", "--qlevel", "255");
  }
  args.push(input, output);
  return args;
}

function requireKtx(): void {
  if (Bun.which("ktx") === null) {
    throw new Error(
      `\`ktx\` (KTX-Software) is not in PATH; it encodes KTX2 textures. Install it from ${KTX_INSTALL}, then check \`ktx --version\`.`,
    );
  }
}

async function toKtx2(texture: Texture, workdir: string): Promise<void> {
  const image = texture.getImage();
  if (image === null || texture.getMimeType() !== "image/png") {
    return;
  }
  const encoding = ktxEncoding(
    listTextureSlots(texture),
    getTextureColorSpace(texture),
  );
  const name = `${texture.getName() || "texture"}-${crypto.randomUUID()}`;
  const input = join(workdir, `${name}.png`);
  const output = join(workdir, `${name}.ktx2`);
  await Bun.write(input, image);

  const result = Bun.spawnSync(
    ["ktx", ...ktxCreateArgs(encoding, input, output)],
    {
      stderr: "pipe",
    },
  );
  if (!result.success) {
    throw new Error(
      `ktx create failed for texture "${texture.getName()}": ${result.stderr.toString()}`,
    );
  }
  texture
    .setImage(new Uint8Array(await Bun.file(output).arrayBuffer()))
    .setMimeType("image/ktx2");
  const uri = texture.getURI();
  if (uri !== "") {
    texture.setURI(uri.replace(/\.(png|jpe?g)$/i, ".ktx2"));
  }
}

/**
 * Scales textures above MAX_TEXTURE_SIZE down, keeping the aspect ratio, and
 * turns them all into PNG so `ktx create` gets one input format.
 */
export async function limitTextures(doc: Document): Promise<void> {
  await doc.transform(
    textureCompress({
      targetFormat: "png",
      resize: [MAX_TEXTURE_SIZE, MAX_TEXTURE_SIZE],
    }),
  );
}

/** Every step except writing: the document is changed in place. */
export async function optimize(doc: Document): Promise<void> {
  await MeshoptEncoder.ready;
  await doc.transform(dedup(), prune(), resample());
  await limitTextures(doc);

  const textures = doc.getRoot().listTextures();
  if (textures.length > 0) {
    requireKtx();
    const workdir = await mkdtemp(join(tmpdir(), "optimize-assets-"));
    try {
      for (const texture of textures) {
        await toKtx2(texture, workdir);
      }
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
    doc.createExtension(KHRTextureBasisu).setRequired(true);
  }

  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
}

export async function createIO(): Promise<NodeIO> {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });
}

/** games/<game>/assets/src/<name>.glb → games/<game>/assets/dist/<name>.glb */
export function distPath(source: string): string {
  const srcDir = dirname(source);
  if (basename(srcDir) !== "src" || basename(dirname(srcDir)) !== "assets") {
    throw new Error(`${source} is not in an assets/src folder`);
  }
  return join(dirname(srcDir), "dist", basename(source));
}

async function main(files: string[]): Promise<void> {
  const sources =
    files.length > 0
      ? files.map((file) => resolve(file))
      : (
          await Array.fromAsync(
            new Bun.Glob("games/*/assets/src/*.glb").scan({ cwd: ROOT }),
          )
        )
          .sort()
          .map((file) => join(ROOT, file));
  if (sources.length === 0) {
    console.info("No models in games/*/assets/src.");
    return;
  }

  const io = await createIO();
  const rows: { file: string; before: string; after: string }[] = [];
  for (const source of sources) {
    const target = distPath(source);
    const doc = await io.read(source);
    await optimize(doc);
    const glb = await io.writeBinary(doc);
    await Bun.write(target, glb);
    rows.push({
      file: relative(ROOT, target),
      before: `${(Bun.file(source).size / 1024).toFixed(1)} KB`,
      after: `${(glb.length / 1024).toFixed(1)} KB`,
    });
  }
  console.table(rows);
}

if (import.meta.main) {
  await main(Bun.argv.slice(2));
}
