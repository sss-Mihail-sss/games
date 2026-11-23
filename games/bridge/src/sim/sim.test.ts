import { describe, expect, test } from "bun:test";

import { quantizeYaw } from "@repo/game-protocol";
import type { InputFrame } from "@repo/game-protocol";

import { actions } from "./actions.ts";
import type { Action } from "./actions.ts";
import {
  AVATAR_RADIUS,
  createInitialState,
  LEVEL,
  step,
  TICK_RATE,
  WALK_SPEED,
} from "./sim.ts";
import type { SimState } from "./type.ts";

const DT = 1 / TICK_RATE;
const STRIDE = WALK_SPEED * DT; // distance of one tick

/** A frame with these actions held and the camera turned by `yawRadians`. */
const frame = (held: Action[] = [], yawRadians = 0, tick = 0): InputFrame => ({
  tick,
  held: held.reduce((mask, action) => (mask | actions.bit(action)) >>> 0, 0),
  pressed: 0,
  released: 0,
  yaw: quantizeYaw(yawRadians),
});

/** Avatar at the origin, looking along −Z, deep-frozen to catch mutation. */
const origin = (): SimState =>
  Object.freeze({ avatar: Object.freeze({ x: 0, z: 0, facing: 0 }) });

const run = (state: SimState, input: InputFrame, ticks: number) => {
  let next = state;
  for (let i = 0; i < ticks; i++) {
    next = step(next, input, DT);
  }
  return next;
};

const travelled = (from: SimState, to: SimState) =>
  Math.hypot(to.avatar.x - from.avatar.x, to.avatar.z - from.avatar.z);

describe("step", () => {
  test("no input changes nothing, not even facing", () => {
    const state = Object.freeze({
      avatar: Object.freeze({ x: 1, z: 2, facing: 1.25 }),
    });

    expect(step(state, frame(), DT)).toEqual(state);
  });

  test("forward at yaw 0 moves exactly one stride along −Z", () => {
    const next = step(origin(), frame(["forward"]), DT);

    expect(next.avatar.x).toBeCloseTo(0, 12);
    expect(next.avatar.z).toBeCloseTo(-STRIDE, 12);
  });

  test.each([
    ["back", 0, STRIDE],
    ["left", -STRIDE, 0],
    ["right", STRIDE, 0],
  ] as const)("%s at yaw 0 moves along its axis", (action, x, z) => {
    const next = step(origin(), frame([action]), DT);

    expect(next.avatar.x).toBeCloseTo(x, 12);
    expect(next.avatar.z).toBeCloseTo(z, 12);
  });

  test("a diagonal is not faster than a straight line", () => {
    const straight = step(origin(), frame(["forward"]), DT);
    const diagonal = step(origin(), frame(["forward", "right"]), DT);

    expect(travelled(origin(), diagonal)).toBeCloseTo(
      travelled(origin(), straight),
      12,
    );
    expect(diagonal.avatar.x).toBeGreaterThan(0);
    expect(diagonal.avatar.z).toBeLessThan(0);
  });

  test("opposite keys cancel out", () => {
    const state = origin();

    expect(step(state, frame(["forward", "back"]), DT)).toEqual(state);
    expect(step(state, frame(["left", "right"]), DT)).toEqual(state);
  });

  test("forward follows the camera: at yaw π/2 it moves along −X", () => {
    const next = step(origin(), frame(["forward"], Math.PI / 2), DT);

    expect(next.avatar.x).toBeCloseTo(-STRIDE, 6);
    expect(next.avatar.z).toBeCloseTo(0, 6);
  });

  test("the avatar turns to face where it walks", () => {
    expect(step(origin(), frame(["forward"]), DT).avatar.facing).toBeCloseTo(
      0,
      12,
    );
    // Walking towards +X (right at yaw 0) means looking at −π/2.
    expect(step(origin(), frame(["right"]), DT).avatar.facing).toBeCloseTo(
      -Math.PI / 2,
      12,
    );
  });

  test("walking into a wall stops at the edge of the level", () => {
    const farRight = run(origin(), frame(["right"]), 30 * TICK_RATE);
    const farForward = run(origin(), frame(["forward"]), 30 * TICK_RATE);

    expect(farRight.avatar.x).toBe(
      LEVEL.gap / 2 + LEVEL.bankLength - AVATAR_RADIUS,
    );
    expect(farForward.avatar.z).toBe(-(LEVEL.width / 2 - AVATAR_RADIUS));
  });

  test("never mutates the given state", () => {
    const state = origin(); // frozen: a write would throw in strict mode

    expect(() => step(state, frame(["forward", "left"]), DT)).not.toThrow();
    expect(state).toEqual({ avatar: { x: 0, z: 0, facing: 0 } });
  });

  test("the same frames give the same result", () => {
    const keys: Action[][] = [
      ["forward"],
      ["forward", "right"],
      [],
      ["back", "left"],
    ];
    const frames = Array.from({ length: 200 }, (_, tick) =>
      frame(keys[tick % keys.length], tick * 0.05, tick),
    );
    const replay = () =>
      frames.reduce(
        (state, input) => step(state, input, DT),
        createInitialState(),
      );

    expect(replay()).toEqual(replay());
  });
});

describe("createInitialState", () => {
  test("starts on the left bank, facing the gap", () => {
    const { avatar } = createInitialState();

    expect(avatar.x).toBeLessThan(-LEVEL.gap / 2);
    expect(avatar.z).toBe(0);
    // Facing −π/2 looks along +X, towards the gap.
    expect(-Math.sin(avatar.facing)).toBeCloseTo(1, 12);
  });
});
