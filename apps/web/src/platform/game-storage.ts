import type { GameStorage } from "@repo/game-core";

import type { KeyValueStorage } from "./type.ts";

/**
 * A game's own data: `games:<id>:data:<key>`. The prefix keeps games apart
 * from each other and from what the platform keeps for them, like the key
 * bindings (`games:<id>:bindings`).
 */
export function createGameStorage(
  storage: KeyValueStorage,
  gameId: string,
): GameStorage {
  const prefix = `games:${gameId}:data:`;

  return {
    get: (key) => {
      const raw = storage.get(prefix + key);
      if (raw === null) {
        return undefined;
      }
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return undefined; // edited by hand or cut short: as if nothing were stored
      }
    },
    set: (key, value) => {
      storage.set(prefix + key, JSON.stringify(value));
    },
    remove: (key) => {
      storage.remove(prefix + key);
    },
  };
}
