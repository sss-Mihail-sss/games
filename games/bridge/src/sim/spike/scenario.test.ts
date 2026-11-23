import { beforeAll, describe, expect, test } from "bun:test";

import RapierCompat from "@dimforge/rapier3d-compat";
import RapierDeterministic from "@dimforge/rapier3d-deterministic-compat";

import { buildWorld, runScenario, worldHash } from "./scenario.ts";
import type { Rapier } from "./scenario.ts";

/**
 * Golden hashes, recorded with Bun on macOS arm64 (M1-01). CI checks them on
 * Linux x64: same Rapier version + same inputs + same creation order must give
 * bit-identical physics, or client prediction and the server will drift (M2).
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

// Both builds have one API; their declarations are separate copies, hence the cast.
const BUILDS = [
  ["compat", RapierCompat as Rapier],
  ["deterministic-compat", RapierDeterministic as unknown as Rapier],
] as const;

/** The WASM memory of each build, caught when its module is instantiated. */
const memories: WebAssembly.Memory[] = [];

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
    const memory = instance.exports["memory"];
    if (memory instanceof WebAssembly.Memory) {
      memories.push(memory);
    }
    return result;
  }) as typeof WebAssembly.instantiate;
  try {
    for (const [, R] of BUILDS) {
      await R.init();
    }
  } finally {
    WebAssembly.instantiate = instantiate;
  }
});

describe.each(BUILDS)("%s", (_, R) => {
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
  const cycle = (R: Rapier) => {
    const { world } = buildWorld(R, 1 / 30);
    for (let i = 0; i < 60; i++) {
      world.step();
    }
    world.free();
  };

  test.each(BUILDS.map(([name, R], i) => [name, R, i] as const))(
    "%s: 20 build/free cycles don't grow memory",
    (_, R, i) => {
      const memory = memories[i];
      expect(memory).toBeInstanceOf(WebAssembly.Memory);
      cycle(R); // warm-up: the first world grows the heap once
      const before = memory!.buffer.byteLength;
      for (let n = 0; n < 20; n++) {
        cycle(R);
      }
      expect(memory!.buffer.byteLength).toBe(before);
    },
  );
});
