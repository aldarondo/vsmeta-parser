/**
 * Low-level Protocol Buffer TLV helpers.
 *
 * The .vsmeta binary format uses Protocol Buffer-style tag-length-value encoding:
 *   tag = (field_number << 3) | wire_type
 *
 * Wire types used in .vsmeta files:
 *   0 = varint (variable-length integer)
 *   1 = 64-bit fixed-width
 *   2 = length-delimited (strings, bytes, nested messages)
 *   5 = 32-bit fixed-width
 */

export const WIRE_VARINT = 0;
export const WIRE_64BIT = 1;
export const WIRE_LENGTH = 2;
export const WIRE_32BIT = 5;

/** Read an unsigned varint from buf at pos; returns [value, newPos]. */
export function readVarint(buf: Buffer, pos: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7n;
  }
  return [result, pos];
}

/** Read a tag and return [fieldNumber, wireType, newPos]. */
export function readTag(buf: Buffer, pos: number): [number, number, number] {
  const [tag, newPos] = readVarint(buf, pos);
  return [Number(tag >> 3n), Number(tag & 7n), newPos];
}

/** Skip past a field of the given wireType at pos; return new pos. */
export function skipField(buf: Buffer, pos: number, wireType: number): number {
  switch (wireType) {
    case WIRE_VARINT: {
      while (pos < buf.length && buf[pos++] & 0x80) { /* advance */ }
      return pos;
    }
    case WIRE_64BIT:
      return pos + 8;
    case WIRE_LENGTH: {
      const [len, newPos] = readVarint(buf, pos);
      return newPos + Number(len);
    }
    case WIRE_32BIT:
      return pos + 4;
    default:
      return buf.length; // unknown – bail
  }
}

/** Read a length-delimited field at pos; return [data, newPos]. */
export function readLengthDelimited(buf: Buffer, pos: number): [Buffer, number] {
  const [len, newPos] = readVarint(buf, pos);
  const end = newPos + Number(len);
  return [buf.slice(newPos, Math.min(end, buf.length)), end];
}
