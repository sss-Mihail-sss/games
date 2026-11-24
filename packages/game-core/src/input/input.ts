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

  const mouse = pointer
    ? createMouseLook(pointer, target, signal, releaseAll)
    : null;

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
      mouse?.sync(); // before the masks: a lost lock releases keys in this frame
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
    lock() {
      return mouse ? mouse.request() : Promise.resolve(true);
    },
    unlock() {
      mouse?.release();
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
  keys: EventTarget,
  signal: AbortSignal,
  onUnlock: () => void,
) {
  const { element, sensitivity, invertY, pitchLimits } = options;
  const doc = options.document ?? document;
  const [minPitch, maxPitch] = pitchLimits;
  let yaw = options.initialYaw ?? 0;
  let pitch = Math.min(maxPitch, Math.max(minPitch, 0));
  let locked = doc.pointerLockElement === element;

  /** Resolves `true` once locked, `false` if the browser refused. */
  const request = (): Promise<boolean> => {
    if (locked) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      // Older browsers (Safari) return nothing: then only the events tell.
      let promised = true;
      let settled = false;
      const onChange = () => {
        if (doc.pointerLockElement === element) {
          finish(true);
        }
      };
      const onError = () => {
        if (!promised) {
          finish(false);
        }
      };
      const finish = (ok: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        doc.removeEventListener("pointerlockchange", onChange);
        doc.removeEventListener("pointerlockerror", onError);
        resolve(ok);
      };
      doc.addEventListener("pointerlockchange", onChange);
      doc.addEventListener("pointerlockerror", onError);
      signal.addEventListener("abort", () => finish(false), { once: true });

      // Raw movement without OS acceleration where supported; browsers that
      // don't know the option reject, so try once more without it.
      const attempt = (options?: { unadjustedMovement: boolean }) => {
        try {
          const result = element.requestPointerLock(options);
          if (result === undefined) {
            promised = false;
          }
          return Promise.resolve(result);
        } catch (error) {
          return Promise.reject(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      };
      attempt({ unadjustedMovement: true })
        .catch(() => attempt())
        .then(
          () => {
            if (doc.pointerLockElement === element) {
              finish(true);
            }
          },
          () => {
            finish(false);
          },
        );
    });
  };

  // Browsers allow locking only from a user gesture: on click, never on mount.
  // Refused (e.g. too soon after Esc)? The next click retries.
  element.addEventListener(
    "click",
    () => {
      if (!locked) {
        void request();
      }
    },
    { signal },
  );

  /**
   * Reads the lock from `pointerLockElement` instead of trusting one event:
   * WebKit can drop the lock with only a `pointerlockerror` (its unlock
   * request "failed" because the lock was already gone), so every signal
   * re-checks, and `sample()` does on every tick as a last resort.
   */
  const sync = () => {
    const was = locked;
    locked = doc.pointerLockElement === element;
    if (was && !locked) {
      onUnlock(); // Esc must not leave W held down
      options.onUnlock?.();
    }
  };
  doc.addEventListener("pointerlockchange", sync, { signal });
  doc.addEventListener("pointerlockerror", sync, { signal });

  // Only our own lock: another game or page element may hold it.
  const release = () => {
    if (doc.pointerLockElement === element) {
      doc.exitPointerLock();
    }
  };

  // Esc always gives the mouse back (the platform never lets it be bound).
  // Safari keeps the first Esc keydown to itself, to hide its "Your mouse
  // pointer is hidden" banner, and the lock stays: only the keyup reaches the
  // page. So either half of Esc while locked asks the browser to let go.
  const onEscape = (event: Event) => {
    if (locked && (event as KeyboardEvent).code === "Escape") {
      release();
    }
  };
  keys.addEventListener("keydown", onEscape, { signal });
  keys.addEventListener("keyup", onEscape, { signal });

  doc.addEventListener(
    "mousemove",
    (event) => {
      sync(); // the cursor is back without a word: stop turning
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
    request,
    release,
    sync,
  };
}
