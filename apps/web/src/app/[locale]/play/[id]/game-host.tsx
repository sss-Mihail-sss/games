"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type { Controls } from "@repo/game-core";

import { mountGame } from "#game-host/index.ts";
import { gameLoader } from "#game-loader/index.ts";
import { MainMenu, PauseMenu, SettingsScreen } from "#game-shell/index.ts";
import type { GameId } from "#games/index.ts";
import type { Locale } from "#locale/index.ts";
import {
  browserSettings,
  browserStorage,
  createBindingsStore,
  createPlatformContext,
  createPlayStore,
} from "#platform/index.ts";
import type { BindingsStore, HostState, PlayStore } from "#platform/index.ts";
import { catalogPath } from "#site/index.ts";

interface GameHostProps {
  gameId: GameId;
  title: string;
  locale: Locale;
}

/** What the settings screen needs from the loaded game. */
interface GameKeys {
  controls: Controls;
  bindings: BindingsStore;
}

/**
 * Client island that runs one game, with the platform's menus over it. The
 * lifecycle lives in mountGame and the state in the play store; this
 * component gives the game an element, draws the menu for the current state,
 * and turns async errors into render errors, so that error.tsx can show them.
 */
export function GameHost({ gameId, title, locale }: GameHostProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  // Wrapped in an object: a game may reject with any value, even undefined.
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const playRef = useRef<PlayStore | null>(null);
  const [state, setState] = useState<HostState>("loading");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keys, setKeys] = useState<GameKeys | null>(null);

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
    playRef.current = play;
    setState(play.state);
    const unsubscribe = play.subscribe((next) => {
      setState(next);
      if (next === "playing") {
        setSettingsOpen(false);
      }
    });

    const stop = mountGame({
      element,
      load: () => gameLoader.load(gameId),
      context: (game) => {
        const bindings = game.controls
          ? createBindingsStore(storage, gameId, game.controls)
          : undefined;
        setKeys(
          game.controls && bindings
            ? { controls: game.controls, bindings }
            : null,
        );
        return createPlatformContext(gameId, {
          storage,
          settings,
          play,
          bindings,
        });
      },
      onReady: () => {
        play.dispatch("ready");
      },
      onError: (error) => {
        setFailure({ error });
      },
    });
    return () => {
      stop();
      unsubscribe();
      playRef.current = null;
      setKeys(null);
    };
  }, [gameId, locale]);

  // Each runs inside the click, and the play store calls the game at once:
  // the browser still lets the game capture the mouse there.
  const dispatch = (event: Parameters<PlayStore["dispatch"]>[0]) => {
    playRef.current?.dispatch(event);
  };

  const menuOpen = state !== "playing";

  const onKeyDown = (event: ReactKeyboardEvent) => {
    // Esc in the settings goes back. In the pause menu it does nothing: Esc is
    // not a user action the browser lets the game capture the mouse from.
    if (event.key === "Escape" && settingsOpen) {
      event.preventDefault();
      setSettingsOpen(false);
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* inert while a menu is open: Tab stays in the menu, not in the canvas. */}
      <div ref={elementRef} inert={menuOpen} className="min-h-0 flex-1" />
      {menuOpen && (
        <div
          onKeyDown={onKeyDown}
          className="absolute inset-0 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        >
          {settingsOpen ? (
            <SettingsScreen
              controls={keys?.controls}
              bindings={keys?.bindings}
              onClose={() => setSettingsOpen(false)}
            />
          ) : state === "paused" ? (
            <PauseMenu
              onResume={() => dispatch("resume")}
              onSettings={() => setSettingsOpen(true)}
              onExit={() => dispatch("exit")}
            />
          ) : (
            <MainMenu
              title={title}
              ready={state === "menu"}
              catalogHref={catalogPath(locale)}
              onPlay={() => dispatch("start")}
              onSettings={() => setSettingsOpen(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}
