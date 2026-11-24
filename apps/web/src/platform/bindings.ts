import type { Controls, ControlsView } from "@repo/game-core";

import type { KeyValueStorage } from "./type.ts";

/** Every action of the game → its sources ("Key:KeyW"), main one first. */
export type BindingsMap = Readonly<Record<string, readonly string[]>>;

/** The main key and an extra one, like WASD and the arrows. */
export const MAX_KEYS_PER_ACTION = 2;

const SOURCE = /^Key:([A-Za-z0-9]+)$/;

const F_KEYS = Array.from({ length: 12 }, (_, i) => `F${i + 1}`);

/** Keys a game can't have, and why: shown to the player when they try. */
const FORBIDDEN = new Map<string, string>([
  ["Escape", "Esc всегда отпускает мышь"],
  ["ControlLeft", "Ctrl+W закрывает вкладку"],
  ["ControlRight", "Ctrl+W закрывает вкладку"],
  ["AltLeft", "Alt уводит фокус в меню окна"],
  ["AltRight", "Alt уводит фокус в меню окна"],
  ["MetaLeft", "Клавишу занимает система"],
  ["MetaRight", "Клавишу занимает система"],
  ["CapsLock", "Caps Lock срабатывает как переключатель, а не как клавиша"],
  ...F_KEYS.map((key) => [key, "Клавишу занимает браузер"] as const),
]);

/** Why `code` (`KeyboardEvent.code`) can't be bound, or null if it can. */
export function forbiddenReason(code: string): string | null {
  return FORBIDDEN.get(code) ?? null;
}

function isUsableSource(source: unknown): source is string {
  if (typeof source !== "string") {
    return false;
  }
  const code = SOURCE.exec(source)?.[1];
  return code !== undefined && !FORBIDDEN.has(code);
}

export function defaultBindings(controls: Controls): BindingsMap {
  return loadBindings(undefined, controls);
}

/**
 * Stored bindings, checked against what the game declares now. localStorage is
 * a trust boundary, and the game may have changed since they were saved:
 * - unknown actions, malformed or forbidden sources go;
 * - a source held by two actions stays with the first one;
 * - an action the save doesn't know (the game added it) gets its default
 *   keys, except those the player already gave to something else.
 */
export function loadBindings(raw: unknown, controls: Controls): BindingsMap {
  const stored =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const taken = new Set<string>();
  const result: Record<string, string[]> = {};

  const keep = (action: string, sources: readonly unknown[]) => {
    const list: string[] = [];
    for (const source of sources) {
      if (list.length === MAX_KEYS_PER_ACTION) {
        break;
      }
      if (isUsableSource(source) && !taken.has(source)) {
        taken.add(source);
        list.push(source);
      }
    }
    result[action] = list;
  };

  // The player's own choices first: a new default must not take their key.
  const missing: string[] = [];
  for (const action of controls.actions) {
    const sources = Object.hasOwn(stored, action) ? stored[action] : undefined;
    if (Array.isArray(sources)) {
      keep(action, sources);
    } else {
      missing.push(action);
    }
  }
  for (const action of missing) {
    keep(action, controls.defaults[action] ?? []);
  }

  // In the game's order, whichever pass filled them.
  return Object.fromEntries(
    controls.actions.map((action) => [action, result[action] ?? []]),
  );
}

export type AssignResult =
  | { ok: true; bindings: BindingsMap }
  /** Another action has the key; nothing changed. Ask, then pass `replace`. */
  | { ok: false; conflict: string }
  | { ok: false; forbidden: string };

/**
 * Puts `source` into `slot` (0 main, 1 extra) of `action`. A slot past the
 * end appends, so the list has no holes.
 */
export function assignKey(
  bindings: BindingsMap,
  action: string,
  slot: number,
  source: string,
  { replace = false }: { replace?: boolean } = {},
): AssignResult {
  if (!Object.hasOwn(bindings, action)) {
    throw new Error(`Unknown action "${action}"`);
  }
  const code = SOURCE.exec(source)?.[1];
  if (code === undefined) {
    throw new Error(`Not a key source: "${source}"`);
  }
  const reason = forbiddenReason(code);
  if (reason !== null) {
    return { ok: false, forbidden: reason };
  }

  const own = bindings[action] ?? [];
  if (own.includes(source)) {
    return { ok: true, bindings }; // already this action's: nothing to do
  }
  const holder = Object.keys(bindings).find((other) =>
    bindings[other]?.includes(source),
  );
  if (holder !== undefined && !replace) {
    return { ok: false, conflict: holder };
  }

  const next: Record<string, readonly string[]> = { ...bindings };
  if (holder !== undefined) {
    next[holder] = (bindings[holder] ?? []).filter((it) => it !== source);
  }
  const list = [...own];
  const at = Math.min(Math.max(0, slot), MAX_KEYS_PER_ACTION - 1);
  if (at < list.length) {
    list[at] = source;
  } else {
    list.push(source);
  }
  next[action] = list;
  return { ok: true, bindings: next };
}

/** Empties `slot` of `action`; the extra key moves up if the main one goes. */
export function clearKey(
  bindings: BindingsMap,
  action: string,
  slot: number,
): BindingsMap {
  const own = bindings[action];
  if (!own || slot < 0 || slot >= own.length) {
    return bindings;
  }
  return { ...bindings, [action]: own.filter((_, i) => i !== slot) };
}

export interface BindingsStore extends ControlsView {
  readonly bindings: BindingsMap;
  assign(
    action: string,
    slot: number,
    source: string,
    options?: { replace?: boolean },
  ): AssignResult;
  clear(action: string, slot: number): void;
  /** Back to the game's defaults, and forgets the save: future defaults apply. */
  reset(): void;
}

/**
 * The player's bindings for one game, kept by the platform at
 * `games:<id>:bindings`: checks, conflicts and reset live here once for every
 * game. Saved only after a change, so an untouched game follows its defaults.
 */
export function createBindingsStore(
  storage: KeyValueStorage,
  gameId: string,
  controls: Controls,
): BindingsStore {
  const key = `games:${gameId}:bindings`;
  const listeners = new Set<(next: BindingsMap) => void>();

  const read = (): unknown => {
    const raw = storage.get(key);
    try {
      return raw === null ? undefined : (JSON.parse(raw) as unknown);
    } catch {
      return undefined;
    }
  };
  let current = loadBindings(read(), controls);

  const change = (next: BindingsMap, save: boolean) => {
    if (next === current) {
      return;
    }
    current = next;
    if (save) {
      storage.set(key, JSON.stringify(current));
    }
    for (const listener of listeners) {
      listener(current);
    }
  };

  return {
    get bindings() {
      return current;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    assign: (action, slot, source, options) => {
      const result = assignKey(current, action, slot, source, options);
      if (result.ok) {
        change(result.bindings, true);
      }
      return result;
    },
    clear: (action, slot) => {
      change(clearKey(current, action, slot), true);
    },
    reset: () => {
      storage.remove(key);
      change(defaultBindings(controls), false);
    },
  };
}
