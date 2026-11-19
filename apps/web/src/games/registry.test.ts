import { describe, expect, mock, test } from "bun:test";

import type { GameManifest, GameModule } from "@repo/game-core";

import { createRegistry } from "./registry.ts";

/** Keeps the literal id, like defineManifest does for real games. */
const manifest = <const Id extends string>(
  id: Id,
): GameManifest & { id: Id } => ({
  id,
  title: id,
  kind: "2d",
  thumbnail: "",
});

const module = (id: string): GameModule => ({
  manifest: manifest(id),
  mount: () => Promise.resolve(() => {}),
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const loadAlpha = mock(() => Promise.resolve(module("alpha")));
  const loadBeta = mock(() => Promise.resolve(module("beta")));
  const registry = createRegistry([
    { manifest: manifest("alpha"), load: loadAlpha },
    { manifest: manifest("beta"), load: loadBeta },
  ]);
  return { registry, loadAlpha, loadBeta };
}

describe("createRegistry", () => {
  test("lists manifests in the given order without loading any game", () => {
    const { registry, loadAlpha, loadBeta } = setup();

    expect(registry.manifests.map((m) => m.id)).toEqual(["alpha", "beta"]);
    expect(loadAlpha).not.toHaveBeenCalled();
    expect(loadBeta).not.toHaveBeenCalled();
  });

  test("has() recognises known ids and rejects the rest", () => {
    const { registry } = setup();

    expect(registry.has("alpha")).toBe(true);
    expect(registry.has("gamma")).toBe(false);
    expect(registry.has("")).toBe(false);
  });

  test("has() narrows a URL segment to a game id", () => {
    const { registry } = setup();
    const segment: string = "beta";

    if (registry.has(segment)) {
      const id: "alpha" | "beta" = segment;
      expect(registry.manifest(id).id).toBe("beta");
    } else {
      throw new Error("expected beta to be known");
    }
  });

  test("rejects unknown ids at compile time", () => {
    const { registry } = setup();

    // @ts-expect-error "gamma" is not in the registry
    expect(() => registry.manifest("gamma")).toThrow(/Unknown game id "gamma"/);
  });

  test("rejects duplicate ids", () => {
    expect(() =>
      createRegistry([
        {
          manifest: manifest("alpha"),
          load: () => Promise.resolve(module("alpha")),
        },
        {
          manifest: manifest("alpha"),
          load: () => Promise.resolve(module("alpha")),
        },
      ]),
    ).toThrow(/Duplicate game id "alpha"/);
  });

  describe("load", () => {
    test("loads the requested game only", async () => {
      const { registry, loadAlpha, loadBeta } = setup();

      expect((await registry.load("alpha")).manifest.id).toBe("alpha");
      expect(loadAlpha).toHaveBeenCalledTimes(1);
      expect(loadBeta).not.toHaveBeenCalled();
    });

    test("concurrent calls share one request", async () => {
      const { registry, loadAlpha } = setup();

      const [a, b] = await Promise.all([
        registry.load("alpha"),
        registry.load("alpha"),
      ]);

      expect(a).toBe(b);
      expect(loadAlpha).toHaveBeenCalledTimes(1);
    });

    test("later calls reuse the loaded module", async () => {
      const { registry, loadAlpha } = setup();
      await registry.load("alpha");
      await registry.load("alpha");

      expect(loadAlpha).toHaveBeenCalledTimes(1);
    });

    test("a failed load is forgotten, so the next call retries", async () => {
      let attempt = 0;
      const load = mock(() =>
        ++attempt === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve(module("alpha")),
      );
      const registry = createRegistry([{ manifest: manifest("alpha"), load }]);

      await expect(registry.load("alpha")).rejects.toThrow("offline");
      expect((await registry.load("alpha")).manifest.id).toBe("alpha");
      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  describe("preload", () => {
    test("starts loading so the later load is free", async () => {
      const { registry, loadAlpha } = setup();

      registry.preload("alpha");
      registry.preload("alpha");
      await registry.load("alpha");

      expect(loadAlpha).toHaveBeenCalledTimes(1);
    });

    test("swallows errors instead of producing an unhandled rejection", async () => {
      const registry = createRegistry([
        {
          manifest: manifest("alpha"),
          load: () => Promise.reject(new Error("offline")),
        },
      ]);

      expect(() => registry.preload("alpha")).not.toThrow();
      await flush(); // an unhandled rejection here would fail the test run
    });
  });
});
