/**
 * Public TypeScript types for the vsmeta-parser library.
 *
 * Keeping the data-shape definition here (separate from parsing logic) makes
 * it easy to import the type without pulling in any parsing dependencies, and
 * keeps vsmeta.ts focused purely on orchestration logic.
 */

/** Parsed representation of a .vsmeta metadata file. */
export interface VsMetaData {
  /** 1 = movie, 2 = TV show */
  contentType: 1 | 2;
  /** Show/movie title (field 2) */
  title: string;
  /** Original title, often the same as title (field 3) */
  originalTitle: string;
  /** Episode title for TV shows; tagline for movies (field 4) */
  episodeTitle: string;
  /** Release year; for TV shows sourced from the episode air year (field 19) */
  year: number;
  /** Release date "YYYY-MM-DD"; for TV shows sourced from the episode air date */
  releaseDate: string;
  /** Whether DS Video has locked/frozen this metadata entry (field 7) */
  locked: boolean;
  /** Plot synopsis; for TV shows sourced from the episode plot */
  plot: string;

  /** The Movie Database (TMDb) ID (from JSON in field 9) */
  tmdbId: string;
  /** IMDb ID, e.g. "tt1234567" (from JSON in field 9) */
  imdbId: string;

  /** Audience content rating, e.g. "R", "PG-13" (field 11) */
  contentRating: string;
  /** Audience rating on a 0–10 scale (field 12 ÷ 10, or JSON fallback) */
  rating: number;

  /** Actor names (field 10, sub-field 1) */
  actors: string[];
  /** Director names (field 10, sub-field 2) */
  directors: string[];
  /** Genre names (field 10, sub-field 3) */
  genres: string[];
  /** Writer names (field 10, sub-field 4) */
  writers: string[];

  /** Decoded poster JPEG (field 17 for movies; episode thumbnail for TV shows) */
  posterImage?: Buffer;
  /** Decoded backdrop/fanart JPEG (field 21 for movies; episode backdrop for TV shows) */
  backdropImage?: Buffer;
  /** MD5 hex string of the backdrop image */
  backdropMd5?: string;
  /** Unix timestamp (seconds) embedded in the backdrop message */
  backdropTimestamp?: number;

  /** Season number (TV shows only, field 19 sub-field 1) */
  season?: number;
  /** Episode number (TV shows only, field 19 sub-field 2) */
  episode?: number;
  /** Episode air date "YYYY-MM-DD" (TV shows only, field 19 sub-field 4) */
  airDate?: string;
  /** Episode-specific synopsis (TV shows only, field 19 sub-field 6) */
  episodePlot?: string;
  /** Show-level locked flag (TV shows only, field 19 sub-field 5) */
  showLocked?: boolean;
}
