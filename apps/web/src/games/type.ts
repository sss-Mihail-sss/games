import type { GameManifest } from "@repo/game-core";

/** A manifest whose id is narrowed to the catalog's id union. */
export type ManifestOf<Id extends string> = GameManifest & { id: Id };

/**
 * The list of games on the site. Server-side only: manifests are validated with
 * zod at import time, so importing a catalog drags zod into a client bundle.
 * Client code imports `GameId` as a type and loads games via `game-loader`.
 */
export interface GameCatalog<Id extends string = string> {
  /** Manifests of all games, in catalog order. Cheap: no game code involved. */
  readonly manifests: readonly ManifestOf<Id>[];
  /** Narrows an arbitrary string (a URL segment) to a known game id. */
  has: (id: string) => id is Id;
  manifest: (id: Id) => ManifestOf<Id>;
}

/** The id union of a catalog: `GameIdOf<typeof games>` → `"bridge" | …`. */
export type GameIdOf<C> = C extends GameCatalog<infer Id> ? Id : never;
