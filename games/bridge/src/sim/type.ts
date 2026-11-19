export interface AvatarState {
  /** Metres. The avatar always stands at y = 0: there is no physics yet (M1). */
  readonly x: number;
  readonly z: number;
  /**
   * Where the avatar looks, radians around Y in `[-π, π]` (atan2 gives −π for
   * walking straight along +Z). Same convention as the
   * camera yaw: 0 looks along −Z, positive turns counter-clockwise seen from above.
   */
  readonly facing: number;
}

export interface SimState {
  readonly avatar: AvatarState;
}
