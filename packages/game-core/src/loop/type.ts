export interface Clock {
  now(): number;
  requestFrame(cb: (time: number) => void): number;
  cancelFrame(id: number): void;
}

export interface FixedLoopOptions {
  tickRate: number;
  update(tick: number, dt: number): void;
  render(alpha: number): void;
  maxStepsPerFrame?: number;
  clock?: Clock;
}

export interface FixedLoop {
  start(): void;
  stop(): void;
  readonly tick: number;
  readonly running: boolean;
}
