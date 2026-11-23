export interface PlatformSettings {
  volume: {
    master: number;
    music: number;
    sfx: number;
  };
  quality: "low" | "medium" | "high";
  reducedMotion: boolean;
  locale: "ru" | "en";
  /** Shared by all games, like volume. */
  mouse: {
    /** Multiplier on each game's base turn rate, 0.1…5. */
    sensitivity: number;
    invertY: boolean;
  };
}
