import type { Vec3 } from "./type.ts";

const DEG = Math.PI / 180;

/** The sim clamps pitch: a modified client could send any uint16 (M2). */
export const PITCH_LIMITS = [-60 * DEG, 70 * DEG] as const;

/** How far the avatar can reach with hands and tools, metres. */
export const REACH = 4;

/**
 * The aim pivot relative to the avatar's feet: shoulder height, and a step to
 * the right so the avatar doesn't block the view ("over the shoulder").
 */
export const SHOULDER = { height: 1.6, side: 0.6 } as const;

export function clampPitch(pitch: number): number {
  return Math.min(PITCH_LIMITS[1], Math.max(PITCH_LIMITS[0], pitch));
}

/**
 * The aim ray for feet at `at`, looking along `yaw` (0 = −Z, positive turns
 * left) and `pitch` (positive = up). Pure: the client's camera uses the very
 * same function, so the crosshair and the sim agree exactly.
 */
export function aimRay(
  at: Vec3,
  yaw: number,
  pitch: number,
): { origin: Vec3; direction: Vec3 } {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const flat = Math.cos(pitch);
  return {
    origin: {
      // right = (cos, 0, −sin), as in walking.
      x: at.x + cos * SHOULDER.side,
      y: at.y + SHOULDER.height,
      z: at.z - sin * SHOULDER.side,
    },
    // forward = (−sin, 0, −cos), tilted up by pitch.
    direction: { x: -sin * flat, y: Math.sin(pitch), z: -cos * flat },
  };
}
