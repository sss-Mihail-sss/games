import { describe, expect, mock, test } from "bun:test";

import {
  defineActions,
  pitchToRadians,
  quantizePitch,
} from "@repo/game-protocol";

import { createInput } from "./input.ts";
import type { Bindings } from "./type.ts";

/** Level pitch on the wire. */
const LEVEL = quantizePitch(0);

const actions = defineActions(["moveForward", "grab", "nail"] as const);

const defaultBindings: Bindings<typeof actions.list> = {
  moveForward: ["Key:KeyW", "Key:ArrowUp"],
  grab: ["Key:KeyJ"],
  nail: ["Key:KeyK"],
};

const key = (type: "keydown" | "keyup", code: string, repeat = false) =>
  Object.assign(new Event(type, { cancelable: true }), { code, repeat });

function setup(bindings = defaultBindings) {
  const target = new EventTarget();
  const input = createInput({ actions, bindings, target });
  let tick = 0;

  const down = (code: string, repeat = false) =>
    target.dispatchEvent(key("keydown", code, repeat));
  const up = (code: string) => target.dispatchEvent(key("keyup", code));
  const blur = () => target.dispatchEvent(new Event("blur"));
  const sample = () => input.sample(tick++);

  return { target, input, down, up, blur, sample };
}

describe("createInput", () => {
  test("a key press is held and pressed in the next sample", () => {
    const { down, sample } = setup();
    down("KeyW");
    const frame = sample();

    expect(actions.isHeld(frame, "moveForward")).toBe(true);
    expect(actions.wasPressed(frame, "moveForward")).toBe(true);
    expect(actions.wasReleased(frame, "moveForward")).toBe(false);
  });

  test("pressed is reported once, held stays while the key is down", () => {
    const { down, sample } = setup();
    down("KeyW");
    sample();
    const frame = sample();

    expect(actions.isHeld(frame, "moveForward")).toBe(true);
    expect(actions.wasPressed(frame, "moveForward")).toBe(false);
  });

  test("releasing a key reports released once and clears held", () => {
    const { down, up, sample } = setup();
    down("KeyW");
    sample();
    up("KeyW");
    const released = sample();
    const after = sample();

    expect(actions.wasReleased(released, "moveForward")).toBe(true);
    expect(actions.isHeld(released, "moveForward")).toBe(false);
    expect(actions.wasReleased(after, "moveForward")).toBe(false);
  });

  test("a tap between two samples is not lost", () => {
    const { down, up, sample } = setup();
    down("KeyJ");
    up("KeyJ");
    const frame = sample();

    expect(actions.wasPressed(frame, "grab")).toBe(true);
    expect(actions.wasReleased(frame, "grab")).toBe(true);
    expect(actions.isHeld(frame, "grab")).toBe(false);
  });

  test("passes the tick number through", () => {
    const { input } = setup();

    expect(input.sample(7).tick).toBe(7);
  });

  test("without a pointer, the look stays level along −Z", () => {
    const { input } = setup();

    expect(input.look()).toEqual({ yaw: 0, pitch: 0 });
    expect(input.sample(0).yaw).toBe(0);
    expect(input.sample(1).pitch).toBe(LEVEL);
    expect(input.locked).toBe(true); // keyboard-only games never wait for a click
  });

  test("key auto-repeat does not produce new presses", () => {
    const { down, sample } = setup();
    down("KeyW");
    sample();
    down("KeyW", true);
    down("KeyW", true);
    const frame = sample();

    expect(actions.wasPressed(frame, "moveForward")).toBe(false);
    expect(actions.isHeld(frame, "moveForward")).toBe(true);
  });

  test("auto-repeat of a key held before mount is not a press", () => {
    // The initial keydown happened before createInput: only repeats reach us.
    const { down, sample } = setup();
    down("KeyW", true);
    const frame = sample();

    expect(actions.wasPressed(frame, "moveForward")).toBe(false);
    expect(actions.isHeld(frame, "moveForward")).toBe(false);
  });

  test("blur releases everything that is held", () => {
    const { down, blur, sample } = setup();
    down("KeyW");
    down("KeyJ");
    sample();
    blur();
    const frame = sample();

    expect(frame.held).toBe(0);
    expect(actions.wasReleased(frame, "moveForward")).toBe(true);
    expect(actions.wasReleased(frame, "grab")).toBe(true);
  });

  test("keyup after blur does not report a second release", () => {
    const { down, up, blur, sample } = setup();
    down("KeyW");
    blur();
    sample();
    up("KeyW");

    expect(sample().released).toBe(0);
  });

  test("keyup without a matching keydown is ignored", () => {
    const { up, sample } = setup();
    up("KeyW");

    expect(sample()).toEqual({
      tick: 0,
      held: 0,
      pressed: 0,
      released: 0,
      yaw: 0,
      pitch: LEVEL,
    });
  });

  describe("two keys bound to one action", () => {
    test("pressing the second key does not press the action again", () => {
      const { down, sample } = setup();
      down("KeyW");
      sample();
      down("ArrowUp");

      expect(actions.wasPressed(sample(), "moveForward")).toBe(false);
    });

    test("releasing one of them keeps the action held", () => {
      const { down, up, sample } = setup();
      down("KeyW");
      down("ArrowUp");
      sample();
      up("KeyW");
      const frame = sample();

      expect(actions.isHeld(frame, "moveForward")).toBe(true);
      expect(actions.wasReleased(frame, "moveForward")).toBe(false);
    });

    test("releasing both releases the action", () => {
      const { down, up, sample } = setup();
      down("KeyW");
      down("ArrowUp");
      sample();
      up("KeyW");
      up("ArrowUp");

      expect(actions.wasReleased(sample(), "moveForward")).toBe(true);
    });
  });

  test("one key bound to two actions triggers both", () => {
    const { down, sample } = setup({
      grab: ["Key:Space"],
      nail: ["Key:Space"],
    });
    down("Space");
    const frame = sample();

    expect(actions.wasPressed(frame, "grab")).toBe(true);
    expect(actions.wasPressed(frame, "nail")).toBe(true);
  });

  test("uses KeyboardEvent.code, so the keyboard layout does not matter", () => {
    const { target, sample } = setup();
    // Russian layout: the W key produces key "ц", but code stays "KeyW".
    target.dispatchEvent(
      Object.assign(new Event("keydown", { cancelable: true }), {
        code: "KeyW",
        key: "ц",
      }),
    );

    expect(actions.isHeld(sample(), "moveForward")).toBe(true);
  });

  describe("preventDefault", () => {
    test("is called for bound keys", () => {
      const { target } = setup();
      const event = key("keydown", "KeyJ");
      target.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    test("is not called for unbound keys", () => {
      const { target, sample } = setup();
      const event = key("keydown", "KeyZ");
      target.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(sample().pressed).toBe(0);
    });
  });

  describe("setBindings", () => {
    test("old keys stop working and new keys start working", () => {
      const { input, down, sample } = setup();
      input.setBindings({ grab: ["Key:KeyG"] });

      down("KeyJ");
      expect(sample().pressed).toBe(0);

      down("KeyG");
      expect(actions.wasPressed(sample(), "grab")).toBe(true);
    });

    test("releases actions held under the old bindings", () => {
      const { input, down, sample } = setup();
      down("KeyW");
      sample();
      input.setBindings({ moveForward: ["Key:ArrowUp"] });
      const frame = sample();

      expect(actions.wasReleased(frame, "moveForward")).toBe(true);
      expect(frame.held).toBe(0);
    });
  });

  test("dispose removes all listeners", () => {
    const { input, down, blur, sample } = setup();
    input.dispose();
    down("KeyW");
    blur();

    expect(sample()).toEqual({
      tick: 0,
      held: 0,
      pressed: 0,
      released: 0,
      yaw: 0,
      pitch: LEVEL,
    });
  });

  test("masks stay valid uint32 with an action on bit 31", () => {
    const many = defineActions(
      Array.from({ length: 32 }, (_, i) => `action${i}`),
    );
    const target = new EventTarget();
    const input = createInput({
      actions: many,
      bindings: { action31: ["Key:KeyX"] },
      target,
    });
    target.dispatchEvent(key("keydown", "KeyX"));
    const frame = input.sample(0);

    expect(frame.held).toBe(2 ** 31);
    expect(frame.pressed).toBe(2 ** 31);
  });

  describe("mouse look", () => {
    const DEG = Math.PI / 180;

    /** Pointer lock state as `document` keeps it. */
    class FakeDocument extends EventTarget {
      pointerLockElement: unknown = null;
      exitPointerLock = () => {
        this.pointerLockElement = null;
        this.dispatchEvent(new Event("pointerlockchange"));
      };
    }

    /** A fake document and canvas: pointer lock without a browser. */
    function setupPointer({
      sensitivity = 1,
      invertY = false,
      browser = "grants",
      onUnlock,
    }: {
      sensitivity?: number;
      invertY?: boolean;
      /**
       * "refuses": the promise rejects, as Chrome does right after Esc.
       * "legacy-refuses": no promise, only a `pointerlockerror` event (old Safari).
       */
      browser?: "grants" | "refuses" | "legacy-refuses";
      onUnlock?: () => void;
    } = {}) {
      const target = new EventTarget();
      const doc = new FakeDocument();
      const requests: unknown[] = [];
      const element = Object.assign(new EventTarget(), {
        requestPointerLock: (options?: unknown): Promise<void> | void => {
          requests.push(options);
          if (browser === "refuses") {
            return Promise.reject(new Error("SecurityError"));
          }
          if (browser === "legacy-refuses") {
            queueMicrotask(() =>
              doc.dispatchEvent(new Event("pointerlockerror")),
            );
            return;
          }
          doc.pointerLockElement = element;
          doc.dispatchEvent(new Event("pointerlockchange"));
          return Promise.resolve();
        },
      });
      const input = createInput({
        actions,
        bindings: defaultBindings,
        target,
        pointer: {
          element,
          document: doc,
          sensitivity: () => sensitivity,
          invertY: () => invertY,
          pitchLimits: [-60 * DEG, 70 * DEG],
          onUnlock,
        },
      });
      const move = (movementX: number, movementY: number) =>
        doc.dispatchEvent(
          Object.assign(new Event("mousemove"), { movementX, movementY }),
        );
      const click = () => element.dispatchEvent(new Event("click"));
      return { input, doc, element, target, requests, move, click };
    }

    test("starts unlocked, and a click locks with raw movement", () => {
      const { input, click, requests } = setupPointer();

      expect(input.locked).toBe(false);
      click();
      expect(input.locked).toBe(true);
      expect(requests).toEqual([{ unadjustedMovement: true }]);
    });

    test("does not turn before the pointer is locked", () => {
      const { input, move } = setupPointer();
      move(100, 100);

      expect(input.look()).toEqual({ yaw: 0, pitch: 0 });
    });

    test("mouse right turns right, mouse up looks up", () => {
      const { input, click, move } = setupPointer();
      click();
      move(100, -50);

      const { yaw, pitch } = input.look();
      expect(yaw).toBeCloseTo(-0.3, 12); // 100 px × 0.003
      expect(pitch).toBeCloseTo(0.15, 12);
    });

    test("sensitivity scales and invertY flips the vertical", () => {
      const { input, click, move } = setupPointer({
        sensitivity: 2,
        invertY: true,
      });
      click();
      move(10, -10);

      expect(input.look().yaw).toBeCloseTo(-0.06, 12);
      expect(input.look().pitch).toBeCloseTo(-0.06, 12);
    });

    test("pitch stops at the game's limits", () => {
      const { input, click, move } = setupPointer();
      click();
      for (let i = 0; i < 20; i++) {
        move(0, -300); // way past +70°
      }
      expect(input.look().pitch).toBeCloseTo(70 * DEG, 12);
      for (let i = 0; i < 20; i++) {
        move(0, 300);
      }
      expect(input.look().pitch).toBeCloseTo(-60 * DEG, 12);
    });

    test("drops absurd jumps from a single event", () => {
      const { input, click, move } = setupPointer();
      click();
      move(5000, 0);

      expect(input.look().yaw).toBe(0);
    });

    test("puts the quantized look into each frame", () => {
      const { input, click, move } = setupPointer();
      click();
      move(0, -100); // +0.3 rad

      const frame = input.sample(0);
      expect(pitchToRadians(frame.pitch)).toBeCloseTo(0.3, 4);
    });

    test("keys are ignored until locked, and Esc releases them", () => {
      const { input, target, click, doc } = setupPointer();
      const press = (code: string) =>
        target.dispatchEvent(key("keydown", code));

      press("KeyW");
      expect(input.sample(0).held).toBe(0);

      click();
      press("KeyW");
      expect(actions.isHeld(input.sample(1), "moveForward")).toBe(true);

      doc.exitPointerLock(); // what the browser does on Esc
      const frame = input.sample(2);
      expect(frame.held).toBe(0);
      expect(actions.wasReleased(frame, "moveForward")).toBe(true);
    });

    test("lock() captures the mouse and resolves true", async () => {
      const { input, requests } = setupPointer();

      expect(await input.lock()).toBe(true);
      expect(input.locked).toBe(true);
      expect(await input.lock()).toBe(true); // already locked: no new request
      expect(requests).toHaveLength(1);
    });

    test("lock() resolves false when the browser refuses, after one retry without raw movement", async () => {
      const { input, requests } = setupPointer({ browser: "refuses" });

      expect(await input.lock()).toBe(false);
      expect(input.locked).toBe(false);
      expect(requests).toEqual([{ unadjustedMovement: true }, undefined]);
    });

    test("lock() resolves false on pointerlockerror when there is no promise", async () => {
      const { input } = setupPointer({ browser: "legacy-refuses" });

      expect(await input.lock()).toBe(false);
    });

    test("unlock() releases the mouse and onUnlock fires once", async () => {
      const onUnlock = mock(() => {});
      const { input } = setupPointer({ onUnlock });
      await input.lock();

      input.unlock();
      input.unlock(); // not ours anymore: nothing happens

      expect(input.locked).toBe(false);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });

    test("onUnlock fires on Esc, not when someone else's lock changes", () => {
      const onUnlock = mock(() => {});
      const { click, doc } = setupPointer({ onUnlock });

      doc.pointerLockElement = {}; // another element took it while we weren't locked
      doc.dispatchEvent(new Event("pointerlockchange"));
      expect(onUnlock).not.toHaveBeenCalled();

      doc.pointerLockElement = null;
      click();
      doc.exitPointerLock(); // Esc
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });

    test("without pointer, lock() is a no-op that resolves true", async () => {
      const input = createInput({
        actions,
        bindings: defaultBindings,
        target: new EventTarget(),
      });

      expect(await input.lock()).toBe(true);
      input.unlock();
      expect(input.locked).toBe(true);
    });

    test("dispose removes listeners and gives up its own lock", () => {
      const { input, click, move, doc } = setupPointer();
      click();
      input.dispose();

      expect(doc.pointerLockElement).toBeNull();
      move(100, 0);
      expect(input.look().yaw).toBe(0);
    });
  });
});
