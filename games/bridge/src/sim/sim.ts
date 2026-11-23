import { pitchToRadians, yawToRadians } from "@repo/game-protocol";
import type { InputFrame } from "@repo/game-protocol";

import { actions } from "./actions.ts";
import { aimRay, clampPitch, REACH } from "./aim.ts";
import { buildLevel, LEVEL } from "./level.ts";
import {
  ALL_ABILITIES,
  DEFAULT_STATS,
  groundSpeed,
  jumpVelocity,
  MOVEMENT,
  movementMode,
} from "./movement.ts";
import type { Abilities, MovementMode, MovementStats } from "./movement.ts";
import type { Rapier, World } from "./physics.ts";
import type { AimState, Sim, SimSnapshot, SimState, Vec3 } from "./type.ts";

/** Ticks per second. The server (M2) must use the same value. */
export const TICK_RATE = 30;
/**
 * Rapier steps per tick. At 1/30 a stack of planks keeps creeping for a second
 * after landing; two steps of 1/60 settle at once (M1-01).
 */
export const PHYSICS_SUBSTEPS = 2;
export const PHYSICS_DT = 1 / (TICK_RATE * PHYSICS_SUBSTEPS);

/** Metres per second; see MOVEMENT for the other modes. */
export const WALK_SPEED = MOVEMENT.walkSpeed;
export const GRAVITY = -9.81;
/** Below this the avatar has fallen off; the water is at −3.5. */
export const RESPAWN_Y = -6;

export const AVATAR_RADIUS = 0.3;
/** Total standing height: a capsule is its middle part plus two caps. */
export const AVATAR_HEIGHT = 1.7;

/** The gap the controller keeps between the capsule and the world. */
const CONTROLLER_OFFSET = 0.01;
/** How far below a sneaking avatar's next position there must be ground. */
const EDGE_PROBE = 0.5;
/** Counters stop here, so they stay small numbers forever. */
const COUNTER_CAP = 1000;

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

/** The shoulder (and so the aim and the camera) goes down with a crouch. */
export function shoulderScale(crouched: boolean): number {
  return crouched ? MOVEMENT.crouchHeight / AVATAR_HEIGHT : 1;
}

export interface SimOptions {
  /** What the player may do; everything by default. */
  abilities?: Abilities;
  /** Multipliers from the character (M1-11); all 1 by default. */
  stats?: MovementStats;
  /** Builds the static level; tests pass their own (e.g. a low beam). */
  level?: (world: World, R: Rapier) => void;
}

/**
 * The game world on Rapier. Deterministic: no clock, no randomness, objects are
 * always created in the same order (level, then avatar), so the same frames give
 * bit-identical results on the client and the server.
 */
