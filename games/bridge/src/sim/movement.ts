/** Base movement numbers: metres, metres per second, ticks. Balance lives here. */
export const MOVEMENT = {
  walkSpeed: 4,
  sprintSpeed: 6.5,
  crouchSpeed: 2,
  sneakSpeed: 1.5,
  /** Peak height of a jump, metres. */
  jumpHeight: 1.1,
  /** A jump still works this many ticks after walking off an edge (~100 ms). */
  coyoteTicks: 3,
  /** A press this many ticks before landing still jumps on landing. */
  jumpBufferTicks: 3,
  /** Total capsule height while crouching. */
  crouchHeight: 1.1,
  /** Share of the way to the wanted air velocity per tick: a little steering. */
  airControl: 0.1,
} as const;

/**
 * Multipliers on MOVEMENT, e.g. from the chosen character (M1-11). All 1 by
 * default, so balance is tuned in one place.
 */
export interface MovementStats {
  readonly speed: number;
  readonly sprint: number;
  readonly jump: number;
}

export const DEFAULT_STATS: MovementStats = Object.freeze({
  speed: 1,
  sprint: 1,
  jump: 1,
});

/**
 * What this player may do. The sim ignores a disabled action as if the key
 * wasn't pressed: that is the protection, the client only shows hints.
 */
export interface Abilities {
  readonly jump: boolean;
  readonly sprint: boolean;
  readonly crouch: boolean;
  readonly sneak: boolean;
}

export const ALL_ABILITIES: Abilities = Object.freeze({
  jump: true,
  sprint: true,
  crouch: true,
  sneak: true,
});

export type MovementMode = "walk" | "sprint" | "crouch" | "sneak" | "air";

/** One mode per tick, by priority: air, crouch, sneak, sprint, walk. */
export function movementMode({
  grounded,
  crouched,
  moving,
  sneak,
  sprint,
  abilities,
}: {
  grounded: boolean;
  crouched: boolean;
  moving: boolean;
  sneak: boolean;
  sprint: boolean;
  abilities: Abilities;
}): MovementMode {
  if (!grounded) {
    return "air";
  }
  if (crouched) {
    return "crouch";
  }
  if (sneak && abilities.sneak) {
    return "sneak";
  }
  if (sprint && moving && abilities.sprint) {
    return "sprint";
  }
  return "walk";
}

/** Ground speed of a mode, metres per second. In the air it's the take-off speed. */
export function groundSpeed(
  mode: Exclude<MovementMode, "air">,
  stats: MovementStats,
): number {
  switch (mode) {
    case "sprint":
      return MOVEMENT.sprintSpeed * stats.speed * stats.sprint;
    case "crouch":
      return MOVEMENT.crouchSpeed * stats.speed;
    case "sneak":
      return MOVEMENT.sneakSpeed * stats.speed;
    case "walk":
      return MOVEMENT.walkSpeed * stats.speed;
  }
}

/**
 * Take-off speed for a jump of `height` metres. Not just √(2gh): gravity is
 * applied per substep before each move (semi-implicit Euler), which loses
 * about v·dt/2 of height. Solving h = v²/2g − v·dt/2 for v makes the peak land
 * on `height`.
 */
export function jumpVelocity(height: number, gravity: number, dt: number) {
  const g = Math.abs(gravity);
  const half = (g * dt) / 2;
  return half + Math.sqrt(half * half + 2 * g * height);
}
