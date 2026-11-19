import type { User } from "../user/index.ts";
import type { PlatformSettings } from "../platform-settings/index.ts";

export interface GameContext {
  user: User;
  settings: {
    readonly current: Readonly<PlatformSettings>;
    subscribe(listener: (next: Readonly<PlatformSettings>) => void): () => void;
  };
  signal: AbortSignal;
  submitScore: (score: number) => Promise<void>;
  log: Pick<Console, "info" | "warn" | "error">;
}
