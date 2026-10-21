import { YOUCAM_MAX_IMAGE_BYTES, YouCamError } from "./types.js";
import type { ImageContentType, YouCamOperation } from "./types.js";

/** Header validation is not a decoder, pose check, face detector or authenticity claim. */
export function inspectImage(bytes: Uint8Array, contentType: ImageContentType, operation: YouCamOperation): { width: number; height: number } {
  const invalid = (): never => { throw new YouCamError("input", operation); };
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength >= YOUCAM_MAX_IMAGE_BYTES) invalid();
  let width = 0;
  let height = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (contentType === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.byteLength < 33 || !signature.every((byte, i) => bytes[i] === byte) || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) invalid();
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (contentType === "image/jpeg") {
    if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalid();
    let offset = 2;
    const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 3 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) invalid();
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.byteLength) invalid();
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.byteLength) invalid();
      if (frameMarkers.has(marker)) {
        if (length < 8) invalid();
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  } else invalid();
  if (Math.max(width, height) > 4096 || Math.max(width, height) < 512 || Math.min(width, height) < 384) invalid();
  return { width, height };
}
