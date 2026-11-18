import * as z from "zod";

import { type GameManifest, gameManifestSchema } from "../manifest/index.ts";
import { type GameModule } from "../module/index.ts";
import type { Unmount } from "../module/schema.ts";

type Mount = GameModule["mount"];

export function defineGame<const M extends GameManifest>(game: {
  manifest: M;
  mount: Mount;
}): { manifest: M; mount: Mount } {
  const result = gameManifestSchema.safeParse(game.manifest);

  if (!result.success) {
    throw new Error(
      `Invalid manifest for game "${String(game.manifest?.id)}":\n${z.prettifyError(result.error)}`,
    );
  }

  return {
    manifest: game.manifest,
    async mount(element, context) {
      const unmount = await game.mount(element, context);
      let unmounted = false;

      const once: Unmount = () => {
        if (unmounted) return;
        unmounted = true;
        unmount();
      };
      return once;
    },
  };
}
