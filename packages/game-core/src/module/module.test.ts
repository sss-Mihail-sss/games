import { test, expect, mock } from "bun:test";

import { defineGame } from "./module.ts";
import type { GameContext } from "../context/index.ts";

const element = {} as HTMLElement;
const context = {} as GameContext;
const base = { title: "Bridge", kind: "3d", thumbnail: "" } as const;

test("unmount is idempotent", async () => {
  const cleanup = mock(() => {});
  const game = defineGame({
    manifest: { ...base, id: "bridge" },
    mount: () => Promise.resolve(cleanup),
  });

  const unmount = await game.mount(element, context);
  unmount();
  unmount();

  expect(cleanup).toHaveBeenCalledTimes(1);
});

test("mount signature is enforced", () => {
  // @ts-expect-error mount must return Promise<Unmount>
  defineGame({ manifest: { ...base, id: "bridge" }, mount: () => {} });
});

test("keeps the game's controls for the platform", () => {
  const controls = {
    actions: ["jump"],
    labels: { jump: "Прыжок" },
    defaults: { jump: ["Key:Space"] },
  } as const;
  const game = defineGame({
    manifest: { ...base, id: "bridge" },
    controls,
    mount: () => Promise.resolve(() => {}),
  });

  expect(game.controls).toBe(controls);
  defineGame({
    manifest: { ...base, id: "bridge" },
    // @ts-expect-error a label for every action
    controls: { actions: ["jump"], labels: {}, defaults: {} },
    mount: () => Promise.resolve(() => {}),
  });
});
