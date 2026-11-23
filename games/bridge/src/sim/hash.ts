/**
 * FNV-1a over the bytes of float64 values: the same in Bun and the browser, so
 * two environments compare the exact same numbers. Used by determinism tests.
 */
export function hashNumbers(values: readonly number[] | Float64Array): string {
  const floats =
    values instanceof Float64Array ? values : Float64Array.from(values);
  let hash = 0x811c9dc5;
  for (const byte of new Uint8Array(
    floats.buffer,
    floats.byteOffset,
    floats.byteLength,
  )) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
