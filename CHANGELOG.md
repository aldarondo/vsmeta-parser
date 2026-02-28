# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-28

### Added

- Initial release
- `parseVsMeta()` function to parse Synology DS Video `.vsmeta` binary metadata files
- Support for movies and TV show episodes (content type field)
- Extraction of title, original title, tagline/episode title, year, release date, plot, and content rating
- TMDb and IMDb ID extraction from embedded JSON (field 9)
- Cast/crew parsing: actors, directors, genres, and writers
- Audience rating parsing with `MAX_UINT64` sentinel handling for unrated content
- Embedded JPEG image decoding: poster and backdrop/fanart
- `skipImages` option for faster metadata-only parsing
- Full TypeScript types exported: `VsMetaData`, `BackdropData`
- Dual ESM + CJS output for broad compatibility
- Modular source architecture: wire layer, image helpers, nested block parsers, and types in separate files
- 100% test coverage (statements, branches, functions, lines) with 106 unit tests
- Integration test support for validating against real `.vsmeta` fixture files
