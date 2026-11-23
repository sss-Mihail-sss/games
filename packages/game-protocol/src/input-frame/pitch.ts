/**
 * Camera pitch travels as a uint16: `0…PITCH_MAX` maps to `[-π/2, π/2]`.
 * PITCH_MAX is even, so level (0 rad) is exactly `PITCH_MAX / 2` and round-trips
 * to exactly 0. Games narrow the range further in their sim (e.g. −60°…+70°).
 */
export const PITCH_MAX = 65534;

const HALF_PI = Math.PI / 2;

/**
 * Radians → wire units. Unlike yaw, pitch is clamped, not wrapped: looking 100°
 * up is not looking 80° down. Rounds to the nearest step (~0.0027°).
 */
export function quantizePitch(radians: number): number {
  if (!Number.isFinite(radians)) {
    throw new RangeError(`Pitch must be a finite number, got ${radians}`);
  }
  const clamped = Math.min(HALF_PI, Math.max(-HALF_PI, radians));
  return Math.round(((clamped + HALF_PI) / Math.PI) * PITCH_MAX);
}

/** Wire units → radians in `[-π/2, π/2]`. Positive looks up. */
export function pitchToRadians(units: number): number {
  return (units / PITCH_MAX) * Math.PI - HALF_PI;
}
