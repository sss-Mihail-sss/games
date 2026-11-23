// Type-only: the catalog (manifests + zod) must not end up in the client bundle.
import type { GameId } from "#games/index.ts";
import { createLoader } from "./loader.ts";

/**
 * Game code for the browser. `<GameId>` makes the compiler require a loader for
 * every game in the catalog and reject loaders for unknown ids. Each `import()`
 * becomes a separate chunk that is only fetched on preload or on the game page.
 */
export const gameLoader = createLoader<GameId>({
  bridge: () =>
    import("@repo/game-bridge/client").then((module) => module.default),
});
