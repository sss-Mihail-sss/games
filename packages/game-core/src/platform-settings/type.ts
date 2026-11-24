export interface PlatformSettings {
  volume: {
    master: number;
    music: number;
    sfx: number;
  };
  quality: "low" | "medium" | "high";
  reducedMotion: boolean;
  locale: "ru" | "en";
  /**
   * Horizontal field of view in degrees on a 16:9 screen, 70…110, as most
   * games state it. A comfort setting (motion sickness), not a game rule.
   */
  fov: number;
  /** Shared by all games, like volume. */
  mouse: {
    /** Multiplier on each game's base turn rate, 0.1…5. */
    sensitivity: number;
    invertY: boolean;
  };
}
