import type { InputFrame } from "@repo/game-protocol";

import type { Bindings, Input, InputOptions } from "./type.ts";

export function createInput<const A extends readonly string[]>({
  actions,
  bindings,
  target = window,
}: InputOptions<A>): Input<A> {
  let sourceMasks = buildSourceMasks(bindings);
  const down = new Set<string>(); // физически зажатые источники
  let pressed = 0; // накоплено с прошлого sample
  let released = 0;

  // "Key:KeyW" → маска действий, которые на неё повешены
  function buildSourceMasks(next: Bindings<A>): Map<string, number> {
    const masks = new Map<string, number>();
    for (const action of actions.list) {
      for (const source of next[action] ?? []) {
        masks.set(
          source,
          ((masks.get(source) ?? 0) | actions.bit(action)) >>> 0,
        );
      }
    }
    return masks;
  }

  function heldMask(): number {
    let mask = 0;
    for (const source of down) mask |= sourceMasks.get(source) ?? 0;
    return mask >>> 0;
  }

  function releaseAll() {
    released = (released | heldMask()) >>> 0;
    down.clear();
  }

  const controller = new AbortController();
  const { signal } = controller;

  target.addEventListener(
    "keydown",
    (event) => {
      const { code, repeat } = event as KeyboardEvent;
      if (repeat) return; // автоповтор — не нажатие

      const source = `Key:${code}`; // code, не key: раскладка не важна
      if (!sourceMasks.has(source)) return;
      event.preventDefault(); // только для своих клавиш

      const before = heldMask();
      down.add(source);
      pressed = (pressed | (heldMask() & ~before)) >>> 0; // только реально новые действия
    },
    { signal },
  );

  target.addEventListener(
    "keyup",
    (event) => {
      const source = `Key:${(event as KeyboardEvent).code}`;
      if (!down.has(source)) return;

      const before = heldMask();
      down.delete(source);
      released = (released | (before & ~heldMask())) >>> 0;
    },
    { signal },
  );

  target.addEventListener("blur", releaseAll, { signal });

  return {
    sample(tick) {
      const frame: InputFrame = { tick, held: heldMask(), pressed, released };
      pressed = 0;
      released = 0;
      return frame;
    },
    setBindings(next) {
      releaseAll(); // зажатое под старой раскладкой не должно залипнуть
      sourceMasks = buildSourceMasks(next);
    },
    dispose() {
      controller.abort(); // снимает все три слушателя разом
      down.clear();
    },
  };
}
