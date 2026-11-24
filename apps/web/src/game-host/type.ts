import type { GameContext, GameModule } from "@repo/game-core";

export interface MountGameOptions {
  /** Контейнер, в который игра добавит свой canvas. */
  element: HTMLElement;
  /** Ленивая загрузка модуля игры: `() => import("@repo/game-<id>/client")`. */
  load: () => Promise<GameModule>;
  /**
   * Всё, кроме `signal`: его создаёт и отменяет сама mountGame. Функция от
   * загруженного модуля: раскладке клавиш нужны `controls` игры.
   */
  context: (game: GameModule) => Omit<GameContext, "signal">;
  /** `mount` закончился: главное меню может предложить «Играть». После cleanup не вызывается. */
  onReady?: () => void;
  /** Ошибка загрузки или монтирования. После cleanup не вызывается. */
  onError: (error: unknown) => void;
}
