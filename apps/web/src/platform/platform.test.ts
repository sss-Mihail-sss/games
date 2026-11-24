import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
  type Mock,
} from "bun:test";

import type { Controls } from "@repo/game-core";

import { createBindingsStore } from "./bindings.ts";
import { createPlayStore } from "./play.ts";
import { createPlatformContext } from "./platform.ts";
import { createSettingsStore } from "./settings.ts";
import { createMemoryStorage } from "./storage.ts";

const controls: Controls<"jump"> = {
  actions: ["jump"],
  labels: { jump: "Прыжок" },
  defaults: { jump: ["Key:Space"] },
};

function setup({ withControls = true } = {}) {
  const storage = createMemoryStorage();
  const settings = createSettingsStore(storage);
  const play = createPlayStore();
  const bindings = withControls
    ? createBindingsStore(storage, "bridge", controls)
    : undefined;
  const context = createPlatformContext("bridge", {
    storage,
    settings,
    play,
    bindings,
  });
  return { storage, settings, play, bindings, context };
}

describe("createPlatformContext", () => {
  test("gives the game the current user", () => {
    const { storage, context } = setup();

    expect(context.user.kind).toBe("guest");
    expect(context.user.id).toBe(storage.get("games:guest-id")!);
  });

  describe("settings", () => {
    test("exposes current settings, reflecting later changes", () => {
      const { settings, context } = setup();
      settings.set({ quality: "low" });

      expect(context.settings.current.quality).toBe("low");
    });

    test("forwards subscriptions to the store", () => {
      const { settings, context } = setup();
      const listener = mock(() => {});
      const unsubscribe = context.settings.subscribe(listener);

      settings.set({ quality: "medium" });
      unsubscribe();
      settings.set({ quality: "low" });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("does not let the game change settings", () => {
      const { context } = setup();

      expect("set" in context.settings).toBe(false);
    });
  });

  describe("storage", () => {
    test("is the game's own, under its prefix", () => {
      const { storage, context } = setup();
      context.storage.set("character", "builder");

      expect(storage.get("games:bridge:data:character")).toBe('"builder"');
    });
  });

  describe("controls", () => {
    test("shows the player's bindings and their changes", () => {
      const { bindings, context } = setup();
      const listener = mock(() => {});
      context.controls.subscribe(listener);

      bindings!.assign("jump", 0, "Key:KeyF");

      expect(context.controls.bindings).toEqual({ jump: ["Key:KeyF"] });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("does not let the game change them", () => {
      const { context } = setup();

      expect("assign" in context.controls).toBe(false);
      expect("reset" in context.controls).toBe(false);
    });

    test("a game without controls gets no bindings", () => {
      const { context } = setup({ withControls: false });

      expect(context.controls.bindings).toEqual({});
      expect(() => context.controls.subscribe(() => {})()).not.toThrow();
    });
  });

  describe("play", () => {
    test("is the store's game side: the game sees states and may pause", () => {
      const { play, context } = setup();
      play.dispatch("ready");
      play.dispatch("start");

      context.play.pause();

      expect(context.play.state).toBe("paused");
      expect(play.state).toBe("paused");
      expect("dispatch" in context.play).toBe(false);
    });
  });

  describe("log", () => {
    // Fresh spies per test, restored afterwards: all test files share one process and one console.
    let spies: Record<"info" | "warn" | "error", Mock<typeof console.info>>;

    beforeEach(() => {
      spies = {
        info: spyOn(console, "info").mockImplementation(() => {}),
        warn: spyOn(console, "warn").mockImplementation(() => {}),
        error: spyOn(console, "error").mockImplementation(() => {}),
      };
    });

    afterEach(() => {
      for (const spy of Object.values(spies)) {
        spy.mockRestore();
      }
    });

    test.each(["info", "warn", "error"] as const)(
      "%s is prefixed with the game id",
      (level) => {
        const { context } = setup();
        context.log[level]("hello", 42);

        expect(spies[level]).toHaveBeenCalledWith("[bridge]", "hello", 42);
      },
    );

    test("submitScore resolves and logs the score (stub until M5)", async () => {
      const { context } = setup();

      await expect(context.submitScore(1234)).resolves.toBeUndefined();
      expect(spies.info).toHaveBeenCalledWith(
        "[bridge]",
        expect.stringContaining("submitScore"),
        1234,
      );
    });
  });
});
