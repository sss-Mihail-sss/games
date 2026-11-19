export interface InputFrame {
  tick: number;
  held: number;
  pressed: number;
  released: number;
}

export interface Actions<A extends readonly string[] = readonly string[]> {
  readonly list: readonly A[number][];
  bit(action: A[number]): number;
  isHeld(frame: InputFrame, action: A[number]): boolean;
  wasPressed(frame: InputFrame, action: A[number]): boolean;
  wasReleased(frame: InputFrame, action: A[number]): boolean;
}
