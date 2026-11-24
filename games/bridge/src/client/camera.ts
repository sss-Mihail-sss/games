import { PerspectiveCamera, Vector3 } from "three";

import { aimRay } from "../sim/index.ts";
import type { Sim, Vec3 } from "../sim/index.ts";

/** Metres from the aim pivot (behind the shoulder) back to the camera. */
export const CAMERA_DISTANCE = 3.5;
/** How far in front of a wall the camera stops, and how close it may come. */
const WALL_MARGIN = 0.2;
const MIN_DISTANCE = 0.3;

export interface ShoulderCamera {
  camera: PerspectiveCamera;
  /**
   * Puts the camera on the aim ray, behind the pivot, looking along it: the
   * screen centre is then exactly the sim's aim. Call every frame with the
   * interpolated feet position and the live look from the input.
   */
  follow: (
    feet: Vec3,
    yaw: number,
    pitch: number,
    /** `shoulderScale(crouched)`, smoothed by the caller. */
    heightScale: number,
    castRay: Sim["castRay"],
  ) => void;
}

/**
 * Third-person camera over the right shoulder. It doesn't own its rotation:
 * yaw and pitch come from the input (mouse), which also puts them into every
 * InputFrame, so the sim aims along the very same ray (see `aimRay`).
 */
export function createShoulderCamera(): ShoulderCamera {
  // A short near plane: the spring arm may bring the camera close to walls.
  const camera = new PerspectiveCamera(60, 1, 0.05, 300);
  const target = new Vector3(); // reused: follow() runs every frame

  return {
    camera,
    follow: (feet, yaw, pitch, heightScale, castRay) => {
      const { origin, direction } = aimRay(feet, yaw, pitch, heightScale);
      const back = { x: -direction.x, y: -direction.y, z: -direction.z };

      // Spring arm: if the bank is between the pivot and the camera, come closer
      // instead of looking from inside it.
      const wall = castRay(origin, back, CAMERA_DISTANCE);
      const distance =
        wall === null
          ? CAMERA_DISTANCE
          : Math.max(MIN_DISTANCE, wall - WALL_MARGIN);

      camera.position.set(
        origin.x + back.x * distance,
        origin.y + back.y * distance,
        origin.z + back.z * distance,
      );
      target.set(
        origin.x + direction.x,
        origin.y + direction.y,
        origin.z + direction.z,
      );
      camera.lookAt(target);
    },
  };
}
