import { expect, test } from "bun:test";

import {
  BUILDER_SOURCE,
  buildBuilderModel,
  CROUCH_WALK_CYCLE,
  RUN_CYCLE,
  SNEAK_CYCLE,
  WALK_CYCLE,
} from "./builder.ts";

test("assets/src/builder.glb is what the generator builds now", async () => {
  const committed = new Uint8Array(
    await Bun.file(BUILDER_SOURCE).arrayBuffer(),
  );
  const fresh = await buildBuilderModel();

  // If this fails: `bun run --filter @repo/game-bridge model:builder`, then
  // `bun run assets`, and commit both .glb files.
  expect(Bun.hash(fresh)).toBe(Bun.hash(committed));
});

test("the walk cycle matches a walking pace", () => {
  // Two steps per cycle; a human walks at ~1.5–2.5 steps a second, a jog is faster.
  const stepsPerSecond = 2 / WALK_CYCLE;

  expect(stepsPerSecond).toBeGreaterThan(2);
  expect(stepsPerSecond).toBeLessThan(4.5);
});

test("the other gaits step at a believable rate", () => {
  // A sprint is ~3–4.5 steps a second; sneaking is slower than a walk; a
  // crouch walk shuffles with short quick steps.
  expect(2 / RUN_CYCLE).toBeGreaterThan(3);
  expect(2 / RUN_CYCLE).toBeLessThan(4.5);
  expect(2 / SNEAK_CYCLE).toBeLessThan(2 / WALK_CYCLE);
  expect(2 / SNEAK_CYCLE).toBeGreaterThan(1.5);
  expect(2 / CROUCH_WALK_CYCLE).toBeGreaterThan(2.5);
  expect(2 / CROUCH_WALK_CYCLE).toBeLessThan(5);
});
