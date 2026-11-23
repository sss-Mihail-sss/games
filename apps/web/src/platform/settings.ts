import type { PlatformSettings } from "@repo/game-core";
import * as z from "zod";

import type { KeyValueStorage, SettingsStore } from "./type.ts";

const SETTINGS_KEY = "games:settings";

export const DEFAULT_SETTINGS: Readonly<PlatformSettings> = Object.freeze({
  volume: Object.freeze({ master: 0.8, music: 0.6, sfx: 0.8 }),
  quality: "high",
  reducedMotion: false,
  locale: "ru",
  mouse: Object.freeze({ sensitivity: 1, invertY: false }),
});

const volume = (fallback: number) => z.number().min(0).max(1).catch(fallback);

// localStorage — граница доверия: битое поле заменяется значением по умолчанию, а не роняет игру.
const storedSettings = z
  .object({
    volume: z
      .object({
        master: volume(DEFAULT_SETTINGS.volume.master),
        music: volume(DEFAULT_SETTINGS.volume.music),
        sfx: volume(DEFAULT_SETTINGS.volume.sfx),
      })
      .catch({ ...DEFAULT_SETTINGS.volume }),
    quality: z.enum(["low", "medium", "high"]).catch(DEFAULT_SETTINGS.quality),
    reducedMotion: z.boolean().catch(DEFAULT_SETTINGS.reducedMotion),
    locale: z.enum(["ru", "en"]).catch(DEFAULT_SETTINGS.locale),
    mouse: z
      .object({
        sensitivity: z
          .number()
          .min(0.1)
          .max(5)
          .catch(DEFAULT_SETTINGS.mouse.sensitivity),
        invertY: z.boolean().catch(DEFAULT_SETTINGS.mouse.invertY),
      })
      .catch({ ...DEFAULT_SETTINGS.mouse }),
  })
  .catch({
    ...DEFAULT_SETTINGS,
    volume: { ...DEFAULT_SETTINGS.volume },
    mouse: { ...DEFAULT_SETTINGS.mouse },
  });

function load(storage: KeyValueStorage): PlatformSettings {
  const raw = storage.get(SETTINGS_KEY);
  let json: unknown;
  try {
    json = raw === null ? undefined : JSON.parse(raw);
  } catch {
    json = undefined;
  }
  return storedSettings.parse(json);
}

export function createSettingsStore(storage: KeyValueStorage): SettingsStore {
  let current = load(storage);
  const listeners = new Set<(next: Readonly<PlatformSettings>) => void>();

  return {
    get current() {
      return current;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (patch) => {
      current = {
        ...current,
        ...patch,
        volume: { ...current.volume, ...patch.volume },
        mouse: { ...current.mouse, ...patch.mouse },
      };
      storage.set(SETTINGS_KEY, JSON.stringify(current));
      for (const listener of listeners) {
        listener(current);
      }
    },
  };
}
