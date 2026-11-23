import type { InputFrame } from "@repo/game-protocol";

export interface AvatarState {
  /** Metres, at the avatar's feet. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /**
   * Where the avatar looks, radians around Y in `[-π, π]` (atan2 gives −π for
   * walking straight along +Z). Same convention as the camera yaw: 0 looks
   * along −Z, positive turns counter-clockwise seen from above.
   */
  readonly facing: number;
  /** Standing on something at the end of the last tick. */
  readonly grounded: boolean;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Where the player is aiming: a ray from behind the avatar's shoulder along the
 * camera's yaw and pitch. The client puts its camera on this same ray, so the
 * screen centre is exactly this ray, and the server (M2) sees what the player sees.
 */
export interface AimState {
  readonly origin: Vec3;
  /** Unit vector. */
  readonly direction: Vec3;
  /** The first thing within REACH, if any. */
  readonly hit: {
    readonly point: Vec3;
    readonly normal: Vec3;
    readonly distance: number;
  } | null;
}

/** Plain numbers for rendering and tests: a new object every tick. */
export interface SimState {
  /** Ticks simulated so far. */
  readonly tick: number;
  /**
   * How many times the avatar was put back at the spawn. When it changes, the
   * renderer must snap instead of interpolating across the map.
   */
  readonly respawns: number;
  readonly avatar: AvatarState;
  readonly aim: AimState;
}

/**
 * Everything the next tick depends on: Rapier's world plus the game state that
 * lives outside it. Restoring it and replaying the same frames gives the same
 * result; client-side prediction rollback (M2) relies on that.
 */
export interface SimSnapshot {
  readonly physics: Uint8Array;
  readonly tick: number;
  readonly vy: number;
  readonly facing: number;
  readonly grounded: boolean;
  readonly respawns: number;
  /** Look direction of the last tick, radians (yaw wrapped, pitch clamped). */
  readonly yaw: number;
  readonly pitch: number;
}

export interface Sim {
  /** One tick: TICK_RATE times a second, PHYSICS_SUBSTEPS Rapier steps inside. */
  step: (frame: InputFrame) => void;
  state: () => SimState;
  snapshot: () => SimSnapshot;
  restore: (snapshot: SimSnapshot) => void;
  /**
   * Read-only ray query that ignores the avatar, e.g. for the camera's spring
   * arm. Returns the distance to the first hit, or null. Doesn't change the world.
   */
  castRay: (
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
  ) => number | null;
  /** Frees the Rapier world: WASM memory is not garbage-collected. */
  dispose: () => void;
}
