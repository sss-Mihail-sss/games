import { describe, expect, test } from "bun:test";

import { verticalFov } from "./fov.ts";

describe("verticalFov", () => {
  test("90° across a 16:9 screen is ~58.72° up and down", () => {
    expect(verticalFov(90)).toBeCloseTo(58.72, 2);
  });

  test("the setting's bounds", () => {
    expect(verticalFov(70)).toBeCloseTo(43.0, 2);
    expect(verticalFov(110)).toBeCloseTo(77.55, 2);
  });

  test("a wider setting is always a wider view", () => {
    let previous = 0;
    for (let degrees = 70; degrees <= 110; degrees += 1) {
      const vertical = verticalFov(degrees);
      expect(vertical).toBeGreaterThan(previous);
      expect(vertical).toBeLessThan(degrees); // a 16:9 screen is wider than tall
      previous = vertical;
    }
  });
});
