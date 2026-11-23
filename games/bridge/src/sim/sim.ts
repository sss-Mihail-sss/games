import { yawToRadians } from "@repo/game-protocol";
import type { InputFrame } from "@repo/game-protocol";

import { actions } from "./actions.ts";
import { buildLevel, LEVEL } from "./level.ts";
import type { Rapier, World } from "./physics.ts";
import type { Sim, SimSnapshot, SimState } from "./type.ts";

/** Ticks per second. The server (M2) must use the same value. */
export const TICK_RATE = 30;
/**
 * Rapier steps per tick. At 1/30 a stack of planks keeps creeping for a second
 * after landing; two steps of 1/60 settle at once (M1-01).
 */
export const PHYSICS_SUBSTEPS = 2;
export const PHYSICS_DT = 1 / (TICK_RATE * PHYSICS_SUBSTEPS);

/** Metres per second. */
export const WALK_SPEED = 4;
export const GRAVITY = -9.81;
/** Below this the avatar has fallen off; the water is at −3.5. */
export const RESPAWN_Y = -6;

export const AVATAR_RADIUS = 0.3;
/** Total height: a capsule is its middle part plus two caps. */
export const AVATAR_HEIGHT = 1.7;

/** The gap the controller keeps between the capsule and the world. */
const CONTROLLER_OFFSET = 0.01;

/**
 * Middle of the left bank, facing the gap (+X). Feet at the controller's offset
 * above the ground: spawned at y = 0 the capsule counts as stuck in the ground,
 * gets pushed out over a second and has some walking substeps blocked meanwhile.
 */
export const SPAWN = {
  x: -(LEVEL.gap / 2 + LEVEL.bankLength / 2),
  y: CONTROLLER_OFFSET,
  z: 0,
  facing: -Math.PI / 2,
} as const;

/**
 * The game world on Rapier. Deterministic: no clock, no randomness, objects are
 * always created in the same order (level, then avatar), so the same frames give
 * bit-identical results on the client and the server.
 */
export function createSim(R: Rapier): Sim {
  let world = new R.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = PHYSICS_DT;
  buildLevel(world, R);

  // The body's origin is at the feet; the capsule sits on top of it.
  let body = world.createRigidBody(
    R.RigidBodyDesc.kinematicPositionBased().setTranslation(
      SPAWN.x,
      SPAWN.y,
      SPAWN.z,
    ),
  );
  let collider = world.createCollider(
    R.ColliderDesc.capsule(
      AVATAR_HEIGHT / 2 - AVATAR_RADIUS, // half of the cylinder part only
      AVATAR_RADIUS,
    ).setTranslation(0, AVATAR_HEIGHT / 2, 0),
    body,
  );
  const bodyHandle = body.handle;
  const colliderHandle = collider.handle;
  let controller = createController(world);

  let tick = 0;
  let vy = 0;
  let facing: number = SPAWN.facing;
  let grounded = false;
  let respawns = 0;

  function substep(dx: number, dz: number) {
    // The controller doesn't apply gravity, so we integrate it — but only in the
    // air. Pushing down while grounded makes the capsule hit the ground at the
    // start of some substeps, and those lose their horizontal movement (a hitch
    // every ~8 ticks, measured). Snap-to-ground keeps us on the ground instead,
    // and walking off an edge finds no ground within its reach, so we fall.
    vy = grounded ? 0 : vy + GRAVITY * PHYSICS_DT;
    controller.computeColliderMovement(collider, {
      x: dx * WALK_SPEED * PHYSICS_DT,
      y: vy * PHYSICS_DT,
      z: dz * WALK_SPEED * PHYSICS_DT,
    });
    const move = controller.computedMovement();
    grounded = controller.computedGrounded();
    const at = body.translation();
    body.setNextKinematicTranslation({
      x: at.x + move.x,
      y: at.y + move.y,
      z: at.z + move.z,
    });
    world.step();
    if (grounded) {
      vy = 0;
    }
  }

  function respawn() {
    // setTranslation, not setNextKinematicTranslation: a teleport must not
    // drag the capsule through the world on the way.
    body.setTranslation(SPAWN, true);
    body.setNextKinematicTranslation(SPAWN);
    vy = 0;
    facing = SPAWN.facing;
    grounded = false;
    respawns += 1;
  }

  return {
    step: (frame) => {
      const direction = walkDirection(frame);
      if (direction) {
        facing = Math.atan2(-direction.dx, -direction.dz);
      }
      for (let i = 0; i < PHYSICS_SUBSTEPS; i++) {
        substep(direction?.dx ?? 0, direction?.dz ?? 0);
      }
      if (body.translation().y < RESPAWN_Y) {
        respawn();
      }
      tick += 1;
    },

    state: (): SimState => {
      const at = body.translation();
      return {
        tick,
        respawns,
        avatar: { x: at.x, y: at.y, z: at.z, facing, grounded },
      };
    },

    snapshot: () => ({
      physics: world.takeSnapshot(),
      tick,
      vy,
      facing,
      grounded,
      respawns,
    }),

    restore: (snapshot: SimSnapshot) => {
      world.free();
      world = R.World.restoreSnapshot(snapshot.physics);
      world.timestep = PHYSICS_DT;
      // Handles survive a snapshot; the character controller doesn't.
      body = world.getRigidBody(bodyHandle);
      collider = world.getCollider(colliderHandle);
      controller = createController(world);
      ({ tick, vy, facing, grounded, respawns } = snapshot);
    },

    dispose: () => {
      world.free(); // also frees the character controller
    },
  };
}

function createController(world: World) {
  const controller = world.createCharacterController(CONTROLLER_OFFSET);
  controller.setUp({ x: 0, y: 1, z: 0 });
  controller.enableSnapToGround(0.1); // no hopping over seams
  controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
  return controller;
}

/**
 * Unit direction on the XZ plane from the held keys, relative to the camera, or
 * null when standing still. The sim only ever sees the quantized yaw, exactly as
 * the server will, so prediction and server never drift apart.
 */
function walkDirection(frame: InputFrame): { dx: number; dz: number } | null {
  const along =
    Number(actions.isHeld(frame, "forward")) -
    Number(actions.isHeld(frame, "back"));
  const across =
    Number(actions.isHeld(frame, "right")) -
    Number(actions.isHeld(frame, "left"));
  if (along === 0 && across === 0) {
    return null;
  }
  const yaw = yawToRadians(frame.yaw);
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // forward = (−sin, −cos), right = (cos, −sin) on the XZ plane.
  const dx = -sin * along + cos * across;
  const dz = -cos * along - sin * across;
  const length = Math.hypot(dx, dz); // √2 on a diagonal: normalise it away
  return { dx: dx / length, dz: dz / length };
}
