/**
 * Checks the shipped files, not code: every model in AVATAR_MODELS must follow
 * decision 8 (metres, feet at the origin, forward −Z), be optimized by
 * `bun run assets` and have the clips the client plays.
 */
import { describe, expect, test } from "bun:test";

import { NodeIO } from "@gltf-transform/core";
import type { Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

import { AVATAR_HEIGHT } from "../sim/index.ts";
import { AVATAR_ANIMATIONS } from "./animation.ts";
import { AVATAR_MODELS } from "./avatar-model.ts";

type Mat4 = number[]; // column-major, as glTF stores it

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = Array.from({ length: 16 }, () => 0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        out[column * 4 + row]! += a[k * 4 + row]! * b[column * 4 + k]!;
      }
    }
  }
  return out;
}

function transform(m: Mat4, [x, y, z]: number[]): number[] {
  return [0, 1, 2].map(
    (row) => m[row]! * x! + m[4 + row]! * y! + m[8 + row]! * z! + m[12 + row]!,
  );
}

/**
 * Vertex positions as the renderer shows them in the bind pose: skinned by
 * joint world matrix × inverse bind matrix. This also undoes meshopt's
 * quantization, which for skinned meshes lives in the inverse bind matrices.
 */
function bindPosePositions(doc: Document): number[][] {
  const positions: number[][] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh === null) {
      continue;
    }
    const skin = node.getSkin();
    const joints = skin?.listJoints() ?? [];
    const inverseBind = skin?.getInverseBindMatrices();
    const skinning = joints.map((joint, j) =>
      multiply(
        Array.from(joint.getWorldMatrix()),
        inverseBind?.getElement(j, []) ?? [],
      ),
    );
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      const jointIndices = primitive.getAttribute("JOINTS_0");
      const weights = primitive.getAttribute("WEIGHTS_0");
      for (let i = 0; i < (position?.getCount() ?? 0); i++) {
        const local = position?.getElement(i, []) ?? [];
        if (skin === null || jointIndices === null || weights === null) {
          positions.push(transform(Array.from(node.getWorldMatrix()), local));
          continue;
        }
        const index = jointIndices.getElement(i, []);
        const weight = weights.getElement(i, []);
        const sum = [0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const matrix = skinning[index[k]!];
          if (weight[k]! > 0 && matrix !== undefined) {
            transform(matrix, local).forEach((value, axis) => {
              sum[axis]! += value * weight[k]!;
            });
          }
        }
        positions.push(sum);
      }
    }
  }
  return positions;
}

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });

describe.each(Object.entries(AVATAR_MODELS))("avatar model %s", (_, url) => {
  test("is optimized: meshopt geometry, KTX2 textures", async () => {
    const doc = await io.read(url.pathname);
    const required = doc
      .getRoot()
      .listExtensionsRequired()
      .map((extension) => extension.extensionName);

    expect(required).toContain("EXT_meshopt_compression");
    expect(required).toContain("KHR_texture_basisu");
    for (const texture of doc.getRoot().listTextures()) {
      expect(texture.getMimeType()).toBe("image/ktx2");
    }
  });

  test("has the clips the client plays", async () => {
    const doc = await io.read(url.pathname);
    const names = doc
      .getRoot()
      .listAnimations()
      .map((animation) => animation.getName());

    for (const name of AVATAR_ANIMATIONS) {
      expect(names).toContain(name);
    }
  });

  test("stands on the origin, as tall as the collider, facing −Z", async () => {
    const doc = await io.read(url.pathname);
    const positions = bindPosePositions(doc);
    const min = [0, 1, 2].map((axis) =>
      Math.min(...positions.map((p) => p[axis]!)),
    );
    const max = [0, 1, 2].map((axis) =>
      Math.max(...positions.map((p) => p[axis]!)),
    );

    // Feet on the ground, within a centimetre.
    expect(Math.abs(min[1]!)).toBeLessThan(0.01);
    // Metres, and about the capsule's height (a hat may stick out a little).
    expect(Math.abs(max[1]! - AVATAR_HEIGHT)).toBeLessThan(0.1);
    // Centred on the origin, not standing beside the collider.
    expect(Math.abs(min[0]! + max[0]!)).toBeLessThan(0.05);
    // Toes and the face reach further forward (−Z) than the back does.
    expect(-min[2]!).toBeGreaterThan(max[2]! + 0.03);
  });
});
