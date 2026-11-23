/**
 * Camera yaw travels as a uint16: `0…YAW_STEPS - 1` maps to `[0, 2π)`.
 * The codec writes this field with setUint16, so both share this constant.
 */
export const YAW_STEPS = 65536;

const TURN = 2 * Math.PI;

/**
 * Radians → wire units. Any finite angle wraps into range, so `-π/2` and `3π/2`
 * give the same value and `2π` gives `0`. Rounds to the nearest step, so the
 * error is at most half a step (`π / YAW_STEPS`, about 0.003°).
 */
export function quantizeYaw(radians: number): number {
  if (!Number.isFinite(radians)) {
    // NaN would become a silent 0 on the wire and send the avatar the wrong way.
    throw new RangeError(`Yaw must be a finite number, got ${radians}`);
  }

  const turns = radians / TURN;
  const fraction = turns - Math.floor(turns); // [0, 1)
  // A fraction just below 1 rounds up to YAW_STEPS, which is the same angle as 0.
  return Math.round(fraction * YAW_STEPS) % YAW_STEPS;
}

/** Wire units → radians in `[0, 2π)`. The sim always uses this, never the raw camera angle. */
export function yawToRadians(units: number): number {
  return (units / YAW_STEPS) * TURN;
}
