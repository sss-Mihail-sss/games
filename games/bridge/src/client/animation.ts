import { TICK_RATE } from "../sim/index.ts";
import type { SimState } from "../sim/index.ts";

/** Clip names: part of every avatar model's contract (see avatar-model.ts). */
export const AVATAR_ANIMATIONS = ["idle", "walk", "fall"] as const;
export type AvatarAnimation = (typeof AVATAR_ANIMATIONS)[number];

/** What the avatar did during the last tick, in m/s. */
export interface AvatarMotion {
  /** Horizontal speed. */
  readonly speed: number;
  /** Vertical speed, positive up. */
  readonly vy: number;
  readonly grounded: boolean;
}

/**
 * Motion from two neighbouring sim states, one tick apart. Horizontal speed
 * comes from the sim itself (`avatar.speed`, M1-09); vertical speed from the
 * change in height. A respawn is a teleport, not a speed: on that tick the
 * avatar is standing still.
 */
export function motionBetween(
  previous: SimState,
  current: SimState,
): AvatarMotion {
  const { avatar } = current;
  if (current.respawns !== previous.respawns) {
    return { speed: 0, vy: 0, grounded: avatar.grounded };
  }
  return {
    speed: avatar.speed,
    vy: (avatar.y - previous.avatar.y) * TICK_RATE,
    grounded: avatar.grounded,
  };
}

/**
 * Walk starts above WALK_ENTER and stops below WALK_EXIT. One threshold would
 * flicker between idle and walk whenever the speed hovers around it.
 */
export const WALK_ENTER = 0.5;
export const WALK_EXIT = 0.3;

export interface AnimationRule {
  readonly animation: AvatarAnimation;
  /** `current` is the animation playing now, for hysteresis. */
  readonly when: (motion: AvatarMotion, current: AvatarAnimation) => boolean;
}

/**
 * Checked in order; the first rule that matches wins, so the last one must
 * always match. Movement abilities (M1-09) come in as rules before `walk`:
 * `jump` (airborne and rising), `crouch` and `run`, with the fields they need
 * added to AvatarMotion from SimState.
 */
export const ANIMATION_RULES: readonly AnimationRule[] = [
  { animation: "fall", when: (motion) => !motion.grounded },
  {
    animation: "walk",
    when: (motion, current) =>
      motion.speed > (current === "walk" ? WALK_EXIT : WALK_ENTER),
  },
  { animation: "idle", when: () => true },
];

/** One step of the state machine; call it once per sim tick. */
export function nextAnimation(
  current: AvatarAnimation,
  motion: AvatarMotion,
  rules: readonly AnimationRule[] = ANIMATION_RULES,
): AvatarAnimation {
  return rules.find((rule) => rule.when(motion, current))?.animation ?? current;
}
