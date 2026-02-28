/**
 * Unit tests for the image helpers in src/image.ts.
 */

import { describe, it, expect } from 'vitest';
import { tryDecodeBase64Jpeg, parseNestedImageMessage } from '../src/image.js';
import { stringField, varintField, tag } from './helpers.js';

// Minimal JPEG: SOI (FF D8) + EOI (FF D9)
const MINIMAL_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

describe('tryDecodeBase64Jpeg', () => {
  it('decodes a valid base64-encoded JPEG and returns its bytes', () => {
    const input = Buffer.from(MINIMAL_JPEG.toString('base64'), 'ascii');
    const result = tryDecodeBase64Jpeg(input);
    expect(result).toBeDefined();
    expect(result![0]).toBe(0xff);
    expect(result![1]).toBe(0xd8);
  });

  it('returns undefined when the decoded data is not a JPEG', () => {
    // "not-jpeg" base64-encoded is valid base64 but does not start with FF D8
    const input = Buffer.from(Buffer.from('not-jpeg').toString('base64'), 'ascii');
    expect(tryDecodeBase64Jpeg(input)).toBeUndefined();
  });

  it('returns undefined for an empty buffer', () => {
    expect(tryDecodeBase64Jpeg(Buffer.alloc(0))).toBeUndefined();
  });

  it('handles multiline base64 (MIME-style) correctly', () => {
    // Split base64 across two lines as DS Video sometimes does
    const b64 = MINIMAL_JPEG.toString('base64');
    const multiline = b64.slice(0, 4) + '\n' + b64.slice(4);
    const input = Buffer.from(multiline, 'ascii');
    const result = tryDecodeBase64Jpeg(input);
    expect(result).toBeDefined();
    expect(result![0]).toBe(0xff);
  });

  it('returns undefined when toString throws (catch branch)', () => {
    const buf = Buffer.alloc(4);
    // Override toString to throw, exercising the catch path
    buf.toString = () => { throw new Error('decode failure'); };
    expect(tryDecodeBase64Jpeg(buf)).toBeUndefined();
  });
});

describe('parseNestedImageMessage', () => {
  it('decodes base64 JPEG from field 1', () => {
    const buf = Buffer.from(stringField(1, MINIMAL_JPEG.toString('base64')));
    const result = parseNestedImageMessage(buf);
    expect(result.image).toBeDefined();
    expect(result.image![0]).toBe(0xff);
    expect(result.image![1]).toBe(0xd8);
  });

  it('extracts MD5 hex string from field 2', () => {
    const md5 = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    const buf = Buffer.from(stringField(2, md5));
    expect(parseNestedImageMessage(buf).md5).toBe(md5);
  });

  it('extracts Unix timestamp from field 3', () => {
    const buf = Buffer.from(varintField(3, 1700000000));
    expect(parseNestedImageMessage(buf).timestamp).toBe(1700000000);
  });

  it('returns an empty object when all fields are absent', () => {
    const result = parseNestedImageMessage(Buffer.alloc(0));
    expect(result.image).toBeUndefined();
    expect(result.md5).toBeUndefined();
    expect(result.timestamp).toBeUndefined();
  });

  it('parses all three fields from a single message', () => {
    const buf = Buffer.from([
      ...stringField(1, MINIMAL_JPEG.toString('base64')),
      ...stringField(2, 'deadbeef'),
      ...varintField(3, 1234567890),
    ]);
    const result = parseNestedImageMessage(buf);
    expect(result.image).toBeDefined();
    expect(result.md5).toBe('deadbeef');
    expect(result.timestamp).toBe(1234567890);
  });

  it('skips unknown wire type fields (e.g. 64-bit) without crashing', () => {
    // Field 99 with wire type 1 (64-bit) followed by 8 bytes, then a valid md5 field
    const unknown64bit = [...tag(99, 1), 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
    const buf = Buffer.from([
      ...unknown64bit,
      ...stringField(2, 'abc123'),
    ]);
    const result = parseNestedImageMessage(buf);
    expect(result.md5).toBe('abc123');
  });
});
