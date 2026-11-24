import { describe, expect, mock, test } from "bun:test";

import type { Controls } from "@repo/game-core";

import {
  assignKey,
  clearKey,
  createBindingsStore,
  defaultBindings,
  forbiddenReason,
  loadBindings,
} from "./bindings.ts";
import { createMemoryStorage } from "./storage.ts";

const controls: Controls<"forward" | "jump" | "crouch"> = {
  actions: ["forward", "jump", "crouch"],
  labels: { forward: "Вперёд", jump: "Прыжок", crouch: "Присед" },
  defaults: {
    forward: ["Key:KeyW", "Key:ArrowUp"],
    jump: ["Key:Space"],
    crouch: ["Key:KeyC"],
  },
};

const DEFAULTS = {
  forward: ["Key:KeyW", "Key:ArrowUp"],
  jump: ["Key:Space"],
  crouch: ["Key:KeyC"],
};

const KEY = "games:bridge:bindings";

describe("loadBindings", () => {
  // Each in its own row: a bare [] would be read as an empty argument list.
  test.each([[undefined], [null], [42], ["x"], [[]]])(
    "%p is the game's defaults",
    (raw: unknown) => {
      expect(loadBindings(raw, controls)).toEqual(DEFAULTS);
    },
  );

  test("keeps the player's choices, including an action left unbound", () => {
    const raw = { forward: ["Key:KeyI"], jump: [], crouch: ["Key:KeyX"] };

    expect(loadBindings(raw, controls)).toEqual(raw);
  });

  test("drops unknown actions, junk, forbidden keys and extra keys", () => {
    const loaded = loadBindings(
      {
        fly: ["Key:KeyF"],
        forward: ["Key:KeyI", 7, "Mouse:0", "Key:", "Key:KeyK", "Key:KeyL"],
        jump: ["Key:Escape", "Key:ControlLeft", "Key:F5"],
        crouch: ["Key:KeyX"],
      },
      controls,
    );

    expect(loaded).toEqual({
      forward: ["Key:KeyI", "Key:KeyK"],
      jump: [],
      crouch: ["Key:KeyX"],
    });
  });

  test("a key saved for two actions stays with the first", () => {
    const loaded = loadBindings(
      { forward: ["Key:KeyW"], jump: ["Key:KeyW", "Key:KeyJ"], crouch: [] },
      controls,
    );

    expect(loaded.jump).toEqual(["Key:KeyJ"]);
  });

  test("an action the save doesn't know gets its defaults", () => {
    const loaded = loadBindings(
      { forward: ["Key:KeyI"], jump: ["Key:KeyJ"] }, // saved before "crouch" existed
      controls,
    );

    expect(loaded.crouch).toEqual(["Key:KeyC"]);
  });

  test("...but not a default key the player gave to another action", () => {
    const loaded = loadBindings(
      { forward: ["Key:KeyW"], jump: ["Key:KeyC"] },
      controls,
    );

    expect(loaded.jump).toEqual(["Key:KeyC"]);
    expect(loaded.crouch).toEqual([]);
  });

  test("lists actions in the game's order", () => {
    const loaded = loadBindings({ crouch: [], jump: [] }, controls);

    expect(Object.keys(loaded)).toEqual(["forward", "jump", "crouch"]);
  });
});

describe("forbiddenReason", () => {
  test.each([
    "Escape",
    "ControlLeft",
    "AltRight",
    "MetaLeft",
    "CapsLock",
    "F1",
    "F12",
  ])("%s can't be bound", (code) => {
    expect(forbiddenReason(code)).toBeTypeOf("string");
  });

  test.each(["KeyW", "Space", "ShiftLeft", "Tab", "F13"])("%s can", (code) => {
    expect(forbiddenReason(code)).toBeNull();
  });
});

