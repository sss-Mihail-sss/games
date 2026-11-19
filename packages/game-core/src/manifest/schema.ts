import * as z from "zod";
import { isSlug } from "@repo/utils";

export const gameManifestSchema = z.object({
  id: z.string().refine(isSlug, 'id must be a lowercase slug, e.g. "bridge"'),
  title: z.string(),
  kind: z.enum(["2d", "3d"]),
  description: z.optional(z.string()),
  thumbnail: z.string(),
  multiplayer: z.optional(
    z
      .object({
        minPlayers: z.int().check(z.positive()),
        maxPlayers: z.int().check(z.positive()),
        modes: z.array(z.string()),
      })
      .refine(
        (multiplayer) => multiplayer.minPlayers <= multiplayer.maxPlayers,
        { message: "minPlayers must be <= maxPlayers", path: ["minPlayers"] },
      ),
  ),
});
