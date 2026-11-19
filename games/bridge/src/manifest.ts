import { defineManifest } from "@repo/game-core/manifest";

export const manifest = defineManifest({
  id: "bridge",
  title: "Bridge",
  kind: "3d",
  description:
    "Стройте мост быстрее соперников и первыми доведите машину до финиша.",
  // Served by apps/web from public/; moves to a static import from this package later.
  thumbnail: "/games/bridge/thumbnail.svg",
  multiplayer: {
    minPlayers: 2,
    maxPlayers: 8,
    modes: [],
  },
});
