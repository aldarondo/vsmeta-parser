/**
 * Unit tests for the low-level protobuf wire helpers in src/wire.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  WIRE_VARINT,
  WIRE_64BIT,
  WIRE_LENGTH,
  WIRE_32BIT,
  readVarint,
  readTag,
  skipField,
  readLengthDelimited,
} from '../src/wire.js';
import { encodeVarint, tag } from './helpers.js';

describe('readVarint', () => {
  it('reads a single-byte varint', () => {
    const buf = Buffer.from([0x01]);
    const [val, pos] = readVarint(buf, 0);
    expect(val).toBe(1n);
    expect(pos).toBe(1);
  });

  it('reads a two-byte varint', () => {
    // 300 encoded as varint: 0xAC 0x02
    const buf = Buffer.from([0xac, 0x02]);
    const [val, pos] = readVarint(buf, 0);
    expect(val).toBe(300n);
    expect(pos).toBe(2);
  });

  it('reads zero correctly', () => {
    const buf = Buffer.from([0x00]);
    const [val] = readVarint(buf, 0);
    expect(val).toBe(0n);
  });

  it('reads MAX_UINT64 (10-byte varint)', () => {
    // 18446744073709551615n as varint
    const encoded = encodeVarint(18446744073709551615n);
    const buf = Buffer.from(encoded);
    const [val] = readVarint(buf, 0);
    expect(val).toBe(18446744073709551615n);
  });

  it('starts reading from the given offset', () => {
    const buf = Buffer.from([0xff, 0x01, 0x05]);
    const [val, pos] = readVarint(buf, 2); // skip first two bytes
    expect(val).toBe(5n);
    expect(pos).toBe(3);
  });

  it('stops after 10 bytes for an unterminated varint (malformed input)', () => {
    // A buffer of 20 bytes each with the MSB set — no termination byte.
    // readVarint must stop after consuming at most 10 bytes and not grow a
    // huge BigInt (prevents DoS via memory exhaustion).
    const buf = Buffer.alloc(20, 0x80);
    const [, newPos] = readVarint(buf, 0);
    expect(newPos).toBe(10);
  });
});

describe('readTag', () => {
  it('decodes field number and wire type', () => {
    // field 2, wire type 2 → tag = (2 << 3) | 2 = 18 = 0x12
    const buf = Buffer.from([0x12]);
    const [fieldNum, wireType, newPos] = readTag(buf, 0);
    expect(fieldNum).toBe(2);
    expect(wireType).toBe(WIRE_LENGTH);
    expect(newPos).toBe(1);
  });

  it('decodes a high field number', () => {
    // field 19, wire type 2 → tag = (19 << 3) | 2 = 154 = two bytes: 0x9a 0x01
    const encoded = tag(19, WIRE_LENGTH);
    const buf = Buffer.from(encoded);
    const [fieldNum, wireType] = readTag(buf, 0);
    expect(fieldNum).toBe(19);
    expect(wireType).toBe(WIRE_LENGTH);
  });

  it('decodes a varint wire type', () => {
    const encoded = tag(1, WIRE_VARINT);
    const [, wireType] = readTag(Buffer.from(encoded), 0);
    expect(wireType).toBe(WIRE_VARINT);
  });
});

describe('skipField', () => {
  it('skips a single-byte varint field (wire type 0)', () => {
    const buf = Buffer.from([0x05]); // varint: 5
    expect(skipField(buf, 0, WIRE_VARINT)).toBe(1);
  });

  it('skips a multi-byte varint field (wire type 0)', () => {
    const buf = Buffer.from([0x96, 0x01]); // 150 as varint
    expect(skipField(buf, 0, WIRE_VARINT)).toBe(2);
  });

  it('skips a 64-bit field (wire type 1)', () => {
    const buf = Buffer.alloc(10);
    expect(skipField(buf, 0, WIRE_64BIT)).toBe(8);
  });

  it('skips a 32-bit field (wire type 5)', () => {
    const buf = Buffer.alloc(6);
    expect(skipField(buf, 0, WIRE_32BIT)).toBe(4);
  });

  it('skips a length-delimited field (wire type 2)', () => {
    // length = 3, then 3 data bytes
    const buf = Buffer.from([0x03, 0xaa, 0xbb, 0xcc]);
    expect(skipField(buf, 0, WIRE_LENGTH)).toBe(4);
  });

  it('returns buf.length for an unknown wire type', () => {
    const buf = Buffer.from([0x01, 0x02, 0x03]);
    expect(skipField(buf, 0, 99)).toBe(buf.length);
  });
});

describe('readLengthDelimited', () => {
  it('reads a length-prefixed byte slice', () => {
    const payload = Buffer.from('hello', 'utf8');
    const buf = Buffer.concat([Buffer.from([payload.length]), payload]);
    const [data, newPos] = readLengthDelimited(buf, 0);
    expect(data.toString('utf8')).toBe('hello');
    expect(newPos).toBe(buf.length);
  });

  it('reads from the given offset', () => {
    // prefix byte with a skip byte before
    const buf = Buffer.from([0xff, 0x02, 0xde, 0xad]);
    const [data, newPos] = readLengthDelimited(buf, 1); // skip 0xff
    expect(data[0]).toBe(0xde);
    expect(data[1]).toBe(0xad);
    expect(newPos).toBe(4);
  });
});
