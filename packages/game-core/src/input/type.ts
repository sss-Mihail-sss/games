import type { Actions, InputFrame } from "@repo/game-protocol";

/** "Key:KeyW", позже "Mouse:0", "Pad:0" */
export type Bindings<A extends readonly string[]> = Partial<
  Record<A[number], readonly string[]>
>;

export interface InputOptions<A extends readonly string[]> {
  actions: Actions<A>;
  bindings: Bindings<A>;
  target?: EventTarget;
}

export interface Input<A extends readonly string[]> {
  /**
   * Снимок за тик. Вызывать ровно один раз в update().
   * @param yaw поворот камеры, уже квантованный (`quantizeYaw`). Клавиатура камеру
   *            не знает и просто кладёт значение в кадр; в M1 мышь переедет сюда.
   */
  sample(tick: number, yaw: number): InputFrame;
  setBindings(bindings: Bindings<A>): void;
  dispose(): void;
}
