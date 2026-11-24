/**
 * The game's own data in the browser: the chosen character (M1-11) and the
 * like. Keys are the game's own: the platform keeps games apart. Moves to the
 * account after M5.
 */
export interface GameStorage {
  /**
   * Parsed JSON, or `undefined` if nothing is stored or it doesn't parse.
   * Validate it with a schema: the player can edit localStorage.
   */
  get(key: string): unknown;
  /** Stored as JSON. Quietly not kept in private mode or over quota. */
  set(key: string, value: unknown): void;
  remove(key: string): void;
}
