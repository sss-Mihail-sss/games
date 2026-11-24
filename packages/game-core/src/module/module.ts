import type { Controls } from "../controls/index.ts";
import type { GameManifest } from "../manifest/index.ts";
import type { GameModule, Unmount } from "./type.ts";

type Mount = GameModule["mount"];

export function defineGame<
  const M extends GameManifest,
  Action extends string = never,
>(game: {
  manifest: M;
  controls?: Controls<Action>;
  mount: Mount;
}): { manifest: M; controls?: Controls<Action>; mount: Mount } {
  return {
    manifest: game.manifest,
    ...(game.controls && { controls: game.controls }),
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
