import { describe, expect, test } from "bun:test";
import {
  Bone,
  BoxGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
} from "three";
import type { EventDispatcher } from "three";

import { disposeObject } from "./assets.ts";

/** Counts "dispose" events: three fires one from every dispose() call. */
function track(...resources: EventDispatcher<{ dispose: object }>[]) {
  const calls = new Map(resources.map((resource) => [resource, 0]));
  for (const resource of resources) {
    resource.addEventListener("dispose", () => {
      calls.set(resource, (calls.get(resource) ?? 0) + 1);
    });
  }
  return calls;
}

describe("disposeObject", () => {
  test("frees shared geometry, materials and textures exactly once", () => {
    const geometry = new BoxGeometry();
    const map = new DataTexture();
    const normalMap = new DataTexture();
    const material = new MeshStandardMaterial({ map, normalMap });
    const other = new MeshBasicMaterial({ map }); // shares the texture
    const root = new Group();
    root.add(new Mesh(geometry, material), new Mesh(geometry, material));
    root.children[0]?.add(new Mesh(geometry, [material, other]));
    const calls = track(geometry, map, normalMap, material, other);

    disposeObject(root);

    expect([...calls.values()]).toEqual([1, 1, 1, 1, 1]);
  });

  test("frees skeletons: their bone textures live on the GPU", () => {
    const bone = new Bone();
    const mesh = new SkinnedMesh(new BoxGeometry(), new MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new Skeleton([bone]));
    let freed = false;
    mesh.skeleton.dispose = () => {
      freed = true;
    };

    disposeObject(mesh);

    expect(freed).toBe(true);
  });

  test("leaves objects outside the tree alone", () => {
    const kept = new MeshBasicMaterial();
    const root = new Group().add(
      new Mesh(new BoxGeometry(), new MeshBasicMaterial()),
    );
    const outside = new Mesh(new BoxGeometry(), kept);
    const calls = track(kept);

    disposeObject(root);

    expect(calls.get(kept)).toBe(0);
    expect(outside.material).toBe(kept);
  });
});
