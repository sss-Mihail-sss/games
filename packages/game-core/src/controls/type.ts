/**
 * What a game tells the platform about its controls, so the platform can draw
 * one "Keys" screen for every game. Sources are like `createInput` bindings:
 * "Key:KeyW" (`KeyboardEvent.code`).
 */
export interface Controls<Action extends string = string> {
  /** Their order is the order of rows on the "Keys" screen. */
  actions: readonly Action[];
  /** In Russian for now; translations come with the second language. */
  labels: Readonly<Record<Action, string>>;
  /** Up to two sources per action: the main one and an extra one. */
  defaults: Readonly<Partial<Record<Action, readonly string[]>>>;
}

/** The player's key bindings, read-only for the game: the platform edits them. */
export interface ControlsView {
  readonly bindings: Readonly<Record<string, readonly string[]>>;
  subscribe(
    listener: (next: Readonly<Record<string, readonly string[]>>) => void,
  ): () => void;
}
