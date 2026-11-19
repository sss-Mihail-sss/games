import type {
  KeyValueStorage,
  PlatformContext,
  SettingsStore,
} from "./type.ts";
import { getCurrentUser } from "./user.ts";

export interface PlatformDeps {
  storage: KeyValueStorage;
  settings: SettingsStore;
}

export function createPlatformContext(
  gameId: string,
  { storage, settings }: PlatformDeps,
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
    log,
    submitScore: (score) => {
      log.info("submitScore (stub until M5):", score);
      return Promise.resolve();
    },
  };
}
