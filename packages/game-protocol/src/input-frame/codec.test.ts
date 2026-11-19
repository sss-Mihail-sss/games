import { describe, expect, test } from "bun:test";

import {
  decodeInputFrame,
  encodeInputFrame,
  InputFrameDecodeError,
} from "./codec.ts";
import type { InputFrame } from "./type.ts";
import { YAW_STEPS } from "./yaw.ts";

const UINT32_MAX = 2 ** 32 - 1;
const SIZE = 19;

const sample: InputFrame = {
  tick: 42,
  held: 0b101,
  pressed: 0b001,
  released: 0b010,
  yaw: 12345,
};

describe("encodeInputFrame", () => {
  test("produces 19 bytes: version + 4 × uint32 + uint16", () => {
    expect(encodeInputFrame(sample).byteLength).toBe(SIZE);
  });

  test("writes version 2 in the first byte", () => {
    expect(encodeInputFrame(sample)[0]).toBe(2);
  });

  test("writes numbers little-endian", () => {
    const bytes = encodeInputFrame({
      tick: 0x04030201,
      held: 0,
      pressed: 0,
      released: 0,
      yaw: 0x0605,
    });

    expect([...bytes.subarray(1, 5)]).toEqual([0x01, 0x02, 0x03, 0x04]);
    expect([...bytes.subarray(17, 19)]).toEqual([0x05, 0x06]);
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
    test.each([0, 17, 18, 20, 64])("length %p", (length) => {
      const bytes = new Uint8Array(length);
      bytes[0] = 2;

      expect(() => decodeInputFrame(bytes)).toThrow(InputFrameDecodeError);
      expect(() => decodeInputFrame(bytes)).toThrow(`got ${length}`);
    });

    // 1 is the previous format: rejected like any foreign version.
    test.each([0, 1, 3, 255])("version %p", (version) => {
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
