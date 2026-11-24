import type { KeyValueStorage } from "./type.ts";

/** localStorage, который никогда не бросает: в приватном режиме и при переполнении он может. */
export function createBrowserStorage(): KeyValueStorage {
  return {
    get: (key) => {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // Приватный режим или квота: настройки просто не переживут перезагрузку.
      }
    },
    remove: (key) => {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // Same as set: nothing to do about it.
      }
    },
  };
}

/** Хранилище в памяти: для тестов и как запасной вариант. */
export function createMemoryStorage(
  initial: Record<string, string> = {},
): KeyValueStorage {
  const data = new Map(Object.entries(initial));
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
    remove: (key) => {
      data.delete(key);
    },
  };
}
