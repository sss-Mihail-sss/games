import { describe, expect, test } from "bun:test";

import { Document } from "@gltf-transform/core";

import { encodePng } from "../games/bridge/assets/models/builder.ts";
import {
  distPath,
  ktxCreateArgs,
  ktxEncoding,
  limitTextures,
  MAX_TEXTURE_SIZE,
} from "./optimize-assets.ts";

describe("ktxEncoding", () => {
  test("colour: ETC1S in sRGB", () => {
    expect(ktxEncoding(["baseColorTexture"], "srgb")).toEqual({
      codec: "basis-lz",
      colorSpace: "srgb",
    });
  });

  test("normal maps: UASTC, linear (ETC1S artefacts show up as lighting seams)", () => {
    expect(ktxEncoding(["normalTexture"], null)).toEqual({
      codec: "uastc",
      colorSpace: "linear",
    });
  });

  test("other data stays linear", () => {
    expect(ktxEncoding(["metallicRoughnessTexture"], null)).toEqual({
      codec: "basis-lz",
      colorSpace: "linear",
    });
  });

  test("a texture used as colour and as a normal map is treated as a normal map", () => {
    expect(
      ktxEncoding(["baseColorTexture", "normalTexture"], "srgb").codec,
    ).toBe("uastc");
  });
});

describe("ktxCreateArgs", () => {
  test("format and transfer function follow the colour space", () => {
    const srgb = ktxCreateArgs(
      { codec: "basis-lz", colorSpace: "srgb" },
      "a.png",
      "a.ktx2",
    );
    const linear = ktxCreateArgs(
      { codec: "uastc", colorSpace: "linear" },
      "b.png",
      "b.ktx2",
    );

    expect(srgb).toContain("R8G8B8A8_SRGB");
    expect(linear).toContain("R8G8B8A8_UNORM");
    expect(srgb.slice(-2)).toEqual(["a.png", "a.ktx2"]);
  });

  test("Zstandard only for UASTC: BasisLZ is already supercompressed", () => {
    expect(
      ktxCreateArgs({ codec: "uastc", colorSpace: "linear" }, "i", "o"),
    ).toContain("--zstd");
    expect(
      ktxCreateArgs({ codec: "basis-lz", colorSpace: "srgb" }, "i", "o"),
    ).not.toContain("--zstd");
  });
});

describe("limitTextures", () => {
  test(`scales textures down to ${MAX_TEXTURE_SIZE} px, keeping the aspect ratio`, async () => {
    const doc = new Document();
    const big = doc
      .createTexture("big")
      .setMimeType("image/png")
      .setImage(encodePng(2048, 512, new Uint8Array(2048 * 512 * 4)));
    const small = doc
      .createTexture("small")
      .setMimeType("image/png")
      .setImage(encodePng(64, 32, new Uint8Array(64 * 32 * 4)));

    await limitTextures(doc);

    expect(big.getSize()).toEqual([MAX_TEXTURE_SIZE, 256]);
    expect(small.getSize()).toEqual([64, 32]);
  });
});

describe("distPath", () => {
  test("assets/src → assets/dist, same name", () => {
    expect(distPath("/r/games/bridge/assets/src/builder.glb")).toBe(
      "/r/games/bridge/assets/dist/builder.glb",
    );
  });

  test("refuses files outside an assets/src folder", () => {
    expect(() => distPath("/r/games/bridge/builder.glb")).toThrow();
  });
});
