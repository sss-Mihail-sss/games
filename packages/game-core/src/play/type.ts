/** What the player is doing, as the platform's menus see it. */
export type PlayState = "menu" | "playing" | "paused";

/**
 * The platform owns this state: it draws the menus. The game reacts to it
 * (start the loop, capture the mouse) and may ask for a pause.
 */
export interface Play {
  readonly state: PlayState;
  /**
   * Called synchronously, inside the click that changed the state, so the
   * game can still capture the mouse there. `previous` tells "Continue"
   * (`paused → playing`) from a new game (`menu → playing`).
   */
  subscribe(
    listener: (next: PlayState, previous: PlayState) => void,
  ): () => void;
  /** Asks for a pause: the mouse was released, the tab was hidden. */
  pause(): void;
}
