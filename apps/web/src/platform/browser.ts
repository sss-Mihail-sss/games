import { createSettingsStore } from "./settings.ts";
import { createBrowserStorage } from "./storage.ts";
import type { KeyValueStorage, SettingsStore } from "./type.ts";

let storage: KeyValueStorage | undefined;
let settings: SettingsStore | undefined;

/** localStorage for this page. Client only: call it in effects and handlers. */
export function browserStorage(): KeyValueStorage {
  storage ??= createBrowserStorage();
  return storage;
}

/**
 * One settings store for the whole page: the game and the settings screen
 * (M1-12) must see the same values. Lives as long as the page, and follows
 * changes made in other tabs. Client only.
 */
export function browserSettings(): SettingsStore {
  settings ??= createSettingsStore(browserStorage(), { syncFrom: window });
  return settings;
}
