export interface AvatarState {
  /** Metres. The avatar always stands at y = 0: there is no physics yet (M1). */
  readonly x: number;
  readonly z: number;
  /**
   * Where the avatar looks, radians around Y in `(-π, π]`. Same convention as the
   * camera yaw: 0 looks along −Z, positive turns counter-clockwise seen from above.
   */
  readonly facing: number;
}

export interface SimState {
  readonly avatar: AvatarState;
}
