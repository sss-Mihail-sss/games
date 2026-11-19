import type { GameModule } from "@repo/game-core";

import type { GameLoader, LoadGame } from "./type.ts";

export function createLoader<Id extends string>(
  loaders: Readonly<Record<Id, LoadGame>>,
): GameLoader<Id> {
  const loading = new Map<Id, Promise<GameModule>>();

  const load = (id: Id): Promise<GameModule> => {
    let pending = loading.get(id);
    if (!pending) {
      // Own keys only: an id like "toString" must not reach Object.prototype.
      if (!Object.hasOwn(loaders, id)) {
        return Promise.reject(new Error(`Unknown game id "${id}"`));
      }
      pending = loaders[id]().catch((error: unknown) => {
        loading.delete(id); // let the next attempt retry, e.g. after a network blip
        throw error;
      });
      loading.set(id, pending);
    }
    return pending;
  };

  return {
    load,
    preload: (id) => {
      load(id).catch(() => {
        // Preloading is best effort; the real load will report the error.
      });
    },
  };
}
