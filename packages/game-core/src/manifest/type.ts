import * as z from "zod";

import { gameManifestSchema } from "./schema.ts";

export type GameManifest = z.infer<typeof gameManifestSchema>;
