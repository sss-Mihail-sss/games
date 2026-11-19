import type { GameManifest } from "@repo/game-core";

import type { GameCatalog } from "./type.ts";

type IdOf<M extends readonly GameManifest[]> = M[number]["id"];

export function createCatalog<const M extends readonly GameManifest[]>(
  manifests: M,
): GameCatalog<IdOf<M>> {
  type Id = IdOf<M>;

  const byId = new Map<string, GameManifest>();
  for (const manifest of manifests) {
    if (byId.has(manifest.id)) {
      throw new Error(`Duplicate game id "${manifest.id}" in the catalog`);
    }
    byId.set(manifest.id, manifest);
  }

  return {
    manifests,
    has: (id): id is Id => byId.has(id),
    manifest: (id) => {
      const found = byId.get(id);
      if (!found) {
        throw new Error(`Unknown game id "${id}"`);
      }
      return found;
    },
  };
}
