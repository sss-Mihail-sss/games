/** The screen proportions the player's FOV setting is stated for. */
const REFERENCE_ASPECT = 16 / 9;
const DEG = Math.PI / 180;

/**
 * The platform's FOV setting is horizontal at 16:9, as most games state it;
 * `PerspectiveCamera.fov` is vertical. Fixing the vertical angle and letting
 * `aspect` widen the view gives "Hor+": a wider screen sees more at the sides,
 * not less at the top and bottom.
 */
export function verticalFov(horizontalDegrees: number): number {
  const half = (horizontalDegrees * DEG) / 2;
  return (2 * Math.atan(Math.tan(half) / REFERENCE_ASPECT)) / DEG;
}
