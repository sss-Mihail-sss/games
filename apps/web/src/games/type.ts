import type { GameManifest, GameModule } from "@repo/game-core";

export interface GameEntry {
  manifest: GameManifest;
  /** Lazy import of the game's client: `() => import("@repo/game-<id>/client")`. */
  load: () => Promise<GameModule>;
}

export interface GameRegistry<Id extends string = string> {
  /** Manifests of all games, in catalog order. Cheap: no game code involved. */
  readonly manifests: readonly (GameManifest & { id: Id })[];
  /** Narrows an arbitrary string (a URL segment) to a known game id. */
  has: (id: string) => id is Id;
  manifest: (id: Id) => GameManifest & { id: Id };
  /**
   * Loads the game module. Concurrent and repeated calls share one request;
   * a failed load is forgotten, so the next call retries.
   */
  load: (id: Id) => Promise<GameModule>;
  /** Starts loading in the background (e.g. on hover over "Play"); never throws. */
  preload: (id: Id) => void;
}

/** The id union of a registry: `GameIdOf<typeof games>` → `"bridge" | …`. */
export type GameIdOf<R> = R extends GameRegistry<infer Id> ? Id : never;
