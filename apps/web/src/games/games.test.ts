import { describe, expect, test } from "bun:test";

import { games, type GameId } from "./games.ts";

describe("games registry", () => {
  test("contains bridge", () => {
    expect(games.has("bridge")).toBe(true);
    expect(games.manifest("bridge").kind).toBe("3d");
  });

  test("GameId is derived from the manifests", () => {
    const id: GameId = "bridge";
    // @ts-expect-error only registered games are valid ids
    const unknown: GameId = "nope";

    expect(id).toBe("bridge");
    expect(games.has(unknown)).toBe(false);
  });
});
