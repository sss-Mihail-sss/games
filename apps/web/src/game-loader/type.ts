import type { GameModule } from "@repo/game-core";

/** Lazy import of a game's client: `() => import("@repo/game-<id>/client")`. */
export type LoadGame = () => Promise<GameModule>;

/** Loads game code in the browser. Knows ids, not manifests: no zod, no catalog. */
export interface GameLoader<Id extends string = string> {
  /**
   * Loads the game module. Concurrent and repeated calls share one request;
   * a failed load is forgotten, so the next call retries.
   */
  load: (id: Id) => Promise<GameModule>;
  /** Starts loading in the background (e.g. on hover over "Play"); never throws. */
  preload: (id: Id) => void;
}
