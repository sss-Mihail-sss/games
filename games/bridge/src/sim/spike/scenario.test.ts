import { beforeAll, describe, expect, test } from "bun:test";

import RAPIER from "@dimforge/rapier3d-deterministic-compat";

import { buildWorld, runScenario, worldHash } from "./scenario.ts";

/**
 * Golden hashes, recorded with Bun on macOS arm64 (M1-01) and matched by Bun on
 * Linux x64 (CI) and Chromium on macOS. Same Rapier version + same inputs + same
 * creation order must give bit-identical physics, or client prediction and the
 * server will drift (M2).
 * If a Rapier upgrade changes them, that's a decision, not a test to "fix".
 */
const GOLDEN = {
  "600 steps at 1/30": "b54c35a0",
  "1200 steps at 1/60": "e044da51",
} as const;

const RUNS = [
  ["600 steps at 1/30", 600, 1 / 30],
  ["1200 steps at 1/60", 1200, 1 / 60],
] as const;

/** Rapier's WASM memory, caught when its module is instantiated. */
let memory: WebAssembly.Memory | undefined;

beforeAll(async () => {
  const instantiate = WebAssembly.instantiate.bind(WebAssembly);
  WebAssembly.instantiate = (async (
    ...args: Parameters<typeof instantiate>
  ) => {
    // From a Module it resolves to an Instance, from bytes to { module, instance }.
    const result = (await instantiate(...args)) as
      WebAssembly.Instance | WebAssembly.WebAssemblyInstantiatedSource;
    const instance =
      result instanceof WebAssembly.Instance ? result : result.instance;
    const wasmMemory = instance.exports["memory"];
    if (wasmMemory instanceof WebAssembly.Memory) {
      memory = wasmMemory;
    }
    return result;
  }) as typeof WebAssembly.instantiate;
  try {
    await RAPIER.init();
  } finally {
    WebAssembly.instantiate = instantiate;
  }
});

describe("scenario", () => {
  const R = RAPIER;
  test.each(RUNS)("%s matches the golden hash", (name, steps, dt) => {
    expect(runScenario(R, { steps, dt }).hash).toBe(GOLDEN[name]);
  });

  test("restoring a snapshot and replaying gives the same state", () => {
    const original = buildWorld(R, 1 / 30);
    let restored: ReturnType<typeof buildWorld> | undefined;
    try {
      for (let i = 0; i < 300; i++) {
        original.world.step();
      }
      const snapshot = original.world.takeSnapshot();
      for (let i = 0; i < 300; i++) {
        original.world.step();
      }

      restored = {
        world: R.World.restoreSnapshot(snapshot),
        planks: original.planks, // handles survive the snapshot
      };
      for (let i = 0; i < 300; i++) {
        restored.world.step();
      }

      expect(worldHash(restored)).toBe(worldHash(original));
    } finally {
      original.world.free();
      restored?.world.free();
    }
  });
});

describe("WASM memory", () => {
  const cycle = () => {
    const { world } = buildWorld(RAPIER, 1 / 30);
    for (let i = 0; i < 60; i++) {
      world.step();
    }
    world.free();
  };

  test("20 build/free cycles don't grow it", () => {
    expect(memory).toBeInstanceOf(WebAssembly.Memory);
    cycle(); // warm-up: the first world grows the heap once
    const before = memory!.buffer.byteLength;
    for (let n = 0; n < 20; n++) {
      cycle();
    }
    // Without world.free() this grows ~0.5 MB per world (measured in M1-01).
    expect(memory!.buffer.byteLength).toBe(before);
  });
});
