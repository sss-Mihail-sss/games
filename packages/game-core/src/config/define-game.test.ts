import { test, expect, mock } from "bun:test";

import { defineGame } from "./define-game.ts";
import type { GameManifest } from "../manifest";
import type { GameContext } from "../context";

const element = {} as HTMLElement;
const context = {} as GameContext;
const base = { title: "Bridge", kind: "3d", thumbnail: "" } as const;

test("unmount is idempotent", async () => {
  const cleanup = mock(() => {});
  const game = defineGame({
    manifest: { ...base, id: "bridge" },
    mount: async () => cleanup,
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

expect(
  test("invalid id", () => {
    // @ts-expect-error mount must return Promise<Unmount>
    defineGame({ manifest: { ...base, id: "Bridge asdasd" }, mount: () => {} });
  }),
).toThrow(/id/);

expect(
  test("invalid multiplayer", () => {
    defineGame({
      manifest: {
        ...base,
        id: "bridge",
        multiplayer: { minPlayers: 8, maxPlayers: 2, modes: [] },
      },
      // @ts-expect-error mount must return Promise<Unmount>
      mount: () => {},
    });
  }),
).toThrow(/minPlayers/);
