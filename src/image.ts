/**
 * Image helpers: base64 JPEG decoding and the nested image message parser.
 *
 * DS Video embeds poster and backdrop images directly inside .vsmeta files as
 * base64-encoded JPEG strings. Backdrop/fanart images are wrapped in a small
 * nested protobuf message that also carries an MD5 hash and a Unix timestamp.
 */

import {
  WIRE_VARINT,
  WIRE_LENGTH,
  readVarint,
  readTag,
  skipField,
  readLengthDelimited,
} from './wire.js';

/** Parsed contents of a nested image message (outer field 21 / episode field 10). */
export interface BackdropData {
  /** Decoded JPEG image (sub-field 1, base64-encoded in the binary). */
  image?: Buffer;
  /** MD5 hex string of the image (sub-field 2). */
  md5?: string;
  /** Unix timestamp in seconds (sub-field 3). */
  timestamp?: number;
}

/**
 * Try to base64-decode `data` as a JPEG.
 * Returns the decoded JPEG Buffer, or undefined if `data` does not produce a
 * valid JPEG (checked via the 0xFF 0xD8 magic bytes).
 */
export function tryDecodeBase64Jpeg(data: Buffer): Buffer | undefined {
  try {
    const decoded = Buffer.from(data.toString('ascii'), 'base64');
    if (decoded.length >= 2 && decoded[0] === 0xff && decoded[1] === 0xd8) {
      return decoded;
    }
  } catch {
    // ignore decode errors
  }
  return undefined;
}

/**
 * Parse a nested image protobuf message (used for outer field 21 and episode field 10).
 *
 * Structure:
 *   field 1 (string) = base64-encoded JPEG
 *   field 2 (string) = MD5 hex hash
 *   field 3 (varint) = Unix timestamp (seconds)
 */
export function parseNestedImageMessage(buf: Buffer): BackdropData {
  const result: BackdropData = {};
  let pos = 0;

  while (pos < buf.length) {
    const [fieldNum, wireType, newPos] = readTag(buf, pos);
    pos = newPos;

    if (wireType === WIRE_LENGTH) {
      const [data, nextPos] = readLengthDelimited(buf, pos);
      pos = nextPos;
      switch (fieldNum) {
        case 1:
          result.image = tryDecodeBase64Jpeg(data);
          break;
        case 2:
          try { result.md5 = data.toString('ascii'); } catch { /* v8 ignore next - Buffer.toString never throws */ }
          break;
      }
    } else if (wireType === WIRE_VARINT) {
      const [val, nextPos] = readVarint(buf, pos);
      pos = nextPos;
      if (fieldNum === 3) result.timestamp = Number(val);
    } else {
      pos = skipField(buf, pos, wireType);
    }
  }

  return result;
}
