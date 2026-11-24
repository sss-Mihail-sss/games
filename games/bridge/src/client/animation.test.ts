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

const standing: AvatarMotion = { speed: 0, vy: 0, grounded: true };
const moving = (speed: number): AvatarMotion => ({ ...standing, speed });

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

    expect(motion).toEqual({ speed: 0, vy: 0, grounded: true });
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

  test("off the ground is fall, whatever the speed", () => {
    const airborne = { speed: 4, vy: -3, grounded: false };

    expect(nextAnimation("idle", airborne)).toBe("fall");
    expect(nextAnimation("walk", airborne)).toBe("fall");
    expect(nextAnimation("fall", { ...airborne, speed: 0 })).toBe("fall");
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

  test("the first matching rule wins (how M1-09 adds jump before walk)", () => {
    const rules: AnimationRule[] = [
      { animation: "fall", when: () => true },
      ...ANIMATION_RULES,
    ];

    expect(nextAnimation("walk", moving(4), rules)).toBe("fall");
  });

  test("the last default rule always matches", () => {
    const last = ANIMATION_RULES.at(-1);

    expect(last?.when({ speed: 99, vy: 99, grounded: false }, "walk")).toBe(
      true,
    );
  });
});
