import { describe, expect, test } from "bun:test";

import { ALL_ABILITIES, TICK_RATE } from "../sim/index.ts";
import type { AvatarState, SimState } from "../sim/index.ts";
import {
  ANIMATION_RULES,
  motionBetween,
  nextAnimation,
  WALK_ENTER,
  WALK_EXIT,
} from "./animation.ts";
import type { AnimationRule, AvatarMotion } from "./animation.ts";

function state(avatar: Partial<AvatarState>, respawns = 0): SimState {
  return {
    tick: 0,
    respawns,
    avatar: {
      x: 0,
      y: 0,
      z: 0,
      facing: 0,
      grounded: true,
      mode: "walk",
      crouched: false,
      speed: 0,
      ...avatar,
    },
    aim: {
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 0, z: -1 },
      hit: null,
    },
    abilities: ALL_ABILITIES,
  };
}

const standing: AvatarMotion = {
  speed: 0,
  vy: 0,
  grounded: true,
  mode: "walk",
  crouched: false,
};
const moving = (speed: number): AvatarMotion => ({ ...standing, speed });
const airborne = (vy: number): AvatarMotion => ({
  ...standing,
  speed: 4,
  vy,
  grounded: false,
  mode: "air",
});
const crouching = (speed: number): AvatarMotion => ({
  ...standing,
  speed,
  mode: "crouch",
  crouched: true,
});

describe("motionBetween", () => {
  test("horizontal speed is the sim's own", () => {
    const motion = motionBetween(
      state({}),
      state({ x: 0.06, z: -0.08, speed: 3 }),
    );

    expect(motion.speed).toBe(3);
    expect(motion.vy).toBe(0);
    expect(motion.grounded).toBe(true);
  });

  test("vertical speed is signed: falling is negative", () => {
    const motion = motionBetween(
      state({ y: -1 }),
      state({ y: -1.2, grounded: false }),
    );

    expect(motion.vy).toBeCloseTo(-0.2 * TICK_RATE, 9);
    expect(motion.speed).toBe(0);
    expect(motion.grounded).toBe(false);
  });

  test("a respawn is a teleport, not a speed", () => {
    const motion = motionBetween(
      state({ x: 3, y: -6, z: 2, grounded: false }, 0),
      state({ x: -10, y: 0, z: 0, speed: 99 }, 1),
    );

    expect(motion).toEqual({
      speed: 0,
      vy: 0,
      grounded: true,
      mode: "walk",
      crouched: false,
    });
  });

  test("mode and crouch come from the sim", () => {
    const motion = motionBetween(
      state({}),
      state({ mode: "crouch", crouched: true, speed: 2 }),
    );

    expect(motion.mode).toBe("crouch");
    expect(motion.crouched).toBe(true);
  });
});

describe("nextAnimation", () => {
  test("standing on the ground is idle", () => {
    expect(nextAnimation("idle", standing)).toBe("idle");
    expect(nextAnimation("walk", standing)).toBe("idle");
    expect(nextAnimation("fall", standing)).toBe("idle");
  });

  test("moving on the ground is walk", () => {
    expect(nextAnimation("idle", moving(4))).toBe("walk");
  });

  test("off the ground and going down is fall, whatever the speed", () => {
    expect(nextAnimation("idle", airborne(-3))).toBe("fall");
    expect(nextAnimation("walk", airborne(-3))).toBe("fall");
    expect(nextAnimation("fall", { ...airborne(-3), speed: 0 })).toBe("fall");
    // The top of a jump: no longer rising.
    expect(nextAnimation("jump", airborne(0))).toBe("fall");
  });

  test("off the ground and rising is jump", () => {
    expect(nextAnimation("idle", airborne(4.6))).toBe("jump");
    expect(nextAnimation("run", airborne(4.6))).toBe("jump");
    expect(nextAnimation("crouch", airborne(4.6))).toBe("jump");
    expect(nextAnimation("jump", airborne(0.1))).toBe("jump");
  });

  test("a whole jump: rise, fall, land", () => {
    const ticks = [moving(4), airborne(4.5), airborne(2), airborne(-1)];
    const seen = [];
    let animation = nextAnimation("idle", standing);
    for (const motion of [...ticks, airborne(-4), moving(4), standing]) {
      animation = nextAnimation(animation, motion);
      seen.push(animation);
    }

    expect(seen).toEqual([
      "walk",
      "jump",
      "jump",
      "fall",
      "fall",
      "walk",
      "idle",
    ]);
  });

  test("crouched is crouch, or crouchWalk while moving", () => {
    expect(nextAnimation("idle", crouching(0))).toBe("crouch");
    expect(nextAnimation("walk", crouching(2))).toBe("crouchWalk");
    expect(nextAnimation("crouchWalk", crouching(0))).toBe("crouch");
    // Still under a beam after letting go of the key: the sim keeps it crouched.
    expect(nextAnimation("crouch", { ...crouching(0), mode: "walk" })).toBe(
      "crouch",
    );
  });

  test("sprinting is run, sneaking is sneak, but only while moving", () => {
    const sprint = (speed: number): AvatarMotion => ({
      ...moving(speed),
      mode: "sprint",
    });
    const sneak = (speed: number): AvatarMotion => ({
      ...moving(speed),
      mode: "sneak",
    });

    expect(nextAnimation("walk", sprint(6.5))).toBe("run");
    expect(nextAnimation("idle", sprint(6.5))).toBe("run");
    // Against a wall with Shift held: the sim says sprint, nothing moves.
    expect(nextAnimation("idle", sprint(0))).toBe("idle");
    expect(nextAnimation("walk", sneak(1.5))).toBe("sneak");
    expect(nextAnimation("sneak", sneak(0))).toBe("idle");
    // Letting go of Shift drops back to walk.
    expect(nextAnimation("run", moving(4))).toBe("walk");
  });

  test("going from one gait to another keeps the lower threshold", () => {
    const slow = (WALK_ENTER + WALK_EXIT) / 2;

    expect(nextAnimation("walk", { ...moving(slow), mode: "sneak" })).toBe(
      "sneak",
    );
    expect(nextAnimation("sneak", crouching(slow))).toBe("crouchWalk");
    expect(nextAnimation("idle", crouching(slow))).toBe("crouch");
  });

  test("hysteresis: walk starts above WALK_ENTER and stops below WALK_EXIT", () => {
    const between = moving((WALK_ENTER + WALK_EXIT) / 2);

    expect(nextAnimation("idle", between)).toBe("idle");
    expect(nextAnimation("walk", between)).toBe("walk");
    expect(nextAnimation("idle", moving(WALK_ENTER + 0.01))).toBe("walk");
    expect(nextAnimation("walk", moving(WALK_EXIT - 0.01))).toBe("idle");
  });

  test("speed hovering around one threshold doesn't flicker", () => {
    let animation = nextAnimation("idle", moving(4));
    const seen = new Set([animation]);
    for (const speed of [0.45, 0.55, 0.4, 0.5, 0.35, 0.6]) {
      animation = nextAnimation(animation, moving(speed));
      seen.add(animation);
    }

    expect([...seen]).toEqual(["walk"]);
  });

  test("the first matching rule wins", () => {
    const rules: AnimationRule[] = [
      { animation: "fall", when: () => true },
      ...ANIMATION_RULES,
    ];

    expect(nextAnimation("walk", moving(4), rules)).toBe("fall");
  });

  test("the last default rule always matches", () => {
    const last = ANIMATION_RULES.at(-1);

    expect(last?.when(airborne(99), "walk")).toBe(true);
  });
});
