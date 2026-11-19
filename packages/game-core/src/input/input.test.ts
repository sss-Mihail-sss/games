import { describe, expect, test } from "bun:test";

import { defineActions } from "@repo/game-protocol";

import { createInput } from "./input.ts";
import type { Bindings } from "./type.ts";

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

    expect(sample()).toEqual({ tick: 0, held: 0, pressed: 0, released: 0 });
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

    expect(sample()).toEqual({ tick: 0, held: 0, pressed: 0, released: 0 });
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
});
