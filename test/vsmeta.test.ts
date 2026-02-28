/**
 * Tests for the main parseVsMeta function (src/vsmeta.ts).
 *
 * These tests focus on outer-field parsing and the wiring between sub-parsers.
 * Low-level wire encoding, image decoding, and nested block parsing are each
 * covered in their own focused test files (wire, image, parsers).
 *
 * Integration tests at the bottom run against real .vsmeta files and are
 * automatically skipped when the examples/ directory is absent.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { parseVsMeta, VsMetaData } from '../src/index.js';
import {
  varintField,
  stringField,
  bytesField,
  base64JpegField,
  buildVsMeta,
  buildEpisodeDetails,
} from './helpers.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ---------------------------------------------------------------------------
// Unit tests — outer message fields
// ---------------------------------------------------------------------------

describe('parseVsMeta', () => {
  it('throws when buffer is too small', () => {
    expect(() => parseVsMeta(Buffer.from([0x08]))).toThrow('too small');
  });

  it('parses contentType=1 (movie)', () => {
    expect(parseVsMeta(buildVsMeta(varintField(1, 1))).contentType).toBe(1);
  });

  it('parses contentType=2 (TV show)', () => {
    expect(parseVsMeta(buildVsMeta(varintField(1, 2))).contentType).toBe(2);
  });

  it('defaults contentType to 1 when field 1 is absent', () => {
    expect(parseVsMeta(buildVsMeta(stringField(2, 'My Movie'))).contentType).toBe(1);
  });

  it('parses title (field 2)', () => {
    expect(parseVsMeta(buildVsMeta(stringField(2, 'The Dark Knight'))).title).toBe('The Dark Knight');
  });

  it('parses originalTitle (field 3)', () => {
    expect(parseVsMeta(buildVsMeta(stringField(3, 'Le Chevalier Noir'))).originalTitle).toBe('Le Chevalier Noir');
  });

  it('parses episodeTitle (field 4)', () => {
    expect(parseVsMeta(buildVsMeta(stringField(4, 'Why so serious?'))).episodeTitle).toBe('Why so serious?');
  });

  it('parses year varint (field 5)', () => {
    expect(parseVsMeta(buildVsMeta(varintField(5, 2008))).year).toBe(2008);
  });

  it('parses releaseDate (field 6)', () => {
    expect(parseVsMeta(buildVsMeta(stringField(6, '2008-07-18'))).releaseDate).toBe('2008-07-18');
  });

  it('parses plot (field 8)', () => {
    expect(parseVsMeta(buildVsMeta(stringField(8, 'When the Joker...'))).plot).toBe('When the Joker...');
  });

  it('parses locked=true from field 7 varint', () => {
    expect(parseVsMeta(buildVsMeta(varintField(7, 1))).locked).toBe(true);
  });

  it('parses locked=false from field 7 varint', () => {
    expect(parseVsMeta(buildVsMeta(varintField(7, 0))).locked).toBe(false);
  });

  it('skips field 18 (poster MD5 hash) without crashing', () => {
    const buf = buildVsMeta([
      ...stringField(2, 'Movie With MD5'),
      ...stringField(18, 'abc123md5hash'),
      ...varintField(5, 2023),
    ]);
    const result = parseVsMeta(buf);
    expect(result.title).toBe('Movie With MD5');
    expect(result.year).toBe(2023);
  });

  it('parses contentRating string (field 11)', () => {
    expect(parseVsMeta(buildVsMeta(stringField(11, 'PG-13'))).contentRating).toBe('PG-13');
  });

  it('parses rating from field 12 varint (value / 10)', () => {
    expect(parseVsMeta(buildVsMeta(varintField(12, 90))).rating).toBeCloseTo(9.0);
  });

  it('ignores MAX_UINT64 rating sentinel (means "unrated")', () => {
    expect(parseVsMeta(buildVsMeta(varintField(12, 18446744073709551615n))).rating).toBe(0);
  });

  it('parses TMDb JSON (field 9) for IMDB/TMDb IDs and rating', () => {
    const json = JSON.stringify({
      'com.synology.TheMovieDb': {
        reference: { imdb: 'tt0468569', themoviedb: 155 },
        rating: { themoviedb: 9.2 },
      },
    });
    const result = parseVsMeta(buildVsMeta(stringField(9, json)));
    expect(result.imdbId).toBe('tt0468569');
    expect(result.tmdbId).toBe('155');
    expect(result.rating).toBeCloseTo(9.2);
  });

  it('prefers field 12 rating over JSON rating when field 12 is set first', () => {
    const json = JSON.stringify({
      'com.synology.TheMovieDb': { rating: { themoviedb: 9.2 } },
    });
    const buf = buildVsMeta([...varintField(12, 81), ...stringField(9, json)]);
    expect(parseVsMeta(buf).rating).toBeCloseTo(8.1);
  });

  it('handles TMDb JSON without com.synology.TheMovieDb key', () => {
    const json = JSON.stringify({ someOtherKey: 'value' });
    const result = parseVsMeta(buildVsMeta(stringField(9, json)));
    expect(result.imdbId).toBe('');
    expect(result.tmdbId).toBe('');
    expect(result.rating).toBe(0);
  });

  it('handles TMDb JSON with empty reference (no imdb/themoviedb)', () => {
    const json = JSON.stringify({
      'com.synology.TheMovieDb': { reference: {}, rating: {} },
    });
    const result = parseVsMeta(buildVsMeta(stringField(9, json)));
    expect(result.imdbId).toBe('');
    expect(result.tmdbId).toBe('');
    expect(result.rating).toBe(0);
  });

  it('handles malformed JSON in field 9 gracefully', () => {
    const buf = buildVsMeta(stringField(9, '{not valid json!!!'));
    const result = parseVsMeta(buf);
    expect(result.imdbId).toBe('');
    expect(result.tmdbId).toBe('');
  });

  it('ignores a non-finite themoviedb rating and keeps rating at 0', () => {
    // Build a JSON payload that contains a non-finite number for the rating.
    // The isFinite() guard in parseTmdbJson must reject it and leave rating as 0.
    // Standard JSON.parse('{"x":1e309}') → {x: Infinity} in V8.
    const buf = buildVsMeta(stringField(9, '{"com.synology.TheMovieDb":{"rating":{"themoviedb":1e309}}}'));
    const result = parseVsMeta(buf);
    expect(result.rating).toBe(0); // Infinity is not finite → rejected
  });

  it('wires up cast/crew from field 10', () => {
    const castBuf = Buffer.from([
      ...stringField(1, 'Actor One'),
      ...stringField(2, 'Director One'),
      ...stringField(3, 'Drama'),
    ]);
    const result = parseVsMeta(buildVsMeta(bytesField(10, castBuf)));
    expect(result.actors).toContain('Actor One');
    expect(result.directors).toContain('Director One');
    expect(result.genres).toContain('Drama');
  });

  it('wires up TV episode details from field 19', () => {
    const epBuf = buildEpisodeDetails({
      season: 5, episode: 14, year: 2013,
      airDate: '2013-09-15', plot: 'Walter faces the consequences.',
    });
    const buf = buildVsMeta([
      ...varintField(1, 2),
      ...stringField(2, 'Breaking Bad'),
      ...bytesField(19, epBuf),
    ]);
    const result = parseVsMeta(buf);
    expect(result.contentType).toBe(2);
    expect(result.title).toBe('Breaking Bad');
    expect(result.season).toBe(5);
    expect(result.episode).toBe(14);
    expect(result.airDate).toBe('2013-09-15');
    expect(result.episodePlot).toBe('Walter faces the consequences.');
    // Episode data promoted to outer fields
    expect(result.year).toBe(2013);
    expect(result.releaseDate).toBe('2013-09-15');
    expect(result.plot).toBe('Walter faces the consequences.');
  });

  it('wires up episode thumbnail to posterImage', () => {
    const epBuf = buildEpisodeDetails({
      season: 1, episode: 1, year: 2020,
      airDate: '2020-01-01', plot: 'Test', withImage: true,
    });
    const result = parseVsMeta(buildVsMeta([...varintField(1, 2), ...bytesField(19, epBuf)]));
    expect(result.posterImage).toBeDefined();
    expect(result.posterImage![0]).toBe(0xff);
    expect(result.posterImage![1]).toBe(0xd8);
  });

  it('wires up episode backdrop fields (image, md5, timestamp)', () => {
    // Build a nested image message for the episode backdrop (episode field 10)
    const backdropInner = Buffer.from([
      ...base64JpegField(1),
      ...stringField(2, 'ep-md5-hash'),
      ...varintField(3, 1600000000),
    ]);
    // Build episode details buffer with backdrop (field 10)
    const epBuf = Buffer.from([
      ...varintField(1, 2),              // season
      ...varintField(2, 5),              // episode
      ...varintField(3, 2022),           // year
      ...stringField(4, '2022-03-15'),   // airDate
      ...stringField(6, 'Episode plot'), // plot
      ...bytesField(10, backdropInner),  // backdrop
    ]);
    const buf = buildVsMeta([
      ...varintField(1, 2),
      ...stringField(2, 'Show With Backdrop'),
      ...bytesField(19, epBuf),
    ]);
    const result = parseVsMeta(buf);
    expect(result.backdropImage).toBeDefined();
    expect(result.backdropImage![0]).toBe(0xff);
    expect(result.backdropMd5).toBe('ep-md5-hash');
    expect(result.backdropTimestamp).toBe(1600000000);
  });

  it('parses multiple outer fields together', () => {
    const buf = buildVsMeta([
      ...varintField(1, 1),
      ...stringField(2, 'Inception'),
      ...stringField(4, 'Your mind is the scene of the crime.'),
      ...varintField(5, 2010),
      ...stringField(6, '2010-07-16'),
      ...stringField(8, 'A thief who steals corporate secrets...'),
      ...stringField(11, 'PG-13'),
      ...varintField(12, 87),
    ]);
    const result = parseVsMeta(buf);
    expect(result.contentType).toBe(1);
    expect(result.title).toBe('Inception');
    expect(result.year).toBe(2010);
    expect(result.releaseDate).toBe('2010-07-16');
    expect(result.plot).toBe('A thief who steals corporate secrets...');
    expect(result.contentRating).toBe('PG-13');
    expect(result.rating).toBeCloseTo(8.7);
  });

  it('does not crash on unknown 64-bit wire type fields', () => {
    const unknown64bit = [(99 << 3) | 1, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
    const buf = buildVsMeta([
      ...stringField(2, 'Safe Movie'),
      ...unknown64bit,
      ...stringField(6, '2023-01-01'),
    ]);
    const result = parseVsMeta(buf);
    expect(result.title).toBe('Safe Movie');
    expect(result.releaseDate).toBe('2023-01-01');
  });

  it('skips all image fields when skipImages:true', () => {
    const buf = buildVsMeta([
      ...varintField(1, 1),
      ...stringField(2, 'No Images Movie'),
      ...base64JpegField(17),
    ]);
    const result = parseVsMeta(buf, { skipImages: true });
    expect(result.title).toBe('No Images Movie');
    expect(result.posterImage).toBeUndefined();
    expect(result.backdropImage).toBeUndefined();
  });

  it('skipImages:true still parses all non-image fields correctly', () => {
    const epBuf = buildEpisodeDetails({
      season: 2, episode: 3, year: 2021,
      airDate: '2021-04-01', plot: 'Plot text', withImage: true,
    });
    const buf = buildVsMeta([
      ...varintField(1, 2),
      ...stringField(2, 'My Show'),
      ...bytesField(19, epBuf),
    ]);
    const result = parseVsMeta(buf, { skipImages: true });
    expect(result.title).toBe('My Show');
    expect(result.season).toBe(2);
    expect(result.episode).toBe(3);
    expect(result.posterImage).toBeUndefined();
  });

  it('skipImages:false (explicit) still decodes images', () => {
    const buf = buildVsMeta(base64JpegField(17));
    const result = parseVsMeta(buf, { skipImages: false });
    expect(result.posterImage).toBeDefined();
    expect(result.posterImage![0]).toBe(0xff);
  });

  it('does not crash on 32-bit wire type fields', () => {
    const fixed32 = [(99 << 3) | 5, 0x01, 0x02, 0x03, 0x04];
    const buf = buildVsMeta([...stringField(2, 'Fixed32 Movie'), ...fixed32, ...varintField(5, 2020)]);
    const result = parseVsMeta(buf);
    expect(result.title).toBe('Fixed32 Movie');
    expect(result.year).toBe(2020);
  });

  it('parses backdrop image from field 21 (movie)', () => {
    // Build a nested image message: field 1 = base64 JPEG, field 2 = md5, field 3 = timestamp
    const innerMsg = Buffer.from([
      ...base64JpegField(1),
      ...stringField(2, 'deadbeef1234'),
      ...varintField(3, 1700000000),
    ]);
    const buf = buildVsMeta([
      ...varintField(1, 1),
      ...stringField(2, 'Backdrop Movie'),
      ...bytesField(21, innerMsg),
    ]);
    const result = parseVsMeta(buf);
    expect(result.backdropImage).toBeDefined();
    expect(result.backdropImage![0]).toBe(0xff);
    expect(result.backdropImage![1]).toBe(0xd8);
    expect(result.backdropMd5).toBe('deadbeef1234');
    expect(result.backdropTimestamp).toBe(1700000000);
  });

  it('skipImages:true skips backdrop field 21', () => {
    const innerMsg = Buffer.from(base64JpegField(1));
    const buf = buildVsMeta([
      ...stringField(2, 'Skip Backdrop Movie'),
      ...bytesField(21, innerMsg),
    ]);
    const result = parseVsMeta(buf, { skipImages: true });
    expect(result.title).toBe('Skip Backdrop Movie');
    expect(result.backdropImage).toBeUndefined();
  });

  it('stops parsing on unknown wire type (wire type 3)', () => {
    // Wire type 3 is not a valid protobuf wire type; parser should bail
    const unknownWire = [(99 << 3) | 3];
    const buf = buildVsMeta([
      ...stringField(2, 'Before Unknown'),
      ...unknownWire,
      ...varintField(5, 2025),  // should NOT be reached
    ]);
    const result = parseVsMeta(buf);
    expect(result.title).toBe('Before Unknown');
    expect(result.year).toBe(0);  // never parsed due to bail-out
  });
});

// ---------------------------------------------------------------------------
// Integration tests — run against the real example files
// ---------------------------------------------------------------------------

const EXAMPLES_DIR = path.join(__dirname, '..', 'examples');

function exampleFile(name: string): string {
  return path.join(EXAMPLES_DIR, name);
}

function exampleExists(name: string): boolean {
  return fs.existsSync(exampleFile(name));
}

describe('parseVsMeta (integration — real .vsmeta files)', () => {
  const escapeFile = 'Escape.Plan.2.Hades.2018.1080p.BluRay.x264-[YTS.AM].mp4.vsmeta';
  const fantasticFile = 'Fantastic.Beasts.and.Where.to.Find.Them.2016 (high).mp4.vsmeta';
  const alienFile = 'Alien.Earth.2024.S01E03.Metamorphosis.1080p.HEVC.x265-MeGusta[EZTVx.to].mkv.vsmeta';

  describe('Escape Plan 2 (movie)', () => {
    let result: VsMetaData;
    beforeAll(() => {
      if (!exampleExists(escapeFile)) return;
      result = parseVsMeta(fs.readFileSync(exampleFile(escapeFile)));
    });

    const skip = () => !exampleExists(escapeFile);

    it('content type is movie', () => { if (skip()) return; expect(result.contentType).toBe(1); });
    it('title is correct', () => { if (skip()) return; expect(result.title).toBe('Escape Plan 2: Hades'); });
    it('year is 2018', () => { if (skip()) return; expect(result.year).toBe(2018); });
    it('release date is correct', () => { if (skip()) return; expect(result.releaseDate).toBe('2018-06-05'); });
    it('episodeTitle is "He\'s back."', () => { if (skip()) return; expect(result.episodeTitle).toBe("He's back."); });
    it('plot contains "Ray Breslin"', () => { if (skip()) return; expect(result.plot).toContain('Ray Breslin'); });
    it('content rating is "R"', () => { if (skip()) return; expect(result.contentRating).toBe('R'); });
    it('rating is approximately 5.1', () => { if (skip()) return; expect(result.rating).toBeCloseTo(5.1, 1); });
    it('actors includes Sylvester Stallone', () => { if (skip()) return; expect(result.actors).toContain('Sylvester Stallone'); });
    it('directors includes Steven C. Miller', () => { if (skip()) return; expect(result.directors).toContain('Steven C. Miller'); });
    it('genres includes Action', () => { if (skip()) return; expect(result.genres).toContain('Action'); });
    it('imdbId is correct', () => { if (skip()) return; expect(result.imdbId).toBe('tt6513656'); });
    it('poster image is a JPEG buffer', () => {
      if (skip()) return;
      expect(result.posterImage![0]).toBe(0xff);
      expect(result.posterImage![1]).toBe(0xd8);
      expect(result.posterImage!.length).toBeGreaterThan(1000);
    });
    it('backdrop image is a JPEG buffer', () => {
      if (skip()) return;
      expect(result.backdropImage![0]).toBe(0xff);
      expect(result.backdropImage![1]).toBe(0xd8);
    });
    it('has no season or episode', () => {
      if (skip()) return;
      expect(result.season).toBeUndefined();
      expect(result.episode).toBeUndefined();
    });
  });

  describe('Fantastic Beasts (movie)', () => {
    let result: VsMetaData;
    beforeAll(() => {
      if (!exampleExists(fantasticFile)) return;
      result = parseVsMeta(fs.readFileSync(exampleFile(fantasticFile)));
    });

    const skip = () => !exampleExists(fantasticFile);

    it('content type is movie', () => { if (skip()) return; expect(result.contentType).toBe(1); });
    it('title is correct', () => { if (skip()) return; expect(result.title).toBe('Fantastic Beasts and Where to Find Them'); });
    it('year is 2016', () => { if (skip()) return; expect(result.year).toBe(2016); });
    it('content rating is "PG-13"', () => { if (skip()) return; expect(result.contentRating).toBe('PG-13'); });
    it('rating is approximately 7.3', () => { if (skip()) return; expect(result.rating).toBeCloseTo(7.3, 1); });
    it('poster image is a JPEG buffer', () => { if (skip()) return; expect(result.posterImage![0]).toBe(0xff); });
  });

  describe('Alien: Earth S01E03 (TV show)', () => {
    let result: VsMetaData;
    beforeAll(() => {
      if (!exampleExists(alienFile)) return;
      result = parseVsMeta(fs.readFileSync(exampleFile(alienFile)));
    });

    const skip = () => !exampleExists(alienFile);

    it('content type is TV show', () => { if (skip()) return; expect(result.contentType).toBe(2); });
    it('title is "Alien: Earth"', () => { if (skip()) return; expect(result.title).toBe('Alien: Earth'); });
    it('season is 1', () => { if (skip()) return; expect(result.season).toBe(1); });
    it('episode is 3', () => { if (skip()) return; expect(result.episode).toBe(3); });
    it('air date is 2025-08-12', () => { if (skip()) return; expect(result.airDate).toBe('2025-08-12'); });
    it('episode plot is non-empty', () => {
      if (skip()) return;
      expect(result.episodePlot).toBeTruthy();
      expect((result.episodePlot ?? '').length).toBeGreaterThan(10);
    });
    it('episode thumbnail is a JPEG buffer', () => {
      if (skip()) return;
      expect(result.posterImage![0]).toBe(0xff);
      expect(result.posterImage![1]).toBe(0xd8);
    });
    it('episode backdrop is a JPEG buffer', () => {
      if (skip()) return;
      expect(result.backdropImage![0]).toBe(0xff);
      expect(result.backdropImage![1]).toBe(0xd8);
    });
  });
});
