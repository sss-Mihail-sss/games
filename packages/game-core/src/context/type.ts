import type { ControlsView } from "../controls/index.ts";
import type { Play } from "../play/index.ts";
import type { PlatformSettings } from "../platform-settings/index.ts";
import type { GameStorage } from "../storage/index.ts";
import type { User } from "../user/index.ts";

export interface GameContext {
  user: User;
  settings: {
    readonly current: Readonly<PlatformSettings>;
    subscribe(listener: (next: Readonly<PlatformSettings>) => void): () => void;
  };
  /** The game's own data, kept apart from other games. */
  storage: GameStorage;
  /** The player's key bindings for this game's `controls`. */
  controls: ControlsView;
  /** Menu, playing or paused: decided by the platform's menus. */
  play: Play;
  signal: AbortSignal;
  submitScore: (score: number) => Promise<void>;
  log: Pick<Console, "info" | "warn" | "error">;
}
