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

For Batch 21.2, application frontend code and tests may change only to implement the Categories Sidebar Page as a browsing/discovery page. Category Management behavior, Form Category Picker Lockdown behavior, schema, backend, Rust/Tauri, package files, category storage, `categoriesJson`, and Managed Categories semantics should not change.

## Recommended Next Phase

Proceed with the locked roadmap in `docs/ROADMAP_LOCKED.md`.

Latest roadmap documentation batch:

```text
Batch 21.2 - Categories Sidebar Page Implementation
```

Recommended next phase after Batch 21.2:

```text
Related Performer Picker Structure
```

Keep the next batch narrow. Start from a clean branch, read `AGENTS.md`, `docs/PROJECT_STATUS.md`, `docs/ROADMAP_LOCKED.md`, `docs/WORKFLOW_GIT.md`, `docs/AGENT_CODE_HANDOFF.md`, `docs/10-category-management-safety.md`, `docs/12-backup-restore-ux-safety.md`, `docs/13-settings-persistence-planning.md`, `docs/14-category-management-dedicated-page-planning.md`, `docs/15-form-category-picker-lockdown-planning.md`, and `docs/16-categories-sidebar-page-planning.md` before changing code.
