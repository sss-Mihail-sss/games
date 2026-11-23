const TURN = 2 * Math.PI;

export function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

/**
 * Interpolates an angle along the shortest arc: 350° → 10° turns 20° forward,
 * not 340° back.
 */
export function lerpAngle(from: number, to: number, alpha: number): number {
  let delta = (to - from) % TURN; // (−2π, 2π)
  if (delta > Math.PI) {
    delta -= TURN;
  } else if (delta < -Math.PI) {
    delta += TURN;
  }
  return from + delta * alpha;
}
