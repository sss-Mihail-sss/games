import { describe, expect, mock, test } from "bun:test";

import type { PlatformSettings } from "@repo/game-core";

import { createSettingsStore, DEFAULT_SETTINGS } from "./settings.ts";
import { createMemoryStorage } from "./storage.ts";

const SETTINGS_KEY = "games:settings";

const withStored = (value: unknown) =>
  createSettingsStore(
    createMemoryStorage({
      [SETTINGS_KEY]: typeof value === "string" ? value : JSON.stringify(value),
    }),
  );

describe("createSettingsStore", () => {
  describe("loading", () => {
    test("uses defaults when nothing is stored", () => {
      expect(createSettingsStore(createMemoryStorage()).current).toEqual(
        DEFAULT_SETTINGS,
      );
    });

    test("restores valid stored settings", () => {
      const stored: PlatformSettings = {
        volume: { master: 0.5, music: 0.1, sfx: 1 },
        quality: "low",
        reducedMotion: true,
        locale: "en",
        mouse: { sensitivity: 2.5, invertY: true },
        fov: 105,
      };

      expect(withStored(stored).current).toEqual(stored);
    });

    test("an out-of-range or broken mouse field falls back on its own", () => {
      const { mouse } = withStored({
        mouse: { sensitivity: 50, invertY: "yes" },
      }).current;

      expect(mouse).toEqual(DEFAULT_SETTINGS.mouse);
      expect(
        withStored({ mouse: { sensitivity: 0.1, invertY: true } }).current
          .mouse,
      ).toEqual({ sensitivity: 0.1, invertY: true });
    });

    test.each(["{nope", "null", "42", '"string"', "[]"])(
      "falls back to defaults for unusable JSON %p",
      (raw) => {
        expect(withStored(raw).current).toEqual(DEFAULT_SETTINGS);
      },
    );

    test("replaces only the invalid fields with defaults", () => {
      const current = withStored({
        quality: "ultra",
        volume: { master: 5, music: 0.3 },
        locale: "en",
      }).current;

      expect(current.quality).toBe(DEFAULT_SETTINGS.quality);
      expect(current.volume).toEqual({
        master: DEFAULT_SETTINGS.volume.master, // 5 is out of [0, 1]
        music: 0.3, // valid, kept
        sfx: DEFAULT_SETTINGS.volume.sfx, // missing
      });
      expect(current.locale).toBe("en");
      expect(current.reducedMotion).toBe(DEFAULT_SETTINGS.reducedMotion);
    });

    test.each([69, 111, "90", null])(
      "fov %p out of range or not a number falls back to the default",
      (fov) => {
        expect(withStored({ fov }).current.fov).toBe(DEFAULT_SETTINGS.fov);
      },
    );

    test.each([70, 110])("fov bound %p is inclusive", (fov) => {
      expect(withStored({ fov }).current.fov).toBe(fov);
    });

    test("volume bounds are inclusive", () => {
      expect(
        withStored({ volume: { master: 0, music: 1, sfx: 0.5 } }).current
          .volume,
      ).toEqual({
        master: 0,
        music: 1,
        sfx: 0.5,
      });
    });
  });

  describe("set", () => {
    test("updates current", () => {
      const store = createSettingsStore(createMemoryStorage());
      store.set({ quality: "low" });

      expect(store.current.quality).toBe("low");
    });

    test("merges a partial mouse patch onto the current values", () => {
      const store = createSettingsStore(createMemoryStorage());
      store.set({ mouse: { sensitivity: 2 } });
      store.set({ mouse: { invertY: true } });

      expect(store.current.mouse).toEqual({ sensitivity: 2, invertY: true });
    });

    test("merges a partial volume patch", () => {
      const store = createSettingsStore(createMemoryStorage());
      store.set({ volume: { music: 0.1 } });

      expect(store.current.volume).toEqual({
        ...DEFAULT_SETTINGS.volume,
        music: 0.1,
      });
    });

    test("merges volume patches onto the current values, not the defaults", () => {
      const store = createSettingsStore(createMemoryStorage());
      store.set({ volume: { music: 0.1 } });
      store.set({ volume: { sfx: 0.2 } });

      expect(store.current.volume).toEqual({
        master: DEFAULT_SETTINGS.volume.master,
        music: 0.1,
        sfx: 0.2,
      });
    });

    test("a patch without volume keeps the current volume", () => {
      const store = createSettingsStore(createMemoryStorage());
      store.set({ volume: { master: 0.3 } });
      store.set({ quality: "low" });

      expect(store.current.volume.master).toBe(0.3);
    });

    test("persists across store instances", () => {
      const storage = createMemoryStorage();
      createSettingsStore(storage).set({ locale: "en", volume: { sfx: 0.2 } });

      const reloaded = createSettingsStore(storage).current;
      expect(reloaded.locale).toBe("en");
      expect(reloaded.volume.sfx).toBe(0.2);
    });

    test("produces a new object, so React can detect the change", () => {
      const store = createSettingsStore(createMemoryStorage());
      const before = store.current;
      store.set({ quality: "low" });

      expect(store.current).not.toBe(before);
      expect(before.quality).toBe(DEFAULT_SETTINGS.quality);
    });

    test("never mutates the defaults", () => {
      createSettingsStore(createMemoryStorage()).set({
        quality: "low",
        volume: { master: 0 },
      });

      expect(DEFAULT_SETTINGS.quality).toBe("high");
      expect(DEFAULT_SETTINGS.volume.master).toBe(0.8);
    });
  });

  describe("subscribe", () => {
    test("notifies listeners with the new settings", () => {
      const store = createSettingsStore(createMemoryStorage());
      const listener = mock((_next: Readonly<PlatformSettings>) => {});
      store.subscribe(listener);

      store.set({ quality: "medium" });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0]![0].quality).toBe("medium");
    });

    test("notifies every listener", () => {
      const store = createSettingsStore(createMemoryStorage());
      const a = mock(() => {});
      const b = mock(() => {});
      store.subscribe(a);
      store.subscribe(b);

      store.set({ reducedMotion: true });

      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });

    test("stops notifying after unsubscribe", () => {
      const store = createSettingsStore(createMemoryStorage());
      const listener = mock(() => {});
      const unsubscribe = store.subscribe(listener);

      unsubscribe();
      store.set({ quality: "low" });

      expect(listener).not.toHaveBeenCalled();
    });

    test("a listener may unsubscribe itself while being notified", () => {
      const store = createSettingsStore(createMemoryStorage());
      const other = mock(() => {});
      const unsubscribe = store.subscribe(() => unsubscribe());
      store.subscribe(other);

      expect(() => store.set({ quality: "low" })).not.toThrow();
      expect(other).toHaveBeenCalledTimes(1);
    });
  });
});

