# vsmeta-parser

Parse [Synology DS Video](https://www.synology.com/en-global/dsm/feature/video_station) `.vsmeta` binary metadata files into structured JavaScript objects.

## What is a `.vsmeta` file?

Synology **DS Video** (also called Video Station) is the media server application bundled with Synology NAS devices. When DS Video fetches metadata for a video file — title, plot, cast, ratings, posters, and backdrops — it stores that metadata in a sidecar file with the same name as the video but with a `.vsmeta` extension appended.

For example:
```
Inception.2010.1080p.mkv
Inception.2010.1080p.mkv.vsmeta   ← sidecar metadata file
```

The `.vsmeta` format is a binary encoding that closely follows [Protocol Buffers](https://protobuf.dev/) tag-length-value (TLV) conventions, but without a `.proto` schema file. This library implements a standalone parser for that format, derived from analysis of real `.vsmeta` files.

Both **movies** and **TV show episodes** are supported. TV episode files carry the show-level title alongside per-episode details (season, episode number, air date, episode plot, and thumbnail) in a nested message.

## Installation

```bash
npm install vsmeta-parser
# or
pnpm add vsmeta-parser
# or
bun add vsmeta-parser
```

## Quick Start

```typescript
import { parseVsMeta } from 'vsmeta-parser';
import { readFileSync } from 'fs';

const buf = readFileSync('Inception.2010.1080p.mkv.vsmeta');
const meta = parseVsMeta(buf);

console.log(meta.title);        // "Inception"
console.log(meta.year);         // 2010
console.log(meta.rating);       // 8.7
console.log(meta.actors);       // ["Leonardo DiCaprio", "Joseph Gordon-Levitt", ...]
console.log(meta.imdbId);       // "tt1375666"
console.log(meta.posterImage);  // Buffer containing JPEG data
```

### TV Show Episode

```typescript
const meta = parseVsMeta(readFileSync('Breaking.Bad.S05E14.mkv.vsmeta'));

console.log(meta.contentType);  // 2 (TV show)
console.log(meta.title);        // "Breaking Bad"  (show title)
console.log(meta.season);       // 5
console.log(meta.episode);      // 14
console.log(meta.airDate);      // "2013-09-29"
console.log(meta.episodePlot);  // episode-specific synopsis
console.log(meta.posterImage);  // episode thumbnail JPEG
```

### Skipping images for faster scanning

If you only need text metadata and want to avoid the cost of decoding embedded images, pass `skipImages: true`:

```typescript
const meta = parseVsMeta(buf, { skipImages: true });
// meta.posterImage and meta.backdropImage will be undefined
```

## API

### `parseVsMeta(buf, options?)`

Parses a `.vsmeta` binary buffer and returns a `VsMetaData` object.

| Parameter | Type | Description |
|-----------|------|-------------|
| `buf` | `Buffer` | Raw contents of the `.vsmeta` file |
| `options.skipImages` | `boolean` | When `true`, skip decoding JPEG images. Default: `false` |

Throws an `Error` if the buffer is too small to be a valid `.vsmeta` file.

### `VsMetaData`

All fields are always present on the returned object; optional fields (`?`) are only populated when relevant to the content type.

| Field | Type | Description |
|-------|------|-------------|
| `contentType` | `1 \| 2` | `1` = movie, `2` = TV show episode |
| `title` | `string` | Movie title or TV show title |
| `originalTitle` | `string` | Original language title (often same as `title`) |
| `episodeTitle` | `string` | Episode title (TV) or tagline (movies) |
| `year` | `number` | Release year; for TV shows this comes from the episode air year |
| `releaseDate` | `string` | Release date `"YYYY-MM-DD"`; for TV shows this is the episode air date |
| `locked` | `boolean` | Whether DS Video has locked/frozen this metadata entry |
| `plot` | `string` | Plot synopsis; for TV shows this is the episode plot |
| `tmdbId` | `string` | The Movie Database (TMDb) ID |
| `imdbId` | `string` | IMDb ID, e.g. `"tt1375666"` |
| `contentRating` | `string` | Audience content rating, e.g. `"R"`, `"PG-13"` |
| `rating` | `number` | Audience rating on a 0–10 scale |
| `actors` | `string[]` | Actor names |
| `directors` | `string[]` | Director names |
| `genres` | `string[]` | Genre names |
| `writers` | `string[]` | Writer/screenwriter names |
| `posterImage` | `Buffer \| undefined` | Decoded JPEG poster (movies) or episode thumbnail (TV shows) |
| `backdropImage` | `Buffer \| undefined` | Decoded JPEG backdrop/fanart |
| `backdropMd5` | `string \| undefined` | MD5 hex hash of the backdrop image |
| `backdropTimestamp` | `number \| undefined` | Unix timestamp (seconds) embedded in the backdrop message |
| `season` | `number \| undefined` | Season number (TV shows only) |
| `episode` | `number \| undefined` | Episode number (TV shows only) |
| `airDate` | `string \| undefined` | Episode air date `"YYYY-MM-DD"` (TV shows only) |
| `episodePlot` | `string \| undefined` | Episode-specific synopsis (TV shows only) |
| `showLocked` | `boolean \| undefined` | Show-level locked flag (TV shows only) |

### `BackdropData`

Exported for advanced use cases where you need the raw backdrop message contents before they are merged into `VsMetaData`.

| Field | Type | Description |
|-------|------|-------------|
| `image` | `Buffer \| undefined` | Decoded JPEG image |
| `md5` | `string \| undefined` | MD5 hex hash |
| `timestamp` | `number \| undefined` | Unix timestamp in seconds |

## Integration tests with real files

The test suite includes integration tests that run against actual `.vsmeta` files. These tests are automatically skipped when the files are absent, so the unit tests always pass without any fixtures.

The tests expect the following files in an `examples/` directory at the package root:

```
vsmeta-parser/
└── examples/
    ├── Escape.Plan.2.Hades.2018.1080p.BluRay.x264-[YTS.AM].mp4.vsmeta        (movie)
    ├── Fantastic.Beasts.and.Where.to.Find.Them.2016 (high).mp4.vsmeta         (movie)
    └── Alien.Earth.2024.S01E03.Metamorphosis.1080p.HEVC.x265-MeGusta[EZTVx.to].mkv.vsmeta  (TV show)
```

If you have different `.vsmeta` files, update the filenames and expected values in [`test/vsmeta.test.ts`](test/vsmeta.test.ts) under the `parseVsMeta (integration — real .vsmeta files)` describe block to match your files.

## `.vsmeta` binary format notes

The format uses Protocol Buffer-style tag-length-value (TLV) encoding:

```
tag = (field_number << 3) | wire_type
```

Wire types used: `0` = varint, `1` = 64-bit, `2` = length-delimited, `5` = 32-bit.

Key outer fields: `1` (content type), `2` (title), `5` (year), `9` (TMDb JSON), `10` (cast/crew nested), `12` (rating ×10), `17` (poster base64 JPEG), `19` (TV episode nested), `21` (backdrop nested).

The rating field uses `MAX_UINT64` (`18446744073709551615n`) as a sentinel for "unrated". The audience rating in field 12 is stored as an integer multiplied by 10 (e.g., `87` → `8.7`).

Poster and backdrop images are stored as base64-encoded JPEG strings inside the binary message. The parser decodes them to raw `Buffer` values and validates the JPEG magic bytes (`0xFF 0xD8`).

## License

MIT