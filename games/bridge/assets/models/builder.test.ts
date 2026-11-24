import { expect, test } from "bun:test";

import { BUILDER_SOURCE, buildBuilderModel, WALK_CYCLE } from "./builder.ts";

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