export function createSim(R: Rapier, options: SimOptions = {}): Sim {
  const stats = options.stats ?? DEFAULT_STATS;
  let abilities = options.abilities ?? ALL_ABILITIES;

  let world = new R.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = PHYSICS_DT;
  (options.level ?? buildLevel)(world, R);

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
  // The look of the last tick; before the first one, along the spawn facing.
  let yaw: number = SPAWN.facing;
  let pitch = 0;
  let crouched = false;
  let mode: MovementMode = "walk";
  let speed = 0;
  let vx = 0;
  let vz = 0;
  let takeoffSpeed: number = MOVEMENT.walkSpeed;
  let ticksSinceGround = COUNTER_CAP;
  let ticksSinceJumpPress = COUNTER_CAP;

  /** First hit along a ray, ignoring the avatar's own capsule. */
  function cast(origin: Vec3, direction: Vec3, maxDistance: number) {
    return world.castRayAndGetNormal(
      new R.Ray(origin, direction),
      maxDistance,
      true, // a ray starting inside a collider hits it at 0: no aiming through walls
      undefined,
      undefined,
      collider,
    );
  }

  function aim(at: Vec3): AimState {
    const ray = aimRay(at, yaw, pitch, shoulderScale(crouched));
    const hit = cast(ray.origin, ray.direction, REACH);
    return {
      ...ray,
      hit: hit && {
        point: {
          x: ray.origin.x + ray.direction.x * hit.timeOfImpact,
          y: ray.origin.y + ray.direction.y * hit.timeOfImpact,
          z: ray.origin.z + ray.direction.z * hit.timeOfImpact,
        },
        normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
        distance: hit.timeOfImpact,
      },
    };
  }

  /** Resizes the capsule itself, not just the picture: you fit under a beam. */
  function setCrouched(next: boolean) {
    crouched = next;
    const height = next ? MOVEMENT.crouchHeight : AVATAR_HEIGHT;
    collider.setHalfHeight(height / 2 - AVATAR_RADIUS);
    collider.setTranslationWrtParent({ x: 0, y: height / 2, z: 0 });
  }

  /** Whether a standing capsule fits here, ignoring the avatar itself. */
  function canStand(): boolean {
    const at = body.translation();
    // Slightly slimmer than the real one, or touching the ground counts as blocked.
    const margin = CONTROLLER_OFFSET;
    const shape = new R.Capsule(
      AVATAR_HEIGHT / 2 - AVATAR_RADIUS - margin,
      AVATAR_RADIUS - margin,
    );
    let blocked = false;
    world.intersectionsWithShape(
      { x: at.x, y: at.y + AVATAR_HEIGHT / 2, z: at.z },
      { x: 0, y: 0, z: 0, w: 1 },
      shape,
      () => {
        blocked = true;
        return false; // one is enough
      },
      undefined,
      undefined,
      collider,
    );
    return !blocked;
  }

  /** Ground right below `at` (within EDGE_PROBE)? Used by sneaking. */
  function groundBelow(at: Vec3): boolean {
    const probe = { x: at.x, y: at.y + 0.3, z: at.z };
    return cast(probe, { x: 0, y: -1, z: 0 }, 0.3 + EDGE_PROBE) !== null;
  }

  function substep(dx: number, dz: number) {
    // The controller doesn't apply gravity, so we integrate it — but only in the
    // air. Pushing down while grounded makes the capsule hit the ground at the
    // start of some substeps, and those lose their horizontal movement (a hitch
    // every ~8 ticks, measured). Snap-to-ground keeps us on the ground instead,
    // and walking off an edge finds no ground within its reach, so we fall.
    vy = grounded ? 0 : vy + GRAVITY * PHYSICS_DT;
    const at = body.translation();
    let mx = dx * PHYSICS_DT;
    let mz = dz * PHYSICS_DT;
    if (mode === "sneak") {
      // Never step off an edge; check each axis so we can still walk along it.
      if (!groundBelow({ x: at.x + mx, y: at.y, z: at.z + mz })) {
        const xOnly = groundBelow({ x: at.x + mx, y: at.y, z: at.z });
        const zOnly = groundBelow({ x: at.x, y: at.y, z: at.z + mz });
        mx = xOnly ? mx : 0;
        mz = zOnly && !xOnly ? mz : 0;
      }
    }
    controller.computeColliderMovement(collider, {
      x: mx,
      y: vy * PHYSICS_DT,
      z: mz,
    });
    const move = controller.computedMovement();
    grounded = controller.computedGrounded();
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
    if (crouched) {
      setCrouched(false); // the spawn always has headroom
    }
    vy = 0;
    vx = 0;
    vz = 0;
    facing = SPAWN.facing;
    grounded = false;
    ticksSinceGround = COUNTER_CAP;
    ticksSinceJumpPress = COUNTER_CAP;
    respawns += 1;
  }

  function step(frame: InputFrame) {
    yaw = yawToRadians(frame.yaw);
    pitch = clampPitch(pitchToRadians(frame.pitch));
    const direction = walkDirection(frame);
    const held = (action: (typeof actions.list)[number]) =>
      actions.isHeld(frame, action);

    // Crouch: only on the ground; standing up needs headroom, so a released
    // key under a beam keeps the avatar down until it walks out.
    const wantCrouch = held("crouch") && abilities.crouch;
    if (grounded && wantCrouch && !crouched) {
      setCrouched(true);
    } else if (crouched && !wantCrouch && canStand()) {
      setCrouched(false);
    }

    // Jump: a buffered press plus ground now or a moment ago (coyote time).
    ticksSinceJumpPress =
      actions.wasPressed(frame, "jump") && abilities.jump
        ? 0
        : Math.min(ticksSinceJumpPress + 1, COUNTER_CAP);
    const jumped =
      abilities.jump &&
      ticksSinceJumpPress <= MOVEMENT.jumpBufferTicks &&
      (grounded || ticksSinceGround <= MOVEMENT.coyoteTicks) &&
      (!crouched || canStand());

    mode = movementMode({
      grounded,
      crouched,
      moving: direction !== null,
      sneak: held("sneak"),
      sprint: held("sprint"),
      abilities,
    });

    if (mode === "air") {
      // Keep the momentum; the keys only steer a little towards take-off speed.
      if (direction) {
        vx += (direction.dx * takeoffSpeed - vx) * MOVEMENT.airControl;
        vz += (direction.dz * takeoffSpeed - vz) * MOVEMENT.airControl;
      }
    } else {
      const ground = groundSpeed(mode, stats);
      takeoffSpeed = ground;
      vx = direction ? direction.dx * ground : 0;
      vz = direction ? direction.dz * ground : 0;
    }

    if (jumped) {
      if (crouched) {
        setCrouched(false);
      }
      vy = jumpVelocity(MOVEMENT.jumpHeight * stats.jump, GRAVITY, PHYSICS_DT);
      grounded = false;
      mode = "air";
      // Spent: no second jump from the same press or the same ledge.
      ticksSinceJumpPress = COUNTER_CAP;
      ticksSinceGround = COUNTER_CAP;
    }

    if (direction) {
      facing = Math.atan2(-direction.dx, -direction.dz);
    }

    const before = body.translation();
    for (let i = 0; i < PHYSICS_SUBSTEPS; i++) {
      substep(vx, vz);
    }
    const after = body.translation();
    const dx = after.x - before.x;
    const dz = after.z - before.z;
    speed = Math.sqrt(dx * dx + dz * dz) * TICK_RATE;
    ticksSinceGround = grounded
      ? 0
      : Math.min(ticksSinceGround + 1, COUNTER_CAP);

    if (after.y < RESPAWN_Y) {
      respawn();
    }
    tick += 1;
  }

  return {
    step,

    state: (): SimState => {
      const at = body.translation();
      return {
        tick,
        respawns,
        avatar: {
          x: at.x,
          y: at.y,
          z: at.z,
          facing,
          grounded,
          mode,
          crouched,
          speed,
        },
        aim: aim(at),
        abilities,
      };
    },

    snapshot: () => ({
      physics: world.takeSnapshot(),
      tick,
      vy,
      facing,
      grounded,
      respawns,
      yaw,
      pitch,
      crouched,
      mode,
      speed,
      vx,
      vz,
      takeoffSpeed,
      ticksSinceGround,
      ticksSinceJumpPress,
      abilities,
    }),

    restore: (snapshot: SimSnapshot) => {
      world.free();
      world = R.World.restoreSnapshot(snapshot.physics);
      world.timestep = PHYSICS_DT;
      // Handles survive a snapshot (and so does the capsule's crouched shape);
      // the character controller doesn't.
      body = world.getRigidBody(bodyHandle);
      collider = world.getCollider(colliderHandle);
      controller = createController(world);
      ({
        tick,
        vy,
        facing,
        grounded,
        respawns,
        yaw,
        pitch,
        crouched,
        mode,
        speed,
        vx,
        vz,
        takeoffSpeed,
        ticksSinceGround,
        ticksSinceJumpPress,
        abilities,
      } = snapshot);
    },

    setAbilities: (next) => {
      abilities = { ...next };
    },

    castRay: (origin, direction, maxDistance) =>
      cast(origin, direction, maxDistance)?.timeOfImpact ?? null,

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
  const length = Math.sqrt(dx * dx + dz * dz); // √2 on a diagonal: normalise it away
  return { dx: dx / length, dz: dz / length };
}
