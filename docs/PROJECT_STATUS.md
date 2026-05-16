# Project Status

## Latest Stable Checkpoint

Latest known stable category checkpoint:

```text
post-mvp-16-3-delete-category-record-apply-v1
```

Category Management safety documentation checkpoint:

```text
post-mvp-17-1-category-management-safety-docs-v1
```

Treat Batch 17.1 as complete if that checkpoint has already been merged.

Backup/Restore UX Safety Review expected checkpoint after merge:

```text
post-mvp-18-1-backup-restore-ux-safety-v1
```

Settings Persistence Planning expected checkpoint after merge:

```text
post-mvp-18-2-settings-persistence-planning-v1
```

Category Management Dedicated Page Planning expected checkpoint after merge:

```text
post-mvp-19-1-category-management-dedicated-page-planning-v1
```

Category Management Dedicated Page Implementation expected checkpoint after merge:

```text
post-mvp-19-2-category-management-dedicated-page-implementation-v1
```

Form Category Picker Lockdown Planning expected checkpoint after merge:

```text
post-mvp-20-1-form-category-picker-lockdown-planning-v1
```

Categories Sidebar Page Planning expected checkpoint after merge:

```text
post-mvp-21-1-categories-sidebar-page-planning-v1
```

Categories Sidebar Page Implementation expected checkpoint after merge:

```text
post-mvp-21-2-categories-sidebar-page-implementation-v1
```

Related Performer Picker Structure Planning expected checkpoint after merge:

```text
post-mvp-22-1-related-performer-picker-structure-planning-v1
```

Related Performer Storage Planning expected checkpoint after merge:

```text
post-mvp-22-2-related-performer-storage-planning-v1
```

Related Performer Storage Implementation expected checkpoint after merge:

```text
post-mvp-22-3-related-performer-storage-implementation-v1
```

Related Performer Picker Implementation expected checkpoint after merge:

```text
post-mvp-22-4-related-performer-picker-implementation-v1
```

Related Performer Detail Display and Smoke Validation expected checkpoint after merge:

```text
post-mvp-22-5-related-performer-display-smoke-validation-v1
```

Related Video/Image Picker Structure Planning expected checkpoint after merge:

```text
post-mvp-23-1-related-video-image-picker-structure-planning-v1
```

Related Video/Image Storage Planning expected checkpoint after merge:

```text
post-mvp-23-2-related-video-image-storage-planning-v1
```

Media File Status / Open File Planning expected checkpoint after merge:

```text
post-mvp-24-1-media-file-status-open-file-planning-v1
```

Media File Status Runtime Implementation expected checkpoint after merge:

```text
post-mvp-24-2-media-file-status-runtime-implementation-v1
```

Detail Page Media File Status Display expected checkpoint after merge:

```text
post-mvp-24-3-detail-page-media-file-status-display-v1
```

External Media Open Planning expected checkpoint after merge:

```text
post-mvp-24-4-external-media-open-planning-v1
```

External Media Open Runtime Implementation expected checkpoint after merge:

```text
post-mvp-24-5-external-media-open-runtime-implementation-v1
```

Latest documentation alignment batch:

```text
batch-17-3-prd-alignment-development-plan
```

Current documentation alignment document:

```text
docs/11-prd-alignment-and-development-plan.md
```

## Completed Category Management Milestones

- Settings -> Catalog Settings includes Category Management.
- Category audit lists Record Categories from Videos, Images, and Performers.
- Collection pages support category filtering.
- Managed Categories can be added locally.
- Managed Categories are offered as the controlled vocabulary for form category selection.
- Managed Categories can be renamed locally without changing records.
- Record category rename has preview, confirmation, and apply behavior.
- Unused Managed Categories can be deleted after confirmation.
- Record category removal has preview, confirmation, and apply behavior.
- Record category apply operations patch only `categoriesJson`.
- Category Management safety rules are documented in `docs/10-category-management-safety.md`.
- Category Management has a dedicated route at `/settings/category-management`.
- Categories has a dedicated browse route at `/categories`.

## Current Capabilities

Sakurava currently supports local catalog management for:

- Videos
- Images
- Performers

Current app capabilities include:

- local/offline desktop operation;
- SQLite-backed persistence;
- Tauri runtime;
- create, list, detail, update, and delete flows;
- collection search, sort, view toggle, pagination, and category filtering;
- Categories sidebar browse/discovery page;
- Managed Categories-only form category picker;
- Related Performer JSON storage foundation for Videos and Images;
- Related Performer picker on Video and Image forms;
- Related Performer detail display on Video and Image detail pages;
- Related Video/Image Picker Structure planning through Batch 23.1 after merge;
- Related Video/Image Storage planning through Batch 23.2 after merge;
- Media File Status / Open File planning through Batch 24.1 after merge;
- Media File Status runtime foundation through Batch 24.2 after merge;
- Detail page Media File Status display through Batch 24.3 after merge;
- External Media Open planning through Batch 24.4 after merge;
- External Media Open runtime foundation through Batch 24.5 after merge;
- Settings runtime/status areas;
- backup/restore foundation and UI from earlier batches;
- native file picker and manual thumbnail handling from earlier batches;
- Category Management through Batch 16.3.

These docs are compressed project memory. They intentionally do not reconstruct the full historical workflow.

## Current Known Verification Status

Known verification commands for the current project:

```powershell
npm.cmd run test
npm.cmd run build
Push-Location src-tauri; cargo test; Pop-Location
npm.cmd run tauri dev
```

`cargo test` must be run from `src-tauri`, not from the project root.

For Batch 24.5, runtime changes may add an external media open command and frontend wrapper only. Detail page Play UI, image preview behavior, reveal folder behavior, open folder behavior, media player behavior, file scanner behavior, schema, database records, backend record types, forms, Backup/Restore behavior, related picker behavior, category behavior, and broad UI changes should not change.

## Recommended Next Phase

Proceed with the locked roadmap in `docs/ROADMAP_LOCKED.md`.

Latest roadmap implementation batch:

```text
Batch 22.5 - Related Performer Detail Display and Smoke Validation
```

Recommended next phase after Batch 24.5:

```text
Video Detail Play Button
```

Keep the next batch narrow. Start from a clean branch, read `AGENTS.md`, `docs/PROJECT_STATUS.md`, `docs/ROADMAP_LOCKED.md`, `docs/WORKFLOW_GIT.md`, `docs/AGENT_CODE_HANDOFF.md`, `docs/10-category-management-safety.md`, `docs/12-backup-restore-ux-safety.md`, `docs/13-settings-persistence-planning.md`, `docs/14-category-management-dedicated-page-planning.md`, `docs/15-form-category-picker-lockdown-planning.md`, `docs/16-categories-sidebar-page-planning.md`, `docs/17-related-performer-picker-structure-planning.md`, `docs/18-related-performer-storage-planning.md`, `docs/19-related-video-image-picker-structure-planning.md`, `docs/20-related-video-image-storage-planning.md`, `docs/21-media-file-status-open-file-planning.md`, and `docs/22-external-media-open-planning.md` before changing code.