describe("assignKey", () => {
  const bindings = defaultBindings(controls);

  test("replaces the main key", () => {
    const result = assignKey(bindings, "jump", 0, "Key:KeyF");

    expect(result).toEqual({
      ok: true,
      bindings: { ...DEFAULTS, jump: ["Key:KeyF"] },
    });
  });

  test("a slot past the end appends: no holes", () => {
    const result = assignKey(bindings, "jump", 1, "Key:KeyF");

    expect(result.ok && result.bindings.jump).toEqual([
      "Key:Space",
      "Key:KeyF",
    ]);
  });

  test("a key of another action is a conflict, and nothing changes", () => {
    expect(assignKey(bindings, "jump", 0, "Key:KeyC")).toEqual({
      ok: false,
      conflict: "crouch",
    });
  });

  test("replace moves the key from the other action", () => {
    const result = assignKey(bindings, "jump", 0, "Key:ArrowUp", {
      replace: true,
    });

    expect(result.ok && result.bindings).toEqual({
      forward: ["Key:KeyW"],
      jump: ["Key:ArrowUp"],
      crouch: ["Key:KeyC"],
    });
  });

  test("the action's own key in its other slot changes nothing", () => {
    const result = assignKey(bindings, "forward", 1, "Key:KeyW");

    expect(result).toEqual({ ok: true, bindings });
  });

  test("a forbidden key says why", () => {
    const result = assignKey(bindings, "jump", 0, "Key:Escape");

    expect(result.ok).toBe(false);
    expect("forbidden" in result && result.forbidden).toBeTypeOf("string");
  });

  test("never mutates its input", () => {
    const before = structuredClone(bindings);
    assignKey(bindings, "jump", 0, "Key:ArrowUp", { replace: true });

    expect(bindings).toEqual(before);
  });

  test("an unknown action or a malformed source is a bug, not input", () => {
    expect(() => assignKey(bindings, "fly", 0, "Key:KeyF")).toThrow();
    expect(() => assignKey(bindings, "jump", 0, "KeyF")).toThrow();
  });
});

describe("clearKey", () => {
  const bindings = defaultBindings(controls);

  test("clearing the main key moves the extra one up", () => {
    expect(clearKey(bindings, "forward", 0).forward).toEqual(["Key:ArrowUp"]);
  });

  test("an empty slot changes nothing", () => {
    expect(clearKey(bindings, "jump", 1)).toBe(bindings);
  });
});

describe("createBindingsStore", () => {
  test("starts from what is stored, checked", () => {
    const storage = createMemoryStorage({
      [KEY]: JSON.stringify({ jump: ["Key:KeyF", "Key:Escape"] }),
    });

    const store = createBindingsStore(storage, "bridge", controls);

    expect(store.bindings).toEqual({ ...DEFAULTS, jump: ["Key:KeyF"] });
  });

  test("broken JSON is the defaults", () => {
    const storage = createMemoryStorage({ [KEY]: "{nope" });

    expect(createBindingsStore(storage, "bridge", controls).bindings).toEqual(
      DEFAULTS,
    );
  });

  test("saves nothing until the player changes something", () => {
    const storage = createMemoryStorage();
    createBindingsStore(storage, "bridge", controls);

    expect(storage.get(KEY)).toBeNull();
  });

  test("assign saves, notifies and survives a reload", () => {
    const storage = createMemoryStorage();
    const store = createBindingsStore(storage, "bridge", controls);
    const listener = mock(() => {});
    store.subscribe(listener);

    store.assign("jump", 0, "Key:KeyF");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(
      createBindingsStore(storage, "bridge", controls).bindings.jump,
    ).toEqual(["Key:KeyF"]);
  });

  test("a conflict neither saves nor notifies", () => {
    const storage = createMemoryStorage();
    const store = createBindingsStore(storage, "bridge", controls);
    const listener = mock(() => {});
    store.subscribe(listener);

    expect(store.assign("jump", 0, "Key:KeyC")).toEqual({
      ok: false,
      conflict: "crouch",
    });
    expect(listener).not.toHaveBeenCalled();
    expect(storage.get(KEY)).toBeNull();
  });

  test("reset brings the defaults back and forgets the save", () => {
    const storage = createMemoryStorage();
    const store = createBindingsStore(storage, "bridge", controls);
    store.assign("jump", 0, "Key:KeyF");
    store.clear("forward", 0);

    store.reset();

    expect(store.bindings).toEqual(DEFAULTS);
    expect(storage.get(KEY)).toBeNull();
  });

  test("games keep their bindings apart", () => {
    const storage = createMemoryStorage();
    createBindingsStore(storage, "bridge", controls).assign(
      "jump",
      0,
      "Key:KeyF",
    );

    expect(
      createBindingsStore(storage, "other", controls).bindings.jump,
    ).toEqual(["Key:Space"]);
  });
});
