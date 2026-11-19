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

import { createPlatformContext } from "./platform.ts";
import { createSettingsStore } from "./settings.ts";
import { createMemoryStorage } from "./storage.ts";

function setup() {
  const storage = createMemoryStorage();
  const settings = createSettingsStore(storage);
  const context = createPlatformContext("bridge", { storage, settings });
  return { storage, settings, context };
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
