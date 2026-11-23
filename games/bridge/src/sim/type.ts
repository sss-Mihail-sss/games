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
}

export interface Sim {
  /** One tick: TICK_RATE times a second, PHYSICS_SUBSTEPS Rapier steps inside. */
  step: (frame: InputFrame) => void;
  state: () => SimState;
  snapshot: () => SimSnapshot;
  restore: (snapshot: SimSnapshot) => void;
  /** Frees the Rapier world: WASM memory is not garbage-collected. */
  dispose: () => void;
}
