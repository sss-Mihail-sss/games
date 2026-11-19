import type { GameManifest, GameModule } from "@repo/game-core";

import type { GameEntry, GameRegistry } from "./type.ts";

type IdOf<E extends readonly GameEntry[]> = E[number]["manifest"]["id"];
type ManifestOf<Id extends string> = GameManifest & { id: Id };

export function createRegistry<const E extends readonly GameEntry[]>(
  entries: E,
): GameRegistry<IdOf<E>> {
  type Id = IdOf<E>;

  const byId = new Map<string, GameEntry>();
  for (const entry of entries) {
    if (byId.has(entry.manifest.id)) {
      throw new Error(
        `Duplicate game id "${entry.manifest.id}" in the registry`,
      );
    }
    byId.set(entry.manifest.id, entry);
  }

  const loading = new Map<string, Promise<GameModule>>();

  const entry = (id: Id): GameEntry => {
    const found = byId.get(id);
    if (!found) {
      throw new Error(`Unknown game id "${id}"`);
    }
    return found;
  };

  const load = (id: Id): Promise<GameModule> => {
    let pending = loading.get(id);
    if (!pending) {
      pending = entry(id)
        .load()
        .catch((error: unknown) => {
          loading.delete(id); // let the next attempt retry, e.g. after a network blip
          throw error;
        });
      loading.set(id, pending);
    }
    return pending;
  };

  // Safe: Id is derived from exactly these manifests, so every id is an Id.
  const manifests = entries.map((e) => e.manifest) as ManifestOf<Id>[];

  return {
    manifests,
    has: (id): id is Id => byId.has(id),
    manifest: (id) => entry(id).manifest,
    load,
    preload: (id) => {
      load(id).catch(() => {
        // Preloading is best effort; the real load will report the error.
      });
    },
  };
}
