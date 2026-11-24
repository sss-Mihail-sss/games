import { describe, expect, test } from "bun:test";

import { keyLabel } from "./key-label.ts";

const russian = new Map([
  ["KeyW", "ц"],
  ["KeyQ", "й"],
  ["Semicolon", "ж"],
]);
const azerty = new Map([
  ["KeyQ", "a"],
  ["KeyW", "z"],
  ["Semicolon", "m"],
  ["Comma", ";"],
]);

describe("keyLabel", () => {
  test.each([
    ["KeyW", "W"],
    ["Digit1", "1"],
    ["Numpad7", "Num 7"],
    ["Space", "Пробел"],
    ["ShiftLeft", "Левый Shift"],
    ["ArrowUp", "↑"],
    ["Semicolon", ";"],
    ["F13", "F13"],
    ["MediaPlayPause", "MediaPlayPause"],
  ])("without a layout map, %s is %p", (code, label) => {
    expect(keyLabel(code)).toBe(label);
  });

  test("a Cyrillic layout still says W, as games do", () => {
    expect(keyLabel("KeyW", russian)).toBe("W");
    expect(keyLabel("KeyQ", russian)).toBe("Q");
  });

  test("...and US symbols for punctuation it types as letters", () => {
    expect(keyLabel("Semicolon", russian)).toBe(";");
  });

  test("AZERTY shows what is on the keycap", () => {
    expect(keyLabel("KeyQ", azerty)).toBe("A");
    expect(keyLabel("KeyW", azerty)).toBe("Z");
    expect(keyLabel("Comma", azerty)).toBe(";");
    expect(keyLabel("Semicolon", azerty)).toBe("M");
  });

  test("a letter the layout map doesn't know comes from the code", () => {
    expect(keyLabel("KeyE", azerty)).toBe("E");
  });
});
