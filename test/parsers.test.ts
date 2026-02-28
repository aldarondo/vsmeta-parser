/**
 * Unit tests for the nested block parsers in src/parsers.ts:
 *   - parseCastBlock  (field 10)
 *   - parseEpisodeDetails  (field 19)
 */

import { describe, it, expect } from 'vitest';
import { parseCastBlock, parseEpisodeDetails } from '../src/parsers.js';
import { varintField, stringField, bytesField, tag } from './helpers.js';

// Minimal JPEG bytes used for thumbnail/backdrop assertions
const MINIMAL_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

// ---------------------------------------------------------------------------
// parseCastBlock
// ---------------------------------------------------------------------------

describe('parseCastBlock', () => {
  it('parses repeated actor names from field 1', () => {
    const buf = Buffer.from([
      ...stringField(1, 'Bryan Cranston'),
      ...stringField(1, 'Aaron Paul'),
    ]);
    const result = parseCastBlock(buf);
    expect(result.actors).toEqual(['Bryan Cranston', 'Aaron Paul']);
    expect(result.directors).toEqual([]);
  });

  it('parses directors (field 2), genres (field 3), and writers (field 4)', () => {
    const buf = Buffer.from([
      ...stringField(2, 'Vince Gilligan'),
      ...stringField(3, 'Drama'),
      ...stringField(3, 'Thriller'),
      ...stringField(4, 'Sam Catlin'),
    ]);
    const result = parseCastBlock(buf);
    expect(result.directors).toEqual(['Vince Gilligan']);
    expect(result.genres).toEqual(['Drama', 'Thriller']);
    expect(result.writers).toEqual(['Sam Catlin']);
  });

  it('handles a full mixed cast/crew message', () => {
    const buf = Buffer.from([
      ...stringField(1, 'Bryan Cranston'),
      ...stringField(1, 'Aaron Paul'),
      ...stringField(2, 'Vince Gilligan'),
      ...stringField(3, 'Drama'),
      ...stringField(4, 'Sam Catlin'),
    ]);
    const result = parseCastBlock(buf);
    expect(result.actors).toContain('Bryan Cranston');
    expect(result.actors).toContain('Aaron Paul');
    expect(result.directors).toContain('Vince Gilligan');
    expect(result.genres).toContain('Drama');
    expect(result.writers).toContain('Sam Catlin');
  });

  it('returns all-empty arrays for an empty buffer', () => {
    const result = parseCastBlock(Buffer.alloc(0));
    expect(result.actors).toEqual([]);
    expect(result.directors).toEqual([]);
    expect(result.genres).toEqual([]);
    expect(result.writers).toEqual([]);
  });

  it('skips non-LENGTH wire type fields (e.g. varint) without crashing', () => {
    const buf = Buffer.from([
      ...varintField(99, 42),              // varint – should be skipped
      ...stringField(1, 'After Skip'),     // actor – should be parsed
    ]);
    const result = parseCastBlock(buf);
    expect(result.actors).toEqual(['After Skip']);
  });
});

// ---------------------------------------------------------------------------
// parseEpisodeDetails
// ---------------------------------------------------------------------------

describe('parseEpisodeDetails', () => {
  it('parses season (field 1), episode (field 2), and year (field 3) from varints', () => {
    const buf = Buffer.from([
      ...varintField(1, 3),
      ...varintField(2, 7),
      ...varintField(3, 2019),
    ]);
    const result = parseEpisodeDetails(buf);
    expect(result.season).toBe(3);
    expect(result.episode).toBe(7);
    expect(result.year).toBe(2019);
  });

  it('parses airDate (field 4) and plot (field 6) from strings', () => {
    const buf = Buffer.from([
      ...stringField(4, '2019-05-12'),
      ...stringField(6, 'The series finale.'),
    ]);
    const result = parseEpisodeDetails(buf);
    expect(result.airDate).toBe('2019-05-12');
    expect(result.plot).toBe('The series finale.');
  });

  it('parses the locked flag from field 5', () => {
    const buf = Buffer.from(varintField(5, 1));
    expect(parseEpisodeDetails(buf).locked).toBe(true);
  });

  it('decodes episode thumbnail JPEG from field 7', () => {
    const b64 = MINIMAL_JPEG.toString('base64');
    const buf = Buffer.from(stringField(7, b64));
    const result = parseEpisodeDetails(buf);
    expect(result.thumbnail).toBeDefined();
    expect(result.thumbnail![0]).toBe(0xff);
    expect(result.thumbnail![1]).toBe(0xd8);
  });

  it('returns undefined thumbnail when field 7 data is not a valid JPEG', () => {
    const buf = Buffer.from(stringField(7, 'not-jpeg-base64'));
    expect(parseEpisodeDetails(buf).thumbnail).toBeUndefined();
  });

  it('parses backdrop nested image from field 10', () => {
    const innerMsg = Buffer.from(stringField(1, MINIMAL_JPEG.toString('base64')));
    const buf = Buffer.from(bytesField(10, innerMsg));
    const result = parseEpisodeDetails(buf);
    expect(result.backdrop?.image).toBeDefined();
    expect(result.backdrop!.image![0]).toBe(0xff);
    expect(result.backdrop!.image![1]).toBe(0xd8);
  });

  it('skips thumbnail and backdrop when skipImages=true', () => {
    const buf = Buffer.from([
      ...stringField(7, MINIMAL_JPEG.toString('base64')),
      ...bytesField(10, Buffer.from(stringField(1, MINIMAL_JPEG.toString('base64')))),
    ]);
    const result = parseEpisodeDetails(buf, true);
    expect(result.thumbnail).toBeUndefined();
    expect(result.backdrop).toBeUndefined();
  });

  it('returns sensible defaults for an empty buffer', () => {
    const result = parseEpisodeDetails(Buffer.alloc(0));
    expect(result.season).toBe(0);
    expect(result.episode).toBe(0);
    expect(result.year).toBe(0);
    expect(result.airDate).toBe('');
    expect(result.plot).toBe('');
    expect(result.locked).toBe(false);
    expect(result.thumbnail).toBeUndefined();
    expect(result.backdrop).toBeUndefined();
  });

  it('skips 64-bit wire type fields without crashing', () => {
    const fixed64 = [...tag(99, 1), 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
    const buf = Buffer.from([
      ...fixed64,
      ...varintField(1, 3),
    ]);
    expect(parseEpisodeDetails(buf).season).toBe(3);
  });

  it('skips 32-bit wire type fields without crashing', () => {
    const fixed32 = [...tag(99, 5), 0x01, 0x02, 0x03, 0x04];
    const buf = Buffer.from([
      ...fixed32,
      ...varintField(2, 7),
    ]);
    expect(parseEpisodeDetails(buf).episode).toBe(7);
  });

  it('stops parsing on unknown wire type (wire type 3)', () => {
    // Wire type 3 is not valid in .vsmeta; parser should bail
    const unknownWire = [...tag(99, 3)];
    const buf = Buffer.from([
      ...varintField(1, 5),
      ...unknownWire,
      ...varintField(2, 10),  // should NOT be reached
    ]);
    const result = parseEpisodeDetails(buf);
    expect(result.season).toBe(5);
    expect(result.episode).toBe(0);  // never parsed
  });
});
