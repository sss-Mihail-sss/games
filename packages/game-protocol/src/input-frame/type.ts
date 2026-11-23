export interface InputFrame {
  tick: number;
  held: number;
  pressed: number;
  released: number;
  /** Camera yaw in wire units (`quantizeYaw`), an integer in `0…YAW_STEPS - 1`. */
  yaw: number;
  /** Camera pitch in wire units (`quantizePitch`), an integer in `0…PITCH_MAX`. */
  pitch: number;
}

export interface Actions<A extends readonly string[] = readonly string[]> {
  readonly list: readonly A[number][];
  bit(action: A[number]): number;
  isHeld(frame: InputFrame, action: A[number]): boolean;
  wasPressed(frame: InputFrame, action: A[number]): boolean;
  wasReleased(frame: InputFrame, action: A[number]): boolean;
}
