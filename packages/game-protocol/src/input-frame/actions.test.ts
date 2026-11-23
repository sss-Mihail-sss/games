import { describe, expect, test } from "bun:test";

import { defineActions } from "./actions.ts";
import type { InputFrame } from "./type.ts";

const actions = defineActions(["moveForward", "grab", "nail"] as const);

const frame = (overrides: Partial<InputFrame> = {}): InputFrame => ({
  tick: 0,
  held: 0,
  pressed: 0,
  released: 0,
  yaw: 0,
  pitch: 0,
  ...overrides,
});

const names = (count: number) =>
  Array.from({ length: count }, (_, i) => `action${i}`);

describe("defineActions", () => {
  test("assigns bits in list order", () => {
    expect(actions.bit("moveForward")).toBe(0b001);
    expect(actions.bit("grab")).toBe(0b010);
    expect(actions.bit("nail")).toBe(0b100);
  });

  test("keeps the list in the given order", () => {
    expect(actions.list).toEqual(["moveForward", "grab", "nail"]);
  });

  test("bit 31 is a positive uint32", () => {
    const all = defineActions(names(32));

    expect(all.bit("action31")).toBe(2 ** 31);
  });

  test("accepts exactly 32 actions", () => {
    expect(() => defineActions(names(32))).not.toThrow();
  });

  test("rejects more than 32 actions", () => {
    expect(() => defineActions(names(33))).toThrow(/Too many actions: 33/);
  });

  test("rejects duplicate actions", () => {
    expect(() => defineActions(["grab", "nail", "grab"])).toThrow(/Duplicate/);
  });

  test("rejects unknown actions at compile time", () => {
    // @ts-expect-error "grap" is not a declared action
    actions.bit("grap");
  });

  describe("frame helpers", () => {
    const sample = frame({
      held: actions.bit("moveForward"),
      pressed: actions.bit("grab"),
      released: actions.bit("nail"),
    });

    test("isHeld reads the held mask", () => {
      expect(actions.isHeld(sample, "moveForward")).toBe(true);
      expect(actions.isHeld(sample, "grab")).toBe(false);
    });

    test("wasPressed reads the pressed mask", () => {
      expect(actions.wasPressed(sample, "grab")).toBe(true);
      expect(actions.wasPressed(sample, "moveForward")).toBe(false);
    });

    test("wasReleased reads the released mask", () => {
      expect(actions.wasReleased(sample, "nail")).toBe(true);
      expect(actions.wasReleased(sample, "grab")).toBe(false);
    });

    test("works for bit 31", () => {
      const all = defineActions(names(32));
      const decoded = frame({ held: 2 ** 31 }); // as it comes out of DataView.getUint32

      expect(all.isHeld(decoded, "action31")).toBe(true);
      expect(all.isHeld(decoded, "action30")).toBe(false);
    });
  });
});
