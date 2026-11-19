import * as z from "zod";

import type { GameManifest } from "./type.ts";
import { gameManifestSchema } from "./schema.ts";

export function defineManifest<const M extends GameManifest>(manifest: M): M {
  const result = gameManifestSchema.safeParse(manifest);

  if (!result.success) {
    throw new Error(
      `Invalid manifest for game "${String(manifest?.id)}":\n${z.prettifyError(result.error)}`,
    );
  }

  return manifest;
}
