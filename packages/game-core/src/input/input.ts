import { quantizePitch, quantizeYaw } from "@repo/game-protocol";
import type { InputFrame } from "@repo/game-protocol";

import type { Bindings, Input, InputOptions, PointerOptions } from "./type.ts";

/** Radians per pixel of mouse movement at sensitivity 1 (~0.17°). */
const RADIANS_PER_PIXEL = 0.003;
/**
 * Larger jumps in a single event are dropped: Chrome sometimes reports a huge
 * movementX right after the pointer gets locked.
 */
const MAX_PIXELS_PER_EVENT = 400;
const TURN = 2 * Math.PI;

export function createInput<const A extends readonly string[]>({
  actions,
  bindings,
  target = window,
  pointer,
}: InputOptions<A>): Input<A> {
  let sourceMasks = buildSourceMasks(bindings);
  const down = new Set<string>(); // физически зажатые источники
  let pressed = 0; // накоплено с прошлого sample
  let released = 0;

  // "Key:KeyW" → маска действий, которые на неё повешены
  function buildSourceMasks(next: Bindings<A>): Map<string, number> {
    const masks = new Map<string, number>();
    for (const action of actions.list) {
      for (const source of next[action] ?? []) {
        masks.set(
          source,
          ((masks.get(source) ?? 0) | actions.bit(action)) >>> 0,
        );
      }
    }
    return masks;
  }

  function heldMask(): number {
    let mask = 0;
    for (const source of down) {
      mask |= sourceMasks.get(source) ?? 0;
    }
    return mask >>> 0;
  }

  function releaseAll() {
    released = (released | heldMask()) >>> 0;
    down.clear();
  }

  const controller = new AbortController();
  const { signal } = controller;

  const mouse = pointer ? createMouseLook(pointer, signal, releaseAll) : null;

  target.addEventListener(
    "keydown",
    (event) => {
      if (mouse && !mouse.locked) {
        return; // not playing yet: the game shows "click to play"
      }
      const { code, repeat } = event as KeyboardEvent;
      if (repeat) {
        return;
      } // автоповтор — не нажатие

      const source = `Key:${code}`; // code, не key: раскладка не важна
      if (!sourceMasks.has(source)) {
        return;
      }
      event.preventDefault(); // только для своих клавиш

      const before = heldMask();
      down.add(source);
      pressed = (pressed | (heldMask() & ~before)) >>> 0; // только реально новые действия
    },
    { signal },
  );

  target.addEventListener(
    "keyup",
    (event) => {
      const source = `Key:${(event as KeyboardEvent).code}`;
      if (!down.has(source)) {
        return;
      }

      const before = heldMask();
      down.delete(source);
      released = (released | (before & ~heldMask())) >>> 0;
    },
    { signal },
  );

  target.addEventListener("blur", releaseAll, { signal });

  return {
    sample(tick) {
      const look = mouse?.look ?? { yaw: 0, pitch: 0 };
      const frame: InputFrame = {
        tick,
        held: heldMask(),
        pressed,
        released,
        yaw: quantizeYaw(look.yaw),
        pitch: quantizePitch(look.pitch),
      };
      pressed = 0;
      released = 0;
      return frame;
    },
    look() {
      return mouse?.look ?? { yaw: 0, pitch: 0 };
    },
    get locked() {
      return mouse?.locked ?? true;
    },
    setBindings(next) {
      releaseAll(); // зажатое под старой раскладкой не должно залипнуть
      sourceMasks = buildSourceMasks(next);
    },
    dispose() {
      controller.abort(); // снимает все слушатели разом
      mouse?.release();
      down.clear();
    },
  };
}

/** Pointer lock and mouse look; listeners are removed by `signal`. */
function createMouseLook(
  options: PointerOptions,
  signal: AbortSignal,
  onUnlock: () => void,
) {
  const { element, sensitivity, invertY, pitchLimits } = options;
  const doc = options.document ?? document;
  const [minPitch, maxPitch] = pitchLimits;
  let yaw = options.initialYaw ?? 0;
  let pitch = Math.min(maxPitch, Math.max(minPitch, 0));
  let locked = doc.pointerLockElement === element;

  const request = () => {
    // Raw movement without OS acceleration where supported; older browsers
    // (Safari) don't know the option, and some don't return a promise.
    const lock = (options?: { unadjustedMovement: boolean }) => {
      try {
        return Promise.resolve(element.requestPointerLock(options));
      } catch (error) {
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    };
    lock({ unadjustedMovement: true })
      .catch(() => lock())
      .catch(() => {
        // Refused (e.g. too soon after Esc): the overlay stays, the next click retries.
      });
  };

  // Browsers allow locking only from a user gesture, so: on click, never on mount.
  element.addEventListener(
    "click",
    () => {
      if (!locked) {
        request();
      }
    },
    { signal },
  );

  doc.addEventListener(
    "pointerlockchange",
    () => {
      locked = doc.pointerLockElement === element;
      if (!locked) {
        onUnlock(); // Esc must not leave W held down
      }
    },
    { signal },
  );

  doc.addEventListener(
    "mousemove",
    (event) => {
      if (!locked) {
        return;
      }
      const { movementX, movementY } = event as MouseEvent;
      if (
        Math.abs(movementX) > MAX_PIXELS_PER_EVENT ||
        Math.abs(movementY) > MAX_PIXELS_PER_EVENT
      ) {
        return;
      }
      const scale = RADIANS_PER_PIXEL * sensitivity();
      // Mouse right → look right (yaw decreases); mouse up (negative Y) → look up.
      yaw = (yaw - movementX * scale) % TURN;
      const up = invertY() ? movementY : -movementY;
      pitch = Math.min(maxPitch, Math.max(minPitch, pitch + up * scale));
    },
    { signal },
  );

  return {
    get look() {
      return { yaw, pitch };
    },
    get locked() {
      return locked;
    },
    release: () => {
      // Only our own lock: another game or page element may hold it.
      if (doc.pointerLockElement === element) {
        doc.exitPointerLock();
      }
    },
  };
}
