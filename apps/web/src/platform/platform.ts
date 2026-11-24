import type { ControlsView } from "@repo/game-core";

import type { BindingsStore } from "./bindings.ts";
import { createGameStorage } from "./game-storage.ts";
import type { PlayStore } from "./play.ts";
import type {
  KeyValueStorage,
  PlatformContext,
  SettingsStore,
} from "./type.ts";
import { getCurrentUser } from "./user.ts";

export interface PlatformDeps {
  storage: KeyValueStorage;
  settings: SettingsStore;
  play: PlayStore;
  /** The game's key bindings; absent if the game declares no `controls`. */
  bindings?: BindingsStore;
}

const NO_CONTROLS: ControlsView = Object.freeze({
  bindings: Object.freeze({}),
  subscribe: () => () => {},
});

export function createPlatformContext(
  gameId: string,
  { storage, settings, play, bindings }: PlatformDeps,
): PlatformContext {
  const prefix = `[${gameId}]`;
  const log: PlatformContext["log"] = {
    info: (...args: unknown[]) => console.info(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };

  return {
    user: getCurrentUser(storage),
    // Обёртка, а не сам store: игра не должна получить доступ к settings.set.
    settings: {
      get current() {
        return settings.current;
      },
      subscribe: (listener) => settings.subscribe(listener),
    },
    storage: createGameStorage(storage, gameId),
    // Read-only wrappers, as with settings: the platform edits bindings and
    // decides the state, the game only follows.
    controls: bindings
      ? {
          get bindings() {
            return bindings.bindings;
          },
          subscribe: (listener) => bindings.subscribe(listener),
        }
      : NO_CONTROLS,
    play: play.view,
    log,
    submitScore: (score) => {
      log.info("submitScore (stub until M5):", score);
      return Promise.resolve();
    },
  };
}
