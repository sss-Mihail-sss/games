import type { GameContext, PlatformSettings } from "@repo/game-core";

/** Минимальное key-value хранилище: localStorage в браузере, Map в тестах. */
export interface KeyValueStorage {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
}

/** Всё, что оболочка даёт игре, кроме `signal` (его создаёт mountGame). */
export type PlatformContext = Omit<GameContext, "signal">;

export type SettingsPatch = Partial<Omit<PlatformSettings, "volume">> & {
  volume?: Partial<PlatformSettings["volume"]>;
};

/** То, что видит игра (`current`, `subscribe`), плюс `set` — только для оболочки. */
export interface SettingsStore extends Readonly<GameContext["settings"]> {
  set: (patch: SettingsPatch) => void;
}
