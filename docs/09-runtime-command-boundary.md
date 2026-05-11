# 09 - Runtime Command Boundary

## Status

This repo does not currently include a Tauri project.

No `src-tauri` directory, Cargo config, Tauri config, or Tauri package is present.
Backend Batch 4 therefore defines the command boundary in TypeScript only.

## Current Boundary

Runtime command contracts are defined in:

```text
src/backend/runtime/commands.ts
```

The boundary defines command names, payload types, result types, and a repository-backed command handler for future runtime integration.

## Command Names

```text
video_create
video_list
video_get
video_update
video_delete
image_create
image_list
image_get
image_update
image_delete
performer_create
performer_list
performer_get
performer_update
performer_delete
```

## Future Tauri Wiring

When Tauri is added safely:

1. Create `src-tauri`.
2. Add real Rust command functions with the same names.
3. Initialize the local SQLite database in native runtime startup.
4. Bind command functions to repositories.
5. Keep frontend integration in a separate Integration Only batch.

## Explicit Non-Goals For This Batch

- No React invoke calls.
- No frontend CRUD wiring.
- No native file picker.
- No relational categories.
- No relation tables.
- No backup/restore.
- No scraping.
- No media player.
- No analytics.
