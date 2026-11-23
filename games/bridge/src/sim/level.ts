import type { Rapier, World } from "./physics.ts";

/**
 * Temporary level, in metres: two banks along X with a gap between them, centred
 * on the origin, top surface at y = 0. The client builds its geometry from these
 * numbers, so the colliders are exactly where the banks are drawn.
 */
export const LEVEL = {
  gap: 10,
  bankLength: 18,
  width: 20,
  bankDepth: 4,
} as const;

/** Fixed colliders of both banks. Always created first, in this order (determinism). */
export function buildLevel(world: World, R: Rapier): void {
  for (const side of [-1, 1]) {
    const bank = world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(
        side * (LEVEL.gap / 2 + LEVEL.bankLength / 2),
        -LEVEL.bankDepth / 2,
        0,
      ),
    );
    world.createCollider(
      R.ColliderDesc.cuboid(
        LEVEL.bankLength / 2,
        LEVEL.bankDepth / 2,
        LEVEL.width / 2,
      ),
      bank,
    );
  }
}
