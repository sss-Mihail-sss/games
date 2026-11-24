import { describe, expect, test } from "bun:test";

import {
  decodeInputFrame,
  encodeInputFrame,
  InputFrameDecodeError,
} from "./codec.ts";
import type { InputFrame } from "./type.ts";
import { PITCH_MAX } from "./pitch.ts";
import { YAW_STEPS } from "./yaw.ts";

const UINT32_MAX = 2 ** 32 - 1;
const SIZE = 21;

const sample: InputFrame = {
  tick: 42,
  held: 0b101,
  pressed: 0b001,
  released: 0b010,
  yaw: 12345,
  pitch: 23456,
};

describe("encodeInputFrame", () => {
  test("produces 21 bytes: version + 4 × uint32 + 2 × uint16", () => {
    expect(encodeInputFrame(sample).byteLength).toBe(SIZE);
  });

  test("writes version 3 in the first byte", () => {
    expect(encodeInputFrame(sample)[0]).toBe(3);
  });

  test("writes numbers little-endian", () => {
    const bytes = encodeInputFrame({
      tick: 0x04030201,
      held: 0,
      pressed: 0,
      released: 0,
      yaw: 0x0605,
      pitch: 0x0807,
    });

    expect([...bytes.subarray(1, 5)]).toEqual([0x01, 0x02, 0x03, 0x04]);
    expect([...bytes.subarray(17, 19)]).toEqual([0x05, 0x06]);
    expect([...bytes.subarray(19, 21)]).toEqual([0x07, 0x08]);
  });

  describe("rejects a yaw that would not survive the wire", () => {
    test.each([
      ["negative", -1],
      ["too large", YAW_STEPS],
      ["fractional, e.g. radians", 1.5],
      ["NaN", Number.NaN],
    ])("%s", (_, yaw) => {
      expect(() => encodeInputFrame({ ...sample, yaw })).toThrow(RangeError);
    });
  });

  describe("rejects a pitch that would not survive the wire", () => {
    test.each([
      ["negative", -1],
      ["too large", PITCH_MAX + 1],
      ["fractional, e.g. radians", 0.5],
      ["NaN", Number.NaN],
    ])("%s", (_, pitch) => {
      expect(() => encodeInputFrame({ ...sample, pitch })).toThrow(RangeError);
    });
  });
});

describe("decodeInputFrame", () => {
  test("round-trips a frame", () => {
    expect(decodeInputFrame(encodeInputFrame(sample))).toEqual(sample);
  });

  test("round-trips uint32 and uint16 limits, including bit 31", () => {
    const extreme: InputFrame = {
      tick: UINT32_MAX,
      held: 2 ** 31,
      pressed: UINT32_MAX,
      released: 0,
      yaw: YAW_STEPS - 1,
      pitch: PITCH_MAX,
    };

    expect(decodeInputFrame(encodeInputFrame(extreme))).toEqual(extreme);
  });

  test("decodes a slice of a larger buffer", () => {
    const buffer = new Uint8Array(40);
    buffer.fill(0xff);
    buffer.set(encodeInputFrame(sample), 3);

    expect(decodeInputFrame(buffer.subarray(3, 3 + SIZE))).toEqual(sample);
  });

  describe("rejects untrusted input", () => {
    test.each([0, 19, 20, 22, 64])("length %p", (length) => {
      const bytes = new Uint8Array(length);
      bytes[0] = 3;

      expect(() => decodeInputFrame(bytes)).toThrow(InputFrameDecodeError);
      expect(() => decodeInputFrame(bytes)).toThrow(`got ${length}`);
    });

    // 1 and 2 are previous formats: rejected like any foreign version.
    test.each([0, 1, 2, 4, 255])("version %p", (version) => {
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
