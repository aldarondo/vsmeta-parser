# vsmeta-parser — Roadmap

## Current Milestone
✅ Production-ready — stable library used by vsmeta-to-jpeg, vsmeta-to-nfo, ds-video-to-jellyfin

### 🔨 In Progress
[Empty]

### 🟢 Ready (Next Up)
[Empty — library is stable; update only when new .vsmeta field variants are discovered]

### 📋 Backlog
- Document the reverse-engineered .vsmeta binary format spec in detail (for community reference)
- Add support for any undiscovered .vsmeta field variants found during real migration runs
- Consider publishing format documentation as a separate community resource

### 🔴 Blocked
[Empty]

## ✅ Completed
- Binary tag-length-value parser for .vsmeta format
- Field extraction: title, year, plot, actors, genres, IMDb/TMDb IDs, ratings
- Embedded JPEG image extraction (poster, backdrop)
- TV episode support: season/episode metadata
- Integration tests against real .vsmeta fixture files
- Full API documentation
- Published as npm package with Changesets versioning
