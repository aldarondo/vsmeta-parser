/**
 * Main .vsmeta parser.
 *
 * Orchestrates the wire-layer, image, and nested-block parsers to produce a
 * fully typed VsMetaData object from a raw .vsmeta binary buffer.
 *
 * Field reference (outer message):
 *   field  1 (varint)  – content type: 1=movie, 2=TV show
 *   field  2 (string)  – title
 *   field  3 (string)  – original title
 *   field  4 (string)  – episode title (TV) / tagline (movie)
 *   field  5 (varint)  – year
 *   field  6 (string)  – release date "YYYY-MM-DD"
 *   field  7 (varint)  – locked flag
 *   field  8 (string)  – plot
 *   field  9 (string)  – JSON with TMDb/IMDb IDs and rating
 *   field 10 (bytes)   – cast/crew nested message  → parseCastBlock()
 *   field 11 (string)  – content rating ("R", "PG-13", …)
 *   field 12 (varint)  – audience rating × 10; MAX_UINT64 = unrated
 *   field 17 (string)  – poster image (base64 JPEG, movies only)
 *   field 18 (string)  – MD5 hash of poster (skipped)
 *   field 19 (bytes)   – TV episode details nested message → parseEpisodeDetails()
 *   field 21 (bytes)   – backdrop/fanart nested message   → parseNestedImageMessage()
 */

import {
  WIRE_VARINT,
  WIRE_LENGTH,
  WIRE_64BIT,
  WIRE_32BIT,
  readVarint,
  readTag,
  readLengthDelimited,
} from './wire.js';
import { tryDecodeBase64Jpeg, parseNestedImageMessage } from './image.js';
import { parseCastBlock, parseEpisodeDetails } from './parsers.js';
import type { VsMetaData } from './types.js';

export type { VsMetaData } from './types.js';

/** Sentinel stored in field 12 when no rating has been set. */
const NO_RATING = BigInt('18446744073709551615');

/**
 * Parse a .vsmeta binary buffer and return structured metadata.
 *
 * @throws {Error} If the buffer is too small to be a valid .vsmeta file.
 * @param options.skipImages When true, embedded JPEG images are not decoded.
 *   Useful for fast metadata-only scans. posterImage and backdropImage will
 *   be undefined in the returned object.
 */
export function parseVsMeta(buf: Buffer, options?: { skipImages?: boolean }): VsMetaData {
  const skipImages = options?.skipImages ?? false;

  if (buf.length < 2) {
    throw new Error('Buffer too small to be a valid .vsmeta file');
  }

  const result: VsMetaData = {
    contentType: 1,
    title: '',
    originalTitle: '',
    episodeTitle: '',
    year: 0,
    releaseDate: '',
    locked: false,
    plot: '',
    tmdbId: '',
    imdbId: '',
    contentRating: '',
    rating: 0,
    actors: [],
    directors: [],
    genres: [],
    writers: [],
  };

  let pos = 0;
  while (pos < buf.length) {
    const [fieldNum, wireType, newPos] = readTag(buf, pos);
    pos = newPos;

    if (wireType === WIRE_VARINT) {
      const [val, nextPos] = readVarint(buf, pos);
      pos = nextPos;
      switch (fieldNum) {
        case 1: result.contentType = (Number(val) === 2 ? 2 : 1); break;
        case 5: result.year = Number(val); break;
        case 7: result.locked = val !== 0n; break;
        case 12:
          if (val !== NO_RATING) result.rating = Number(val) / 10;
          break;
      }
    } else if (wireType === WIRE_LENGTH) {
      const [data, nextPos] = readLengthDelimited(buf, pos);
      pos = nextPos;
      switch (fieldNum) {
        case 2: try { result.title = data.toString('utf8'); } catch { /* v8 ignore next - Buffer.toString never throws */ } break;
        case 3: try { result.originalTitle = data.toString('utf8'); } catch { /* v8 ignore next - Buffer.toString never throws */ } break;
        case 4: try { result.episodeTitle = data.toString('utf8'); } catch { /* v8 ignore next - Buffer.toString never throws */ } break;
        case 6: try { result.releaseDate = data.toString('utf8'); } catch { /* v8 ignore next - Buffer.toString never throws */ } break;
        case 8: try { result.plot = data.toString('utf8'); } catch { /* v8 ignore next - Buffer.toString never throws */ } break;
        case 9: parseTmdbJson(data, result); break;
        case 10: {
          const cast = parseCastBlock(data);
          result.actors = cast.actors;
          result.directors = cast.directors;
          result.genres = cast.genres;
          result.writers = cast.writers;
          break;
        }
        case 11: try { result.contentRating = data.toString('utf8'); } catch { /* v8 ignore next - Buffer.toString never throws */ } break;
        case 17: if (!skipImages) result.posterImage = tryDecodeBase64Jpeg(data); break;
        case 18: break; // MD5 hash of poster – skip
        case 19: applyEpisodeDetails(data, skipImages, result); break;
        case 21: {
          if (!skipImages) {
            const bd = parseNestedImageMessage(data);
            result.backdropImage = bd.image;
            result.backdropMd5 = bd.md5;
            result.backdropTimestamp = bd.timestamp;
          }
          break;
        }
      }
    } else if (wireType === WIRE_64BIT) {
      pos += 8;
    } else if (wireType === WIRE_32BIT) {
      pos += 4;
    } else {
      break; // unknown wire type – bail out
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Parse the TMDb JSON blob (field 9) and merge IDs/rating into result. */
function parseTmdbJson(data: Buffer, result: VsMetaData): void {
  try {
    const json = JSON.parse(data.toString('utf8')) as Record<string, unknown>;
    const tmdb = (json['com.synology.TheMovieDb'] ?? {}) as Record<string, unknown>;
    const ref = tmdb['reference'] as Record<string, unknown> | undefined;
    const ratingObj = tmdb['rating'] as Record<string, unknown> | undefined;
    if (typeof ref?.['imdb'] === 'string') result.imdbId = ref['imdb'];
    if (ref?.['themoviedb'] != null) result.tmdbId = String(ref['themoviedb']);
    // Use JSON rating as fallback only when field 12 was absent
    if (result.rating === 0 && typeof ratingObj?.['themoviedb'] === 'number') {
      result.rating = ratingObj['themoviedb'] as number;
    }
  } catch { /* v8 ignore next - defensive: malformed JSON is silently ignored */ }
}

/** Parse episode details (field 19) and merge into result. */
function applyEpisodeDetails(data: Buffer, skipImages: boolean, result: VsMetaData): void {
  const ep = parseEpisodeDetails(data, skipImages);
  result.season = ep.season;
  result.episode = ep.episode;
  result.airDate = ep.airDate;
  result.episodePlot = ep.plot;
  result.showLocked = ep.locked;
  if (ep.thumbnail) result.posterImage = ep.thumbnail;
  if (ep.backdrop?.image) result.backdropImage = ep.backdrop.image;
  if (ep.backdrop?.md5) result.backdropMd5 = ep.backdrop.md5;
  if (ep.backdrop?.timestamp !== undefined) result.backdropTimestamp = ep.backdrop.timestamp;
  // Promote episode-level values to outer fields when not already set
  if (ep.year > 0 && result.year === 0) result.year = ep.year;
  if (ep.airDate && !result.releaseDate) result.releaseDate = ep.airDate;
  if (ep.plot && !result.plot) result.plot = ep.plot;
}
