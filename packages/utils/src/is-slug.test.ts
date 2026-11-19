import { test, expect } from "bun:test";
import { isSlug } from "./is-slug.ts";

test.each(["bridge", "tower-defense", "game2", "a"])("accepts %p", (s) => {
  expect(isSlug(s)).toBe(true);
});

test.each(["", "Bridge", "1bridge", "-bridge", "bridge-", "a--b", "not slug"])(
  "rejects %p",
  (s) => {
    expect(isSlug(s)).toBe(false);
  },
);
