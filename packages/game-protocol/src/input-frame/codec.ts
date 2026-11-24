import type { InputFrame } from "./type.ts";
import { PITCH_MAX } from "./pitch.ts";
import { YAW_STEPS } from "./yaw.ts";

// v2 added yaw, v3 adds pitch. Older frames are rejected, not upgraded: there are
// no deployed clients yet.
const VERSION = 3;
const SIZE = 21; // 1 байт версии + 4 × uint32 + 2 × uint16

export class InputFrameDecodeError extends Error {
  override name = "InputFrameDecodeError";
}

export function encodeInputFrame(frame: InputFrame): Uint8Array {
  // setUint16 silently wraps (70000 → 4464, -1 → 65535): radians passed by
  // mistake instead of quantizeYaw() would turn into a wrong direction.
  if (!Number.isInteger(frame.yaw) || frame.yaw < 0 || frame.yaw >= YAW_STEPS) {
    throw new RangeError(
      `yaw must be an integer in 0…${YAW_STEPS - 1} (use quantizeYaw), got ${frame.yaw}`,
    );
  }

  if (
    !Number.isInteger(frame.pitch) ||
    frame.pitch < 0 ||
    frame.pitch > PITCH_MAX
  ) {
    throw new RangeError(
      `pitch must be an integer in 0…${PITCH_MAX} (use quantizePitch), got ${frame.pitch}`,
    );
  }

  const bytes = new Uint8Array(SIZE);
  const view = new DataView(bytes.buffer);

  view.setUint8(0, VERSION);
  view.setUint32(1, frame.tick, true);
  view.setUint32(5, frame.held, true);
  view.setUint32(9, frame.pressed, true);
  view.setUint32(13, frame.released, true);
  view.setUint16(17, frame.yaw, true);
  view.setUint16(19, frame.pitch, true);

  return bytes;
}

export function decodeInputFrame(bytes: Uint8Array): InputFrame {
  if (bytes.byteLength !== SIZE) {
    throw new InputFrameDecodeError(
      `Expected ${SIZE} bytes, got ${bytes.byteLength}`,
    );
  }

  // byteOffset важен: bytes может быть срезом большого сетевого буфера.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const version = view.getUint8(0);
  if (version !== VERSION) {
    throw new InputFrameDecodeError(
      `Unsupported InputFrame version ${version}, expected ${VERSION}`,
    );
  }

  return {
    tick: view.getUint32(1, true),
    held: view.getUint32(5, true),
    pressed: view.getUint32(9, true),
    released: view.getUint32(13, true),
    yaw: view.getUint16(17, true),
    pitch: view.getUint16(19, true),
  };
}
