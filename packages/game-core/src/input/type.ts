import type { Actions, InputFrame } from "@repo/game-protocol";

/** "Key:KeyW", позже "Mouse:0", "Pad:0" */
export type Bindings<A extends readonly string[]> = Partial<
  Record<A[number], readonly string[]>
>;

/** The element that captures the mouse (structural, so tests need no DOM). */
export interface PointerLockElement extends EventTarget {
  requestPointerLock: (options?: {
    unadjustedMovement?: boolean;
  }) => Promise<void> | void;
}

/** Where pointer lock state lives: `document` in the browser. */
export interface PointerLockDocument extends EventTarget {
  readonly pointerLockElement: unknown;
  exitPointerLock: () => void;
}

export interface PointerOptions {
  /** Clicking it captures the mouse; usually the game canvas. */
  element: PointerLockElement;
  /** Default: `document`. Receives `mousemove` and `pointerlockchange`. */
  document?: PointerLockDocument;
  /** Multiplier from platform settings, read on every move. */
  sensitivity: () => number;
  invertY: () => boolean;
  /** The game's pitch range in radians, e.g. [−60°, +70°]. */
  pitchLimits: readonly [min: number, max: number];
  initialYaw?: number;
}

export interface InputOptions<A extends readonly string[]> {
  actions: Actions<A>;
  bindings: Bindings<A>;
  target?: EventTarget;
  /** Mouse look with pointer lock. Without it, yaw and pitch stay at 0. */
  pointer?: PointerOptions;
}

export interface Look {
  /** Radians around Y; 0 looks along −Z, positive turns left. */
  readonly yaw: number;
  /** Radians; positive looks up, within the game's pitch limits. */
  readonly pitch: number;
}

export interface Input<A extends readonly string[]> {
  /**
   * Снимок за тик. Вызывать ровно один раз в update(). Направление взгляда
   * кладётся в кадр квантованным (`quantizeYaw`, `quantizePitch`).
   */
  sample(tick: number): InputFrame;
  /** Live look direction for the camera, every frame (not quantized). */
  look(): Look;
  /**
   * Whether the mouse is captured. With `pointer`, keys and mouse are ignored
   * while it isn't: the game shows "click to play".
   */
  readonly locked: boolean;
  setBindings(bindings: Bindings<A>): void;
  dispose(): void;
}
