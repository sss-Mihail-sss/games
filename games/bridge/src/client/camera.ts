import { PerspectiveCamera } from "three";

/** Radians per pixel of mouse movement. */
const SENSITIVITY = 0.005;
/** Metres behind and above the avatar, and the height it looks at. */
const DISTANCE = 7;
const HEIGHT = 4;
const LOOK_AT_HEIGHT = 1.2;

export interface FollowCamera {
  camera: PerspectiveCamera;
  /** Radians, the same convention as the sim: 0 looks along −Z. */
  readonly yaw: number;
  /** Turns the camera by dragging on `surface`. Listeners go away with `dispose`. */
  listen: (surface: HTMLElement) => void;
  /** Places the camera behind the avatar's feet at (x, y, z); call every frame. */
  follow: (x: number, y: number, z: number) => void;
  dispose: () => void;
}

/**
 * Third-person camera. It turns per frame (smooth on any monitor), while its yaw
 * reaches the sim per tick through the InputFrame. That's why OrbitControls won't
 * do: they own the rotation, and the sim would never see it.
 */
export function createFollowCamera(initialYaw: number): FollowCamera {
  const camera = new PerspectiveCamera(60, 1, 0.1, 300);
  const controller = new AbortController();
  let yaw = initialYaw;
  let dragging: number | null = null;

  return {
    camera,
    get yaw() {
      return yaw;
    },
    listen: (surface) => {
      const { signal } = controller;
      surface.style.touchAction = "none";
      surface.style.cursor = "grab";

      surface.addEventListener(
        "pointerdown",
        (event) => {
          if (event.button !== 0 || dragging !== null) {
            return;
          }
          dragging = event.pointerId;
          // Keep getting moves even when the pointer leaves the canvas mid-drag.
          surface.setPointerCapture(event.pointerId);
          surface.style.cursor = "grabbing";
        },
        { signal },
      );
      surface.addEventListener(
        "pointermove",
        (event) => {
          if (event.pointerId === dragging) {
            yaw -= event.movementX * SENSITIVITY; // drag right → look right
          }
        },
        { signal },
      );
      const stop = (event: PointerEvent) => {
        if (event.pointerId === dragging) {
          dragging = null;
          surface.style.cursor = "grab";
        }
      };
      for (const type of [
        "pointerup",
        "pointercancel",
        "lostpointercapture",
      ] as const) {
        surface.addEventListener(type, stop, { signal });
      }
    },
    follow: (x, y, z) => {
      // Behind = the opposite of forward (−sin, −cos).
      camera.position.set(
        x + Math.sin(yaw) * DISTANCE,
        y + HEIGHT,
        z + Math.cos(yaw) * DISTANCE,
      );
      camera.lookAt(x, y + LOOK_AT_HEIGHT, z);
    },
    dispose: () => {
      controller.abort();
    },
  };
}
