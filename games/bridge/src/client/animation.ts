import { TICK_RATE } from "../sim/index.ts";
import type { MovementMode, SimState } from "../sim/index.ts";

/** Clip names: part of every avatar model's contract (see avatar-model.ts). */
export const AVATAR_ANIMATIONS = [
  "idle",
  "walk",
  "run",
  "sneak",
  "crouch",
  "crouchWalk",
  "jump",
  "fall",
] as const;
export type AvatarAnimation = (typeof AVATAR_ANIMATIONS)[number];

/** Played once and held on the last pose; every other clip loops. */
export const ONE_SHOT_ANIMATIONS: readonly AvatarAnimation[] = ["jump"];

/** Clips that step: they play only while the avatar actually moves. */
const GAITS: readonly AvatarAnimation[] = [
  "walk",
  "run",
  "sneak",
  "crouchWalk",
];

/** What the avatar did during the last tick, in m/s. */
export interface AvatarMotion {
  /** Horizontal speed. */
  readonly speed: number;
  /** Vertical speed, positive up. */
  readonly vy: number;
  readonly grounded: boolean;
  /** How the sim moved the avatar this tick (M1-09). */
  readonly mode: MovementMode;
  /** The capsule is short: a crouch, or still under a beam after letting go. */
  readonly crouched: boolean;
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
  const { grounded, mode, crouched } = avatar;
  if (current.respawns !== previous.respawns) {
    return { speed: 0, vy: 0, grounded, mode, crouched };
  }
  return {
    speed: avatar.speed,
    vy: (avatar.y - previous.avatar.y) * TICK_RATE,
    grounded,
    mode,
    crouched,
  };
}

/**
 * A gait starts above WALK_ENTER and stops below WALK_EXIT. One threshold
 * would flicker between standing and stepping whenever the speed hovers
 * around it.
 */
export const WALK_ENTER = 0.5;
export const WALK_EXIT = 0.3;

/** Moving enough to step. Switching from one gait to another keeps the lower threshold. */
function stepping(motion: AvatarMotion, current: AvatarAnimation): boolean {
  return motion.speed > (GAITS.includes(current) ? WALK_EXIT : WALK_ENTER);
}

export interface AnimationRule {
  readonly animation: AvatarAnimation;
  /** `current` is the animation playing now, for hysteresis. */
  readonly when: (motion: AvatarMotion, current: AvatarAnimation) => boolean;
}

/**
 * Checked in order; the first rule that matches wins, so the last one must
 * always match. In the air: jump while rising, fall from the top. On the
 * ground the crouch comes first (a crouched avatar can't sprint or sneak),
 * then the gaits by the sim's mode, then walk and idle.
 */
export const ANIMATION_RULES: readonly AnimationRule[] = [
  { animation: "jump", when: (motion) => !motion.grounded && motion.vy > 0 },
  { animation: "fall", when: (motion) => !motion.grounded },
  {
    animation: "crouchWalk",
    when: (motion, current) => motion.crouched && stepping(motion, current),
  },
  { animation: "crouch", when: (motion) => motion.crouched },
  {
    animation: "run",
    when: (motion, current) =>
      motion.mode === "sprint" && stepping(motion, current),
  },
  {
    animation: "sneak",
    when: (motion, current) =>
      motion.mode === "sneak" && stepping(motion, current),
  },
  { animation: "walk", when: stepping },
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
