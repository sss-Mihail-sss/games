import { describe, expect, test } from "bun:test";

import { defineManifest } from "./manifest.ts";

const base = { title: "Bridge", kind: "3d", thumbnail: "" } as const;

describe("defineManifest", () => {
  test("returns a valid manifest unchanged", () => {
    const manifest = { ...base, id: "bridge" };

    expect(defineManifest(manifest)).toBe(manifest);
  });

  test("keeps the literal id type", () => {
    const manifest = defineManifest({ ...base, id: "bridge" });

    const id: "bridge" = manifest.id;
    expect(id).toBe("bridge");
  });

  test("rejects an id that is not a slug", () => {
    expect(() => defineManifest({ ...base, id: "Bridge asdasd" })).toThrow(
      /slug/,
    );
  });

  test("rejects minPlayers greater than maxPlayers", () => {
    expect(() =>
      defineManifest({
        ...base,
        id: "bridge",
        multiplayer: { minPlayers: 8, maxPlayers: 2, modes: [] },
      }),
    ).toThrow(/minPlayers must be <= maxPlayers/);
  });
});
