// Server-side: see GameCatalog. Client code may only `import type` from here.
export { createCatalog } from "./catalog.ts";
export { games } from "./games.ts";
export type { GameId } from "./games.ts";
export type { GameCatalog, GameIdOf, ManifestOf } from "./type.ts";
