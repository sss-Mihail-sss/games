import type { Unmount } from "@repo/game-core";

import type { MountGameOptions } from "./type.ts";

export function mountGame({
  element,
  load,
  context,
  onReady,
  onError,
}: MountGameOptions): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  let unmount: Unmount | undefined;

  async function run() {
    const game = await load();
    if (signal.aborted) {
      return;
    } // ушли со страницы, пока грузился чанк

    unmount = await game.mount(element, { ...context(game), signal });
    if (signal.aborted) {
      unmount(); // ушли, пока игра монтировалась
      return;
    }
    onReady?.();
  }

  run().catch((error: unknown) => {
    if (!signal.aborted) {
      onError(error);
    }
  });

  return () => {
    // Idempotent on our side too: GameModule may come from anywhere, not only defineGame.
    if (signal.aborted) {
      return;
    }
    controller.abort();
    unmount?.();
  };
}
