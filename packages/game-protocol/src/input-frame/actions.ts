import type { Actions } from "./type.ts";

const MAX_ACTIONS = 32;

export function defineActions<const A extends readonly string[]>(
  list: A,
): Actions<A> {
  type Action = A[number];

  if (list.length > MAX_ACTIONS) {
    throw new Error(`Too many actions: ${list.length}, max is ${MAX_ACTIONS}`);
  }

  if (new Set(list).size !== list.length) {
    throw new Error(`Duplicate actions in [${list.join(", ")}]`);
  }

  // >>> 0: 1 << 31 в JS отрицательное, приводим к uint32
  const bits = new Map<Action, number>(
    list.map((action, index) => [action, (1 << index) >>> 0]),
  );
  const bit = (action: Action): number => bits.get(action)!;

  return {
    list,
    bit,
    isHeld: (frame, action) => (frame.held & bit(action)) !== 0,
    wasPressed: (frame, action) => (frame.pressed & bit(action)) !== 0,
    wasReleased: (frame, action) => (frame.released & bit(action)) !== 0,
  };
}
