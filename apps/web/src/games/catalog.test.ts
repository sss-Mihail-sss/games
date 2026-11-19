import { describe, expect, test } from "bun:test";

import type { GameManifest } from "@repo/game-core";

import { createCatalog } from "./catalog.ts";

/** Keeps the literal id, like defineManifest does for real games. */
const manifest = <const Id extends string>(
  id: Id,
): GameManifest & { id: Id } => ({
  id,
  title: id,
  kind: "2d",
  thumbnail: "",
});

const setup = () => createCatalog([manifest("alpha"), manifest("beta")]);

describe("createCatalog", () => {
  test("lists manifests in the given order", () => {
    expect(setup().manifests.map((m) => m.id)).toEqual(["alpha", "beta"]);
  });

  test("has() recognises known ids and rejects the rest", () => {
    const catalog = setup();

    expect(catalog.has("alpha")).toBe(true);
    expect(catalog.has("gamma")).toBe(false);
    expect(catalog.has("")).toBe(false);
    expect(catalog.has("toString")).toBe(false);
  });

  test("has() narrows a URL segment to a game id", () => {
    const catalog = setup();
    const segment: string = "beta";

    if (catalog.has(segment)) {
      const id: "alpha" | "beta" = segment;
      expect(catalog.manifest(id).id).toBe("beta");
    } else {
      throw new Error("expected beta to be known");
    }
  });

  test("rejects unknown ids at compile time", () => {
    const catalog = setup();

    // @ts-expect-error "gamma" is not in the catalog
    expect(() => catalog.manifest("gamma")).toThrow(/Unknown game id "gamma"/);
  });

  test("rejects duplicate ids", () => {
    expect(() => createCatalog([manifest("alpha"), manifest("alpha")])).toThrow(
      /Duplicate game id "alpha"/,
    );
  });
});
