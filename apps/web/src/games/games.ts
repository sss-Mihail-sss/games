import { manifest as bridge } from "@repo/game-bridge/manifest";

import { createCatalog } from "./catalog.ts";
import type { GameIdOf } from "./type.ts";

/**
 * All games on the site, in catalog order. Adding a game = its manifest here and
 * its client in game-loader/loaders.ts (the compiler insists on both).
 */
export const games = createCatalog([bridge]);

/** `"bridge" | …` — derived from the manifests, never maintained by hand. */
export type GameId = GameIdOf<typeof games>;
