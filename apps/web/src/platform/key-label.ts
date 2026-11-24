/** `navigator.keyboard.getLayoutMap()`: `code` → what the key types now. */
export type LayoutMap = ReadonlyMap<string, string>;

const NAMES: Readonly<Record<string, string>> = {
  Space: "Пробел",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "Page Up",
  PageDown: "Page Down",
  ShiftLeft: "Левый Shift",
  ShiftRight: "Правый Shift",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  NumpadAdd: "Num +",
  NumpadSubtract: "Num −",
  NumpadMultiply: "Num *",
  NumpadDivide: "Num /",
  NumpadDecimal: "Num .",
  NumpadEnter: "Num Enter",
};

/** What these keys type on a US layout: the fallback without a layout map. */
const US_SYMBOLS: Readonly<Record<string, string>> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  IntlBackslash: "\\",
};

const LATIN_LETTER = /^[a-z]$/i;
const PRINTABLE_ASCII = /^[!-~]$/;

/**
 * A key's name for the player, from its `KeyboardEvent.code`.
 *
 * Letters follow the layout map when it gives a Latin letter: on AZERTY
 * `KeyQ` is "A". A Cyrillic one ("Ц" for `KeyW`) is replaced by the Latin
 * letter from the code: keycaps carry both, and games say "W".
 * `getLayoutMap()` exists only in Chromium; without it the code decides.
 */
export function keyLabel(code: string, layout?: LayoutMap): string {
  const letter = /^Key([A-Z])$/.exec(code)?.[1];
  if (letter !== undefined) {
    const typed = layout?.get(code);
    return typed !== undefined && LATIN_LETTER.test(typed)
      ? typed.toUpperCase()
      : letter;
  }

  const digit = /^Digit(\d)$/.exec(code)?.[1];
  if (digit !== undefined) {
    return digit; // "&" on AZERTY, but the keycap shows the digit too
  }

  const numpad = /^Numpad(\d)$/.exec(code)?.[1];
  if (numpad !== undefined) {
    return `Num ${numpad}`;
  }

  const named = NAMES[code];
  if (named !== undefined) {
    return named;
  }

  const symbol = US_SYMBOLS[code];
  if (symbol !== undefined) {
    const typed = layout?.get(code);
    if (typed === undefined || !PRINTABLE_ASCII.test(typed)) {
      return symbol;
    }
    return typed.toUpperCase(); // AZERTY's Semicolon types "m": the keycap says M
  }

  return code; // F13, MediaPlayPause…: the code is better than nothing
}
