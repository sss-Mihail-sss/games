import type { InputFrame } from "./type.ts";

const VERSION = 1;
const SIZE = 17; // 1 байт версии + 4 × uint32

export class InputFrameDecodeError extends Error {
  override name = "InputFrameDecodeError";
}

export function encodeInputFrame(frame: InputFrame): Uint8Array {
  const bytes = new Uint8Array(SIZE);
  const view = new DataView(bytes.buffer);

  view.setUint8(0, VERSION);
  view.setUint32(1, frame.tick, true);
  view.setUint32(5, frame.held, true);
  view.setUint32(9, frame.pressed, true);
  view.setUint32(13, frame.released, true);

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
  };
}
