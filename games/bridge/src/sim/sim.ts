import { yawToRadians } from "@repo/game-protocol";
import type { InputFrame } from "@repo/game-protocol";

import { actions } from "./actions.ts";
import type { SimState } from "./type.ts";

/** Ticks per second. The server (M2) must use the same value. */
export const TICK_RATE = 30;

/** Metres per second. */
export const WALK_SPEED = 4;

export const AVATAR_RADIUS = 0.3;

/**
 * Temporary level, in metres: two banks along X with a gap between them, centred
 * on the origin. The client builds its geometry from these numbers, so the walls
 * the sim enforces are exactly where the banks end.
 */
export const LEVEL = {
  gap: 10,
  bankLength: 18,
  width: 20,
} as const;

const HALF_LENGTH = LEVEL.gap / 2 + LEVEL.bankLength - AVATAR_RADIUS;
const HALF_WIDTH = LEVEL.width / 2 - AVATAR_RADIUS;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** The avatar stands on the left bank, facing the gap (+X). */
export function createInitialState(): SimState {
  return {
    avatar: {
      x: -(LEVEL.gap / 2 + LEVEL.bankLength / 2),
      z: 0,
      facing: -Math.PI / 2,
    },
  };
}

/**
 * One tick of the world. Pure: never mutates `state`, reads no clock and no
 * randomness, so the client can predict with it and the server can replay it.
 */
export function step(state: SimState, frame: InputFrame, dt: number): SimState {
  const along =
    Number(actions.isHeld(frame, "forward")) -
    Number(actions.isHeld(frame, "back"));
  const across =
    Number(actions.isHeld(frame, "right")) -
    Number(actions.isHeld(frame, "left"));

  if (along === 0 && across === 0) {
    return state;
  }

  // Movement is relative to the camera. The sim only ever sees the quantized
  // yaw, exactly as the server will, so prediction and server never drift apart.
  const yaw = yawToRadians(frame.yaw);
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // forward = (−sin, −cos), right = (cos, −sin) on the XZ plane.
  const dx = -sin * along + cos * across;
  const dz = -cos * along - sin * across;
  const length = Math.hypot(dx, dz); // √2 on a diagonal: normalise it away

  const distance = WALK_SPEED * dt;
  const { avatar } = state;

  return {
    avatar: {
      x: clamp(avatar.x + (dx / length) * distance, -HALF_LENGTH, HALF_LENGTH),
      z: clamp(avatar.z + (dz / length) * distance, -HALF_WIDTH, HALF_WIDTH),
      facing: Math.atan2(-dx, -dz),
    },
  };
}