describe("sync between tabs", () => {
  /** What the browser fires in *other* tabs after a localStorage write. */
  const storageEvent = (key: string | null) =>
    Object.assign(new Event("storage"), { key });

  function twoTabs() {
    const storage = createMemoryStorage(); // localStorage is shared by the tabs
    const window = new EventTarget();
    const here = createSettingsStore(storage, { syncFrom: window });
    const there = createSettingsStore(storage);
    return { storage, window, here, there };
  }

  test("picks up a change made in another tab and notifies", () => {
    const { window, here, there } = twoTabs();
    const listener = mock((_next: Readonly<PlatformSettings>) => {});
    here.subscribe(listener);

    there.set({ fov: 100 });
    window.dispatchEvent(storageEvent(SETTINGS_KEY));

    expect(here.current.fov).toBe(100);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("ignores other keys and unchanged settings", () => {
    const { window, here } = twoTabs();
    const listener = mock(() => {});
    here.subscribe(listener);

    window.dispatchEvent(storageEvent("games:bridge:bindings"));
    window.dispatchEvent(storageEvent(SETTINGS_KEY)); // nothing changed

    expect(listener).not.toHaveBeenCalled();
  });

  test("broken JSON from another tab means defaults, not a crash", () => {
    const { storage, window, here } = twoTabs();
    here.set({ fov: 100 });
    const listener = mock((_next: Readonly<PlatformSettings>) => {});
    here.subscribe(listener);

    storage.set(SETTINGS_KEY, "{nope");
    window.dispatchEvent(storageEvent(SETTINGS_KEY));

    expect(here.current).toEqual(DEFAULT_SETTINGS);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("localStorage cleared elsewhere (key null) resets to defaults", () => {
    const { storage, window, here } = twoTabs();
    here.set({ quality: "low" });

    storage.remove(SETTINGS_KEY);
    window.dispatchEvent(storageEvent(null));

    expect(here.current.quality).toBe(DEFAULT_SETTINGS.quality);
  });

  test("dispose stops listening", () => {
    const { window, here, there } = twoTabs();
    here.dispose();

    there.set({ fov: 100 });
    window.dispatchEvent(storageEvent(SETTINGS_KEY));

    expect(here.current.fov).toBe(DEFAULT_SETTINGS.fov);
  });
});
