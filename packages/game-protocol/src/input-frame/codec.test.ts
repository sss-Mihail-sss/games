import { describe, expect, test } from "bun:test";

import {
  decodeInputFrame,
  encodeInputFrame,
  InputFrameDecodeError,
} from "./codec.ts";
import type { InputFrame } from "./type.ts";

const UINT32_MAX = 2 ** 32 - 1;

const sample: InputFrame = {
  tick: 42,
  held: 0b101,
  pressed: 0b001,
  released: 0b010,
};

describe("encodeInputFrame", () => {
  test("produces 17 bytes: version + 4 × uint32", () => {
    expect(encodeInputFrame(sample).byteLength).toBe(17);
  });

  test("writes version 1 in the first byte", () => {
    expect(encodeInputFrame(sample)[0]).toBe(1);
  });

  test("writes numbers little-endian", () => {
    const bytes = encodeInputFrame({
      tick: 0x04030201,
      held: 0,
      pressed: 0,
      released: 0,
    });

    expect([...bytes.subarray(1, 5)]).toEqual([0x01, 0x02, 0x03, 0x04]);
  });
});

describe("decodeInputFrame", () => {
  test("round-trips a frame", () => {
    expect(decodeInputFrame(encodeInputFrame(sample))).toEqual(sample);
  });

  test("round-trips uint32 limits, including bit 31", () => {
    const extreme: InputFrame = {
      tick: UINT32_MAX,
      held: 2 ** 31,
      pressed: UINT32_MAX,
      released: 0,
    };

    expect(decodeInputFrame(encodeInputFrame(extreme))).toEqual(extreme);
  });

  test("decodes a slice of a larger buffer", () => {
    const buffer = new Uint8Array(40);
    buffer.fill(0xff);
    buffer.set(encodeInputFrame(sample), 3);

    expect(decodeInputFrame(buffer.subarray(3, 20))).toEqual(sample);
  });

  describe("rejects untrusted input", () => {
    test.each([0, 16, 18, 64])("length %p", (length) => {
      const bytes = new Uint8Array(length);
      bytes[0] = 1;

      expect(() => decodeInputFrame(bytes)).toThrow(InputFrameDecodeError);
      expect(() => decodeInputFrame(bytes)).toThrow(`got ${length}`);
    });

    test.each([0, 2, 255])("version %p", (version) => {
      const bytes = encodeInputFrame(sample);
      bytes[0] = version;

      expect(() => decodeInputFrame(bytes)).toThrow(InputFrameDecodeError);
      expect(() => decodeInputFrame(bytes)).toThrow(`version ${version}`);
    });
  });

  test("errors are named for stack traces and logs", () => {
    try {
      decodeInputFrame(new Uint8Array(1));
      throw new Error("expected decodeInputFrame to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(InputFrameDecodeError);
      expect((error as Error).name).toBe("InputFrameDecodeError");
    }
  });
});
