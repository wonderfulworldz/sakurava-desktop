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
- Managed Categories are offered as form category suggestions.
- Managed Categories can be renamed locally without changing records.
- Record category rename has preview, confirmation, and apply behavior.
- Unused Managed Categories can be deleted after confirmation.
- Record category removal has preview, confirmation, and apply behavior.
- Record category apply operations patch only `categoriesJson`.
- Category Management safety rules are documented in `docs/10-category-management-safety.md`.

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
- form category chips and managed category suggestions;
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

For this documentation-only batch, no application code, tests, schema, backend, Rust/Tauri, UI, or category behavior should change.

## Recommended Next Phase

Proceed with the locked roadmap in `docs/ROADMAP_LOCKED.md`.

Latest roadmap documentation batch:

```text
Batch 18.2 - Settings Persistence Planning
```

Recommended next phase after Batch 18.2:

```text
Category Management Dedicated Page Planning
```

Keep the next batch narrow. Start from a clean branch, read `AGENTS.md`, `docs/PROJECT_STATUS.md`, `docs/ROADMAP_LOCKED.md`, `docs/WORKFLOW_GIT.md`, `docs/AGENT_CODE_HANDOFF.md`, `docs/10-category-management-safety.md`, `docs/12-backup-restore-ux-safety.md`, and `docs/13-settings-persistence-planning.md` before changing code.
