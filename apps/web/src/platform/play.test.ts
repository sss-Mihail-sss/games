import { describe, expect, mock, test } from "bun:test";

import { createPlayStore, nextPlayState } from "./play.ts";
import type { HostState, PlayEvent } from "./play.ts";

describe("nextPlayState", () => {
  test.each<[HostState, PlayEvent, HostState]>([
    ["loading", "ready", "menu"],
    ["menu", "start", "playing"],
    ["playing", "pause", "paused"],
    ["paused", "resume", "playing"],
    ["paused", "exit", "menu"],
  ])("%s + %s → %s", (state, event, next) => {
    expect(nextPlayState(state, event)).toBe(next);
  });

  test.each<[HostState, PlayEvent]>([
    ["loading", "start"], // "Play" before the game is there
    ["loading", "pause"],
    ["menu", "pause"],
    ["menu", "resume"],
    ["menu", "ready"],
    ["playing", "start"],
    ["playing", "exit"], // the pause menu comes first
    ["paused", "pause"],
  ])("%s + %s is ignored", (state, event) => {
    expect(nextPlayState(state, event)).toBe(state);
  });
});

describe("createPlayStore", () => {
  test("starts loading; the game sees the menu", () => {
    const store = createPlayStore();

    expect(store.state).toBe("loading");
    expect(store.view.state).toBe("menu");
  });

  test("notifies synchronously with the previous state", () => {
    const store = createPlayStore();
    const listener = mock((_next: string, _previous: string) => {});
    store.subscribe(listener);

    store.dispatch("ready");
    store.dispatch("start");

    expect(listener.mock.calls).toEqual([
      ["menu", "loading"],
      ["playing", "menu"],
    ]);
  });

  test("an ignored event notifies nobody", () => {
    const store = createPlayStore();
    const listener = mock((_next: string, _previous: string) => {});
    store.subscribe(listener);

    store.dispatch("pause");

    expect(listener).not.toHaveBeenCalled();
  });

  test("the game hears its own states only, and may ask for a pause", () => {
    const store = createPlayStore();
    const listener = mock((_next: string, _previous: string) => {});
    store.view.subscribe(listener);

    store.dispatch("ready"); // loading → menu: the same "menu" for the game
    store.dispatch("start");
    store.view.pause();
    store.dispatch("exit");

    expect(listener.mock.calls).toEqual([
      ["playing", "menu"],
      ["paused", "playing"],
      ["menu", "paused"],
    ]);
    expect(store.state).toBe("menu");
  });

  test("unsubscribe stops notifications", () => {
    const store = createPlayStore();
    const listener = mock((_next: string, _previous: string) => {});
    store.view.subscribe(listener)();

    store.dispatch("ready");
    store.dispatch("start");

    expect(listener).not.toHaveBeenCalled();
  });
});
