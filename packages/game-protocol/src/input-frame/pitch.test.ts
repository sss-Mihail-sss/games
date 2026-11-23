import { describe, expect, test } from "bun:test";

import { PITCH_MAX, pitchToRadians, quantizePitch } from "./pitch.ts";

const STEP = Math.PI / PITCH_MAX;

describe("quantizePitch", () => {
  test.each([
    ["−π/2 (straight down)", -Math.PI / 2, 0],
    ["0 (level)", 0, PITCH_MAX / 2],
    ["π/2 (straight up)", Math.PI / 2, PITCH_MAX],
  ])("maps %s to its step", (_, radians, units) => {
    expect(quantizePitch(radians)).toBe(units);
  });

  test("clamps instead of wrapping", () => {
    expect(quantizePitch(Math.PI)).toBe(PITCH_MAX);
    expect(quantizePitch(-10)).toBe(0);
    expect(quantizePitch((100 * Math.PI) / 180)).toBe(PITCH_MAX);
  });

  test("always returns an integer within the wire range", () => {
    for (let radians = -3; radians <= 3; radians += 0.0731) {
      const units = quantizePitch(radians);

      expect(Number.isInteger(units)).toBe(true);
      expect(units).toBeGreaterThanOrEqual(0);
      expect(units).toBeLessThanOrEqual(PITCH_MAX);
    }
  });

  test.each([Number.NaN, Infinity, -Infinity])("rejects %p", (radians) => {
    expect(() => quantizePitch(radians)).toThrow(RangeError);
  });
});

describe("pitchToRadians", () => {
  test("level round-trips to exactly 0", () => {
    expect(pitchToRadians(quantizePitch(0))).toBe(0);
  });

  test("round-trips within half a step", () => {
    for (
      let radians = -Math.PI / 2;
      radians <= Math.PI / 2;
      radians += 0.0371
    ) {
      const back = pitchToRadians(quantizePitch(radians));

      expect(Math.abs(back - radians)).toBeLessThanOrEqual(STEP / 2 + 1e-12);
    }
  });

  test("units survive a round trip exactly", () => {
    for (const units of [0, 1, 12345, PITCH_MAX / 2, PITCH_MAX]) {
      expect(quantizePitch(pitchToRadians(units))).toBe(units);
    }
  });
});
