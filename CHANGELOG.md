# Changelog - LOSPOR Core

## [5.6.0] - 2026-07-23

### Added

- A single `createAutosaveManager()` now owns durable-first section saves,
  per-case write ordering, revisions, snapshots, event appends, targeted event
  edits/deletes, replay, status, and cleanup for both apps.
- A durable event-mutation journal preserves offline edits and deletions without
  replaying stale whole-timeline snapshots.
- Section revisions may be integer counters or legacy timestamps during the
  migration period. Pending event appends adopt a newer server revision and
  retry once.
- Explicit partial-section saves merge confirmed fields into the manager's
  snapshot instead of replacing the full snapshot with a fragment.
- Per-case discard clears patches, pending events, mutations, revisions, and
  snapshots together.

## [5.5.1] - 2026-07-23

### Added

- Canonical intraoperative vital auto-fill preferences and planning helpers now
  live in core, so web and mobile share the same master-toggle, BP/HR, and
  backfill-on-reopen semantics.

### Fixed

- Auto-fill planning now handles multi-column gaps, skips columns that already
  contain a vital event, and refuses to generate observations before the chart
  start.

## [5.5.0] - 2026-07-23

Version alignment with web, mobile, and docs. No shared core API or runtime code
changes in this release line.
