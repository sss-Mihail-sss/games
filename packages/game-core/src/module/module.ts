import type { GameManifest } from "../manifest/index.ts";
import type { GameModule, Unmount } from "./type.ts";

type Mount = GameModule["mount"];

export function defineGame<const M extends GameManifest>(game: {
  manifest: M;
  mount: Mount;
}): { manifest: M; mount: Mount } {
  return {
    manifest: game.manifest,
    async mount(element, context) {
      const unmount = await game.mount(element, context);
      let unmounted = false;

      const once: Unmount = () => {
        if (unmounted) {
          return;
        }
        unmounted = true;
        unmount();
      };
      return once;
    },
  };
}
