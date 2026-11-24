import { describe, expect, test } from "bun:test";

import { createGameStorage } from "./game-storage.ts";
import { createMemoryStorage } from "./storage.ts";

describe("createGameStorage", () => {
  test("round-trips JSON under the game's prefix", () => {
    const storage = createMemoryStorage();
    const game = createGameStorage(storage, "bridge");

    game.set("character", { id: "builder", level: 2 });

    expect(game.get("character")).toEqual({ id: "builder", level: 2 });
    expect(storage.get("games:bridge:data:character")).toBe(
      '{"id":"builder","level":2}',
    );
  });

  test("two games with the same key don't see each other", () => {
    const storage = createMemoryStorage();
    const bridge = createGameStorage(storage, "bridge");
    const other = createGameStorage(storage, "other");

    bridge.set("best", 10);
    other.set("best", 99);

    expect(bridge.get("best")).toBe(10);
    expect(other.get("best")).toBe(99);
  });

  test("can't reach the platform's keys for the game", () => {
    const storage = createMemoryStorage({
      "games:bridge:bindings": '{"jump":["Key:KeyF"]}',
    });

    expect(
      createGameStorage(storage, "bridge").get("bindings"),
    ).toBeUndefined();
  });

  test("missing or broken values are undefined", () => {
    const storage = createMemoryStorage({
      "games:bridge:data:broken": "{nope",
    });
    const game = createGameStorage(storage, "bridge");

    expect(game.get("missing")).toBeUndefined();
    expect(game.get("broken")).toBeUndefined();
  });

  test("remove forgets the value", () => {
    const game = createGameStorage(createMemoryStorage(), "bridge");
    game.set("character", "builder");

    game.remove("character");

    expect(game.get("character")).toBeUndefined();
  });
});
