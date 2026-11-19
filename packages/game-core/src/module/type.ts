import type { GameManifest } from "../manifest/index.ts";
import type { GameContext } from "../context/index.ts";

export type Unmount = () => void;

export interface GameModule {
  manifest: GameManifest;
  mount(el: HTMLElement, ctx: GameContext): Promise<Unmount>;
}
