import type { GameContext, GameModule } from "@repo/game-core";

export interface MountGameOptions {
  /** Контейнер, в который игра добавит свой canvas. */
  element: HTMLElement;
  /** Ленивая загрузка модуля игры: `() => import("@repo/game-<id>/client")`. */
  load: () => Promise<GameModule>;
  /** Всё, кроме `signal`: его создаёт и отменяет сама mountGame. */
  context: Omit<GameContext, "signal">;
  /** Ошибка загрузки или монтирования. После cleanup не вызывается. */
  onError: (error: unknown) => void;
}
