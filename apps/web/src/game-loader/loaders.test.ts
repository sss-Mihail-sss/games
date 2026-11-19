import { describe, expect, test } from "bun:test";

import { gameLoader } from "./loaders.ts";

describe("gameLoader", () => {
  test("loads the bridge client, whose manifest matches its id", async () => {
    const game = await gameLoader.load("bridge");

    expect(game.manifest.id).toBe("bridge");
    expect(typeof game.mount).toBe("function");
  });
});
