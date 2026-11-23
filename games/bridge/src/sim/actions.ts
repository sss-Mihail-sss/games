import { defineActions } from "@repo/game-protocol";

/** Shared by the client (key bindings) and the server (M2): the bit order is the protocol. */
export const actions = defineActions([
  "forward",
  "back",
  "left",
  "right",
] as const);

export type Action = (typeof actions.list)[number];
