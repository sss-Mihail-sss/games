/** Properties, not methods: `clock.now` may be passed around without binding. */
export interface Clock {
  now: () => number;
  requestFrame: (callback: (time: number) => void) => number;
  cancelFrame: (id: number) => void;
}

export interface FixedLoopOptions {
  /** Частота симуляции в Гц. Клиент и сервер должны совпадать (30). */
  tickRate: number;
  /**
   * Шаг симуляции.
   * @param tick номер симулируемого тика, начиная с 0; после вызова `loop.tick` станет `tick + 1`.
   *             Этот же номер используется в сетевом протоколе (InputFrame.tick).
   * @param dt   всегда `1 / tickRate` секунд.
   */
  update: (tick: number, dt: number) => void;
  /** @param alpha прогресс к следующему тику, `[0, 1)`, для интерполяции. */
  render: (alpha: number) => void;
  maxStepsPerFrame?: number;
  clock?: Clock;
}

export interface FixedLoop {
  start(): void;
  stop(): void;
  readonly tick: number;
  readonly running: boolean;
}
