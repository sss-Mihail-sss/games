import { manifest as bridge } from "@repo/game-bridge/manifest";

import { createRegistry } from "./registry.ts";
import type { GameIdOf } from "./type.ts";

/**
 * All games on the site. Manifests are imported statically (they are tiny and the
 * catalog needs them on the server); game code is only reachable through `load`,
 * so the bundler puts each game into its own chunk.
 */
export const games = createRegistry([
  {
    manifest: bridge,
    load: () =>
      import("@repo/game-bridge/client").then((module) => module.default),
  },
]);

/** `"bridge" | …` — derived from the manifests, never maintained by hand. */
export type GameId = GameIdOf<typeof games>;
