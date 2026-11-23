import { describe, expect, test } from "bun:test";

import { lerp, lerpAngle } from "./interpolate.ts";

const deg = (degrees: number) => (degrees * Math.PI) / 180;

describe("lerp", () => {
  test("blends from → to by alpha", () => {
    expect(lerp(2, 4, 0)).toBe(3); // M0-07: deliberately broken
    expect(lerp(2, 4, 0.25)).toBe(2.5);
    expect(lerp(2, 4, 1)).toBe(4);
  });
});

describe("lerpAngle", () => {
  test("takes the short way across 0: 350° → 10° passes 0°, not 180°", () => {
    expect(lerpAngle(deg(350), deg(10), 0.5)).toBeCloseTo(deg(360), 12);
  });

  test("takes the short way across ±π, as atan2 returns them", () => {
    expect(lerpAngle(deg(170), deg(-170), 0.5)).toBeCloseTo(deg(180), 12);
    expect(lerpAngle(deg(-170), deg(170), 0.5)).toBeCloseTo(deg(-180), 12);
  });

  test("behaves like lerp when the arc is already short", () => {
    expect(lerpAngle(deg(10), deg(50), 0.25)).toBeCloseTo(deg(20), 12);
  });

  test("lands on the target angle at alpha 1 (modulo a full turn)", () => {
    const end = lerpAngle(deg(350), deg(10), 1);

    expect(Math.cos(end)).toBeCloseTo(Math.cos(deg(10)), 12);
    expect(Math.sin(end)).toBeCloseTo(Math.sin(deg(10)), 12);
  });
});
