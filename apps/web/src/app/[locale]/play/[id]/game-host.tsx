"use client";

import { useEffect, useRef, useState } from "react";

import { mountGame } from "#game-host/index.ts";
import { gameLoader } from "#game-loader/index.ts";
import type { GameId } from "#games/index.ts";
import type { Locale } from "#locale/index.ts";
import {
  createBrowserStorage,
  createPlatformContext,
  createSettingsStore,
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

    const storage = createBrowserStorage();
    const settings = createSettingsStore(storage);
    // The URL is the source of truth for the language.
    if (settings.current.locale !== locale) {
      settings.set({ locale });
    }

    return mountGame({
      element,
      load: () => gameLoader.load(gameId),
      context: createPlatformContext(gameId, { storage, settings }),
      onError: (error) => {
        setFailure({ error });
      },
    });
  }, [gameId, locale]);

  return <div ref={elementRef} className="min-h-0 flex-1" />;
}
