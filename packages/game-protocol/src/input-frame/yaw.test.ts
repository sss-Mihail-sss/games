import { describe, expect, test } from "bun:test";

import { quantizeYaw, YAW_STEPS, yawToRadians } from "./yaw.ts";

const STEP = (2 * Math.PI) / YAW_STEPS;

describe("quantizeYaw", () => {
  test.each([
    ["0", 0, 0],
    ["π/2", Math.PI / 2, YAW_STEPS / 4],
    ["π", Math.PI, YAW_STEPS / 2],
    ["3π/2", (3 * Math.PI) / 2, (YAW_STEPS * 3) / 4],
  ])("maps %s to its step", (_, radians, units) => {
    expect(quantizeYaw(radians)).toBe(units);
  });

  test("wraps a full turn to 0", () => {
    expect(quantizeYaw(2 * Math.PI)).toBe(0);
    expect(quantizeYaw(-2 * Math.PI)).toBe(0);
  });

  test("wraps negative angles: -π/2 is the same as 3π/2", () => {
    expect(quantizeYaw(-Math.PI / 2)).toBe(quantizeYaw((3 * Math.PI) / 2));
  });

  test("wraps several turns", () => {
    expect(quantizeYaw(4 * Math.PI + Math.PI / 2)).toBe(YAW_STEPS / 4);
    expect(quantizeYaw(-6 * Math.PI + Math.PI)).toBe(YAW_STEPS / 2);
  });

  test("an angle just below 2π rounds to 0, not to YAW_STEPS", () => {
    expect(quantizeYaw(2 * Math.PI - STEP / 4)).toBe(0);
  });

  test("always returns an integer that fits in a uint16", () => {
    for (let radians = -10; radians <= 10; radians += 0.137) {
      const units = quantizeYaw(radians);

      expect(Number.isInteger(units)).toBe(true);
      expect(units).toBeGreaterThanOrEqual(0);
      expect(units).toBeLessThan(YAW_STEPS);
    }
  });

  test.each([Number.NaN, Infinity, -Infinity])("rejects %p", (radians) => {
    expect(() => quantizeYaw(radians)).toThrow(RangeError);
  });
});

describe("yawToRadians", () => {
  test("maps the range onto [0, 2π)", () => {
    expect(yawToRadians(0)).toBe(0);
    expect(yawToRadians(YAW_STEPS / 2)).toBeCloseTo(Math.PI, 12);
    expect(yawToRadians(YAW_STEPS - 1)).toBeLessThan(2 * Math.PI);
  });

  test("round-trips within half a step", () => {
    for (let radians = 0; radians < 2 * Math.PI; radians += 0.0731) {
      const back = yawToRadians(quantizeYaw(radians));
      // Compare on the circle: near 2π the round trip may land on 0.
      const error = Math.abs(
        Math.atan2(Math.sin(back - radians), Math.cos(back - radians)),
      );

      expect(error).toBeLessThanOrEqual(STEP / 2 + 1e-12);
    }
  });

  test("units survive a round trip exactly", () => {
    for (const units of [0, 1, 12345, YAW_STEPS / 2, YAW_STEPS - 1]) {
      expect(quantizeYaw(yawToRadians(units))).toBe(units);
    }
  });
});
