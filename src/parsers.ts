/**
 * Nested block parsers for .vsmeta sub-messages.
 *
 * The outer .vsmeta message embeds two nested messages that require their own
 * parsing pass:
 *   field 10 – cast/crew (actors, directors, genres, writers)
 *   field 19 – TV episode details (season, episode, air date, thumbnail, backdrop)
 */

import {
  WIRE_VARINT,
  WIRE_LENGTH,
  WIRE_64BIT,
  WIRE_32BIT,
  readVarint,
  readTag,
  skipField,
  readLengthDelimited,
} from './wire.js';
import { BackdropData, tryDecodeBase64Jpeg, parseNestedImageMessage } from './image.js';

// ---------------------------------------------------------------------------
// Cast / crew (field 10)
// ---------------------------------------------------------------------------

export interface CastBlock {
  actors: string[];
  directors: string[];
  genres: string[];
  writers: string[];
}

/**
 * Parse field 10 — the cast/crew nested message.
 *
 * Structure (all fields are repeated strings):
 *   field 1 = actor names
 *   field 2 = director names
 *   field 3 = genre names
 *   field 4 = writer names
 */
export function parseCastBlock(buf: Buffer): CastBlock {
  const actors: string[] = [];
  const directors: string[] = [];
  const genres: string[] = [];
  const writers: string[] = [];
  let pos = 0;

  while (pos < buf.length) {
    const [fieldNum, wireType, newPos] = readTag(buf, pos);
    pos = newPos;

    if (wireType === WIRE_LENGTH) {
      const [data, nextPos] = readLengthDelimited(buf, pos);
      pos = nextPos;
      try {
        const name = data.toString('utf8');
        switch (fieldNum) {
          case 1: actors.push(name); break;
          case 2: directors.push(name); break;
          case 3: genres.push(name); break;
          case 4: writers.push(name); break;
        }
      } catch { /* v8 ignore next - Buffer.toString never throws */ }
    } else {
      pos = skipField(buf, pos, wireType);
    }
  }

  return { actors, directors, genres, writers };
}

// ---------------------------------------------------------------------------
// TV episode details (field 19)
// ---------------------------------------------------------------------------

export interface EpisodeDetails {
  season: number;
  episode: number;
  year: number;
  airDate: string;
  plot: string;
  locked: boolean;
  thumbnail?: Buffer;
  backdrop?: BackdropData;
}

/**
 * Parse field 19 — the TV episode details nested message.
 *
 * Structure:
 *   field 1 (varint) = season number
 *   field 2 (varint) = episode number
 *   field 3 (varint) = year
 *   field 4 (string) = air date "YYYY-MM-DD"
 *   field 5 (varint) = show-level locked flag
 *   field 6 (string) = episode plot
 *   field 7 (string) = episode thumbnail (base64-encoded JPEG)
 *   field 10 (bytes) = episode backdrop (nested image message)
 *
 * @param skipImages When true, fields 7 and 10 are not decoded.
 */
export function parseEpisodeDetails(buf: Buffer, skipImages = false): EpisodeDetails {
  const result: EpisodeDetails = {
    season: 0,
    episode: 0,
    year: 0,
    airDate: '',
    plot: '',
    locked: false,
  };
  let pos = 0;

  while (pos < buf.length) {
    const [fieldNum, wireType, newPos] = readTag(buf, pos);
    pos = newPos;

    if (wireType === WIRE_VARINT) {
      const [val, nextPos] = readVarint(buf, pos);
      pos = nextPos;
      switch (fieldNum) {
        case 1: result.season = Number(val); break;
        case 2: result.episode = Number(val); break;
        case 3: result.year = Number(val); break;
        case 5: result.locked = val !== 0n; break;
      }
    } else if (wireType === WIRE_LENGTH) {
      const [data, nextPos] = readLengthDelimited(buf, pos);
      pos = nextPos;
      switch (fieldNum) {
        case 4:
          try { result.airDate = data.toString('utf8'); } catch { /* v8 ignore next - Buffer.toString never throws */ }
          break;
        case 6:
          try { result.plot = data.toString('utf8'); } catch { /* v8 ignore next - Buffer.toString never throws */ }
          break;
        case 7:
          if (!skipImages) result.thumbnail = tryDecodeBase64Jpeg(data);
          break;
        case 10:
          if (!skipImages) result.backdrop = parseNestedImageMessage(data);
          break;
      }
    } else if (wireType === WIRE_64BIT) {
      pos += 8;
    } else if (wireType === WIRE_32BIT) {
      pos += 4;
    } else {
      break; // unknown wire type
    }
  }

  return result;
}
