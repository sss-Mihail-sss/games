import { describe, expect, mock, test } from "bun:test";

import type { GameModule } from "@repo/game-core";

import { createLoader } from "./loader.ts";

const module = (id: string): GameModule => ({
  manifest: { id, title: id, kind: "2d", thumbnail: "" },
  mount: () => Promise.resolve(() => {}),
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const loadAlpha = mock(() => Promise.resolve(module("alpha")));
  const loadBeta = mock(() => Promise.resolve(module("beta")));
  const loader = createLoader<"alpha" | "beta">({
    alpha: loadAlpha,
    beta: loadBeta,
  });
  return { loader, loadAlpha, loadBeta };
}

describe("createLoader", () => {
  test("loads nothing until asked", () => {
    const { loadAlpha, loadBeta } = setup();

    expect(loadAlpha).not.toHaveBeenCalled();
    expect(loadBeta).not.toHaveBeenCalled();
  });

  test("requires a loader for every id and rejects unknown ones", () => {
    // @ts-expect-error "beta" has no loader
    createLoader<"alpha" | "beta">({
      alpha: () => Promise.resolve(module("alpha")),
    });

    createLoader<"alpha">({
      alpha: () => Promise.resolve(module("alpha")),
      // @ts-expect-error "gamma" is not a game id
      gamma: () => Promise.resolve(module("gamma")),
    });
  });

  describe("load", () => {
    test("loads the requested game only", async () => {
      const { loader, loadAlpha, loadBeta } = setup();

      expect((await loader.load("alpha")).manifest.id).toBe("alpha");
      expect(loadAlpha).toHaveBeenCalledTimes(1);
      expect(loadBeta).not.toHaveBeenCalled();
    });

    test("concurrent calls share one request", async () => {
      const { loader, loadAlpha } = setup();

      const [a, b] = await Promise.all([
        loader.load("alpha"),
        loader.load("alpha"),
      ]);

      expect(a).toBe(b);
      expect(loadAlpha).toHaveBeenCalledTimes(1);
    });

    test("later calls reuse the loaded module", async () => {
      const { loader, loadAlpha } = setup();
      await loader.load("alpha");
      await loader.load("alpha");

      expect(loadAlpha).toHaveBeenCalledTimes(1);
    });

    test("a failed load is forgotten, so the next call retries", async () => {
      let attempt = 0;
      const load = mock(() =>
        ++attempt === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve(module("alpha")),
      );
      const loader = createLoader<"alpha">({ alpha: load });

      await expect(loader.load("alpha")).rejects.toThrow("offline");
      expect((await loader.load("alpha")).manifest.id).toBe("alpha");
      expect(load).toHaveBeenCalledTimes(2);
    });

    test("an id smuggled past the types rejects instead of throwing", async () => {
      const { loader } = setup();
      const id = "toString" as "alpha";

      await expect(loader.load(id)).rejects.toThrow(
        /Unknown game id "toString"/,
      );
    });
  });

  describe("preload", () => {
    test("starts loading so the later load is free", async () => {
      const { loader, loadAlpha } = setup();

      loader.preload("alpha");
      loader.preload("alpha");
      await loader.load("alpha");

      expect(loadAlpha).toHaveBeenCalledTimes(1);
    });

    test("swallows errors instead of producing an unhandled rejection", async () => {
      const loader = createLoader<"alpha">({
        alpha: () => Promise.reject(new Error("offline")),
      });

      expect(() => {
        loader.preload("alpha");
      }).not.toThrow();
      await flush(); // an unhandled rejection here would fail the test run
    });
  });
});
