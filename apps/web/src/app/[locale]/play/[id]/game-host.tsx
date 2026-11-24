"use client";

import { useEffect, useRef, useState } from "react";

import { mountGame } from "#game-host/index.ts";
import { gameLoader } from "#game-loader/index.ts";
import type { GameId } from "#games/index.ts";
import type { Locale } from "#locale/index.ts";
import {
  browserSettings,
  browserStorage,
  createBindingsStore,
  createPlatformContext,
  createPlayStore,
} from "#platform/index.ts";

interface GameHostProps {
  gameId: GameId;
  locale: Locale;
}

/**
 * Client island that runs one game. All the lifecycle logic lives in mountGame;
 * this component only gives it an element and turns async errors into render
 * errors, so that error.tsx can show them.
 */
export function GameHost({ gameId, locale }: GameHostProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  // Wrapped in an object: a game may reject with any value, even undefined.
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  if (failure) {
    // Error boundaries only see errors thrown during render.
    throw failure.error;
  }

  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    const storage = browserStorage();
    const settings = browserSettings();
    // The URL is the source of truth for the language.
    if (settings.current.locale !== locale) {
      settings.set({ locale });
    }
    const play = createPlayStore();

    return mountGame({
      element,
      load: () => gameLoader.load(gameId),
      context: (game) =>
        createPlatformContext(gameId, {
          storage,
          settings,
          play,
          bindings: game.controls
            ? createBindingsStore(storage, gameId, game.controls)
            : undefined,
        }),
      onReady: () => {
        play.dispatch("ready");
        // Until the menus (M1-12, part C) there is no "Play" button: start at
        // once. The game still captures the mouse on a click on the canvas.
        play.dispatch("start");
      },
      onError: (error) => {
        setFailure({ error });
      },
    });
  }, [gameId, locale]);

  return <div ref={elementRef} className="min-h-0 flex-1" />;
}
