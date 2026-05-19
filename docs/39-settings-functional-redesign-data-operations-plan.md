# Settings Functional Redesign and Data Operations Plan

## Current Checkpoint

- Batch 33.4 - Performer Related Detail Sections Implementation is complete.
- Tag exists: `post-mvp-33-4-performer-related-detail-sections-v1`.
- Batch 34.1 - Settings Functional Redesign + Data Operations Planning is complete.
- Tag exists: `post-mvp-34-1-settings-functional-redesign-data-ops-plan-v1`.
- Batch 34.2 - Settings Layout Redesign Implementation is complete.
- Tag exists: `post-mvp-34-2-settings-layout-redesign-v1`.
- Batch 34.3 - Backup/Restore + Clear Cache Implementation is complete.
- Tag exists: `post-mvp-34-3-backup-restore-clear-cache-v1`.
- Current batch: 34.4 - Import/Export Bulk Data Planning.
- Next batch: 34.5 - Appearance + Dark Mode Implementation.

## Roadmap Renumbering

The user approved swapping the previous Batch 34 and Batch 35 order.

New locked order:

```text
34.x - Settings + Data Operations
35.x - Category Visibility + Thumbnail Cache / Low-res
```

Future agents must not revert to the old order where Category Visibility and Thumbnail Cache were Batch 34 and Settings/Data Operations were Batch 35.

Approved sequence:

```text
34.1 - Settings Functional Redesign + Data Operations Planning
34.2 - Settings Layout Redesign Implementation
34.3 - Backup/Restore + Clear Cache Implementation
34.4 - Import/Export Bulk Data Planning
34.5 - Appearance + Dark Mode Implementation
34.6 - Language System Planning
34.7 - Language Picker/Editor Implementation
34.8 - Settings Full Smoke Test + Cleanup

35.1 - Category Visibility + Thumbnail Cache/Low-res Strategy Planning
35.2 - Category Visibility Implementation
35.3 - Thumbnail Cache / Low-res Regeneration Implementation
```

## Why Settings Before Category and Thumbnail

Settings and data operations now come before Category Visibility and Thumbnail Cache because they establish the safe operational home for later data and cache workflows.

- Settings is the correct location for data operations, system information, appearance, language, and maintenance actions.
- Clear Cache should exist before thumbnail cache regeneration UX, so generated cache data has an obvious management and reset path.
- Backup/Restore should be stable before larger data workflows and before adding user-facing cache regeneration actions.
- Import/Export needs explicit planning before bulk data exchange or bulk edit flows are introduced.
- Appearance and Language need controlled persistence boundaries instead of ad hoc UI changes.

## Settings V1 Functional Structure

34.2 should redesign Settings as a functional navigation and operations page, not a mixed placeholder/info surface.

Locked top-level sections for 34.2:

- Appearance
  - Theme.
  - Light/Dark Mode.
- Language
  - App Language.
  - Language Editor.
  - Editor direction should remain friendly to CSV, XLSX, and plain notepad-style editing.
- Optimization
  - Media & Library.
  - Cache.
- Data Safety & Migration
  - Backup Database and Restore Database.
  - Import Data and Export Data.
  - Backup/Restore remains full app data safety and must stay separate from CSV/XLSX Import/Export.
  - Import/Export is data exchange only and does not include media files.
- App Information
  - App Version.
  - Database Status.
  - System Information.
  - Safety / Diagnostics.

## Data Operations Boundaries

### Backup/Restore

- Backup/Restore is a full database-level safety operation.
- Backup must not mutate current records.
- Restore is destructive and must require explicit confirmation.
- Restore should create a safety backup or provide rollback-oriented protection before replacing current data.
- Restore should validate the backup file before applying.
- Restart guidance is required when runtime state may not reflect restored data until relaunch.
- Backup/Restore must not be confused with CSV/XLSX bulk edit.
- Backup/Restore must clearly explain whether media files and generated cache files are included.

### Clear Cache

- Clear Cache applies only to cache-generated files/data.
- Clear Cache must not delete source media files.
- Clear Cache must not delete SQLite records.
- Clear Cache must not delete categories, settings, ratings, related picker data, or catalog records.
- Cache clearing must be scoped and confirmable.
- Cache clearing should be designed so future thumbnail/low-res regeneration can rebuild generated files safely.
- Batch 34.3 scopes Clear Cache to app-generated cache folders under Sakurava app data only: `generated-cache`, `thumbnail-cache`, and `preview-cache`. If those folders do not exist, the operation reports that no app-generated cache was found.

### Import/Export

- Import/Export is for bulk data exchange and editing, not full backup.
- Detailed planning is documented in `docs/40-import-export-bulk-data-plan.md`.
- CSV-first is preferred for V1 because it is transparent, diffable, and easier to validate.
- XLSX is acceptable only if it shares the same safe validation pipeline.
- Import must include preview, validation, confirmation, and error reporting.
- Import must not mutate records until the user confirms.
- Import must preserve unrelated fields.
- Import must not perform file operations on source media.

### Appearance

