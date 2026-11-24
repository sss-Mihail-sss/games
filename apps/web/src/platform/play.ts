import type { Play, PlayState } from "@repo/game-core";

/** What the shell shows: `loading` until the game's `mount` has finished. */
export type HostState = "loading" | PlayState;

export type PlayEvent =
  /** `mount` finished: the main menu may offer "Play". */
  | "ready"
  /** "Play" in the main menu. */
  | "start"
  /** Esc, a hidden tab, the game's own request. */
  | "pause"
  /** "Continue" in the pause menu. */
  | "resume"
  /** "To the main menu" from the pause menu. */
  | "exit";

const TRANSITIONS: Readonly<
  Record<HostState, Partial<Record<PlayEvent, HostState>>>
> = {
  loading: { ready: "menu" },
  menu: { start: "playing" },
  playing: { pause: "paused" },
  paused: { resume: "playing", exit: "menu" },
};

/** Anything else is ignored: a pause in the menu, "Play" while loading. */
export function nextPlayState(state: HostState, event: PlayEvent): HostState {
  return TRANSITIONS[state][event] ?? state;
}

/** The game doesn't know about loading: for it the menu is already open. */
const forGame = (state: HostState): PlayState =>
  state === "loading" ? "menu" : state;

export interface PlayStore {
  readonly state: HostState;
  /**
   * Listeners run synchronously, so a click on "Play" reaches the game while
   * the browser still allows it to capture the mouse.
   */
  dispatch(event: PlayEvent): void;
  subscribe(
    listener: (next: HostState, previous: HostState) => void,
  ): () => void;
  /** The game's side: `GameContext.play`. */
  readonly view: Play;
}

export function createPlayStore(): PlayStore {
  let state: HostState = "loading";
  const listeners = new Set<(next: HostState, previous: HostState) => void>();

  const store: PlayStore = {
    get state() {
      return state;
    },
    dispatch: (event) => {
      const previous = state;
      const next = nextPlayState(previous, event);
      if (next === previous) {
        return;
      }
      state = next;
      for (const listener of listeners) {
        listener(next, previous);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    view: {
      get state() {
        return forGame(state);
      },
      subscribe: (listener) =>
        store.subscribe((next, previous) => {
          // loading → menu is no change for the game.
          if (forGame(next) !== forGame(previous)) {
            listener(forGame(next), forGame(previous));
          }
        }),
      pause: () => {
        store.dispatch("pause");
      },
    },
  };
  return store;
}
