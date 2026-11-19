import { defineManifest } from "@repo/game-core/manifest";

export const manifest = defineManifest({
  id: "bridge",
  title: "Bridge",
  kind: "3d",
  thumbnail: "",
  multiplayer: {
    minPlayers: 2,
    maxPlayers: 8,
    modes: [],
  },
});
