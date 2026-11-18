export interface GameContext {
  user: string;
  settings: object;
  signal: AbortSignal;
  submitScore: () => void;
  log: () => void;
}
