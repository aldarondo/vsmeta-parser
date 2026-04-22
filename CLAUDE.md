# vsmeta-parser

## What This Project Is
Binary parser library for Synology DS Video .vsmeta metadata files. Reverse-engineered the Protocol Buffer-style tag-length-value format to extract title, year, plot, actors, genres, IMDb/TMDb IDs, ratings, and embedded JPEG images. Supports both movies and TV episodes. Forms the foundation for the Synology Video Station migration toolkit.

## Tech Stack
- Node.js / TypeScript
- vitest (testing — integration tests against real .vsmeta files)
- ESLint
- Changesets (versioning)
- No runtime dependencies

## Key Decisions
- Zero runtime dependencies — pure binary parsing with Buffer APIs
- Reverse-engineered format is documented in the repo (not an official spec)
- Integration tests use real .vsmeta files — do not replace with mocks
- Published as npm package; other migration tools depend on it

## Session Startup Checklist
1. Read ROADMAP.md to find the current active task
2. Check MEMORY.md if it exists — it contains auto-saved learnings from prior sessions
3. Run `npm install` if node_modules are stale
4. Run `npm test` to verify all tests pass before making changes
5. Do not break the public API — vsmeta-to-jpeg, vsmeta-to-nfo, ds-video-to-jellyfin depend on it

## Key Files
- `src/` — binary parser source
- `test/` — vitest integration tests (uses real .vsmeta fixture files)
- `CHANGELOG.md` — version history

---
@~/Documents/GitHub/CLAUDE.md

## Git Rules
- Never create pull requests. Push directly to main.
- solo/auto-push OK
