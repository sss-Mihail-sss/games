import { describe, expect, test } from "bun:test";

import { absoluteUrl, catalogPath, playPath, siteUrl } from "./site.ts";

describe("site paths", () => {
  test("the catalog lives at the locale root", () => {
    expect(catalogPath("ru")).toBe("/ru");
  });

  test("a game lives under /<locale>/play/<id>", () => {
    expect(playPath("ru", "bridge")).toBe("/ru/play/bridge");
  });

  test("absoluteUrl resolves a path against the site origin", () => {
    expect(absoluteUrl("/ru/play/bridge")).toBe(
      "https://games.secrii.dev/ru/play/bridge",
    );
    expect(absoluteUrl(catalogPath("ru"))).toBe(`${siteUrl.origin}/ru`);
  });
});