- Appearance covers Light/Dark mode first.
- Persist the selected mode safely as a low-risk UI preference.
- Do not combine Appearance with broad redesign work.
- Do not mutate catalog records or category data from Appearance settings.

### Language

- 34.6 should plan language keys, storage, editor behavior, and fallback rules.
- 34.7 may implement a picker/editor after the language system plan is approved.
- Do not implement translations in 34.1.
- Do not scatter hardcoded language behavior through unrelated components.

### System Information

- System Information should be mostly read-only.
- It may show app version/status, database location/status, runtime status, and safe storage/cache location.
- Avoid exposing raw paths in normal Settings navigation.
- Raw locations may appear only in intentional system information rows where useful and safe.

## Safety Rules

- No source media deletion.
- No copy, move, rename, rewrite, or mutation of user media files from Settings operations unless a future explicit batch approves it.
- No record mutation without preview and confirmation for bulk operations.
- No destructive operation without confirmation.
- No raw JSON, raw internal command payloads, UUIDs, or raw IDs in normal UI.
- No broad raw path exposure beyond intended System Information areas.
- Keep database backup separate from export data.
- Keep Restore separate from Import.
- Keep Clear Cache separate from record deletion.
- Keep Category Visibility and Thumbnail Cache work in Batch 35.

## Implementation Batch Outlines

### 34.2 - Settings Layout Redesign Implementation

- Implement the Settings V1 functional structure from this plan.
- Separate functional controls from System Information.
- Keep existing safe controls intact where available.
- Do not implement new Backup/Restore, Clear Cache, Import/Export, Dark Mode, or Language behavior beyond layout entry points unless explicitly included.

### 34.3 - Backup/Restore + Clear Cache Implementation

- Implement approved Backup/Restore improvements with confirmation and validation.
- Implement scoped Clear Cache behavior.
- Must not delete source media or SQLite records.
- Must provide clear success/failure reporting.
- Import/Export remains unimplemented and planned for 34.4.

### 34.4 - Import/Export Bulk Data Planning

- Plan CSV-first export/import for bulk catalog data editing.
- Define schemas, validation, preview, confirmation, errors, and rollback considerations.
- Define whether XLSX is supported through the same validation pipeline.
- Keep separate from Backup/Restore.
- Planning output is `docs/40-import-export-bulk-data-plan.md`.

### 34.5 - Appearance + Dark Mode Implementation

- Implement Light/Dark mode and safe preference persistence.
- Keep the implementation focused on theme behavior.
- Do not mix with language, category visibility, or data operations.

### 34.6 - Language System Planning

- Plan language keys, storage format, fallback behavior, editor scope, and validation.
- Decide whether language data lives in local storage, files, SQLite, or another safe local mechanism.
- Do not implement translations in this planning batch.

### 34.7 - Language Picker/Editor Implementation

- Implement the approved picker/editor behavior from 34.6.
- Keep language editing local/offline.
- Provide fallback behavior for missing keys.

### 34.8 - Settings Full Smoke Test + Cleanup

- Run the full Settings smoke pass after Backup/Restore, Clear Cache, Import/Export planning, Appearance, and Language batches.
- Clean up stale planned labels only where their implementation has landed.
- Keep Category Visibility and Thumbnail Cache work in Batch 35.

### 35.1 - Category Visibility + Thumbnail Cache/Low-res Strategy Planning

- Plan category visibility fields and thumbnail cache/low-res regeneration after Settings/Data Operations have a safe home.
- Define cache location, invalidation, backup/restore interaction, and file safety.

### 35.2 - Category Visibility Implementation

- Implement Show in Videos, Show in Images, and Show in Performers behavior.
- Keep record-level `categoriesJson` labels unchanged.

### 35.3 - Thumbnail Cache / Low-res Regeneration Implementation

- Implement approved generated thumbnail/low-res cache behavior.
- Preserve original media files.
- Use Clear Cache semantics from Batch 34.3 where applicable.

## Not in 34.4

Batch 34.4 does not implement code. It must not:

- modify `src/`;
- modify `src-tauri/`;
- modify package files;
- modify database/schema files;
- implement Settings layout;
- implement Backup/Restore changes;
- implement Clear Cache;
- implement Import/Export behavior;
- implement CSV or XLSX parsing;
- implement file picker behavior;
- mutate records;
- implement Dark Mode;
- implement Language;
- implement Category Visibility;
- implement Thumbnail Cache or low-res regeneration;
- start Batch 34.5;
- start Batch 35.1.

## Verification for 34.4

Docs-only verification:

```powershell
git status
git diff --stat
```

Do not run `npm.cmd run test` or `npm.cmd run build` for 34.4 unless source files are accidentally changed.

## Next Batch

```text
34.5 - Appearance + Dark Mode Implementation
```

34.5 should start from this document, `docs/PROJECT_STATUS.md`, `docs/ROADMAP_LOCKED.md`, `docs/AGENT_CODE_HANDOFF.md`, and existing Settings safety docs.

## Agent Continuation Rule

Future agents must follow the approved swapped order:

- 34.x is Settings + Data Operations.
- 35.x is Category Visibility + Thumbnail Cache / Low-res.

Do not revert to the old order without explicit user approval.
