export interface PlatformSettings {
  volume: {
    master: number;
    music: number;
    sfx: number;
  };
  quality: "low" | "medium" | "high";
  reducedMotion: boolean;
  locale: "ru" | "en";
}
