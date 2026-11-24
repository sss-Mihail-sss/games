"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { PlatformSettings } from "@repo/game-core";

import { browserSettings, DEFAULT_SETTINGS } from "#platform/index.ts";
import type { BindingsMap, BindingsStore } from "#platform/index.ts";

// Module-level, so React sees the same functions on every render.
const subscribeSettings = (onChange: () => void) =>
  browserSettings().subscribe(onChange);
const currentSettings = () => browserSettings().current;
// The server has no localStorage: the HTML uses the defaults, and the real
// values arrive right after hydration.
const serverSettings = () => DEFAULT_SETTINGS;

/** The page's settings store, live: the same one the game reads. */
export function useSettings(): Readonly<PlatformSettings> {
  return useSyncExternalStore(
    subscribeSettings,
    currentSettings,
    serverSettings,
  );
}

const NO_BINDINGS: BindingsMap = Object.freeze({});
const noSubscription = () => () => {};

/** The game's key bindings, live; empty without a store. */
export function useBindings(store: BindingsStore | undefined): BindingsMap {
  // Stable per store: a new function every render would resubscribe every render.
  const subscribe = useCallback(
    (onChange: () => void) =>
      store ? store.subscribe(onChange) : noSubscription(),
    [store],
  );
  return useSyncExternalStore(
    subscribe,
    () => store?.bindings ?? NO_BINDINGS,
    () => store?.bindings ?? NO_BINDINGS,
  );
}
