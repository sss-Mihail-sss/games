import type { Controls } from "../controls/index.ts";
import type { GameManifest } from "../manifest/index.ts";
import type { GameContext } from "../context/index.ts";

export type Unmount = () => void;

export interface GameModule {
  manifest: GameManifest;
  /** Without it the settings screen has no "Keys" tab for this game. */
  controls?: Controls;
  mount(el: HTMLElement, ctx: GameContext): Promise<Unmount>;
}
