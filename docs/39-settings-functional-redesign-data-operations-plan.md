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
- Batch 34.4 - Import/Export Bulk Data Planning is complete.
- Tag exists: `post-mvp-34-4-import-export-bulk-data-plan-v1`.
- Batch 34.5 - Appearance + Dark Mode Implementation is complete.
- Tag exists: `post-mvp-34-5-appearance-dark-mode-v1`.
- Batch 34.6 - Export CSV Implementation is complete.
- Tag exists: `post-mvp-34-6-export-csv-implementation-v1`.
- Batch 34.7 - Import CSV Preview + Validation is complete.
- Tag exists: `post-mvp-34-7-import-csv-preview-validation-v1`.
- Batch 34.8 - Import CSV Apply + Report is complete.
- Tag exists: `post-mvp-34-8-import-csv-apply-report-v1`.
- Batch 34.8.1 - CSV Export Naming + Date + Code Field Cleanup is complete.
- Current batch: 34.9 - Settings Full Smoke Test + Cleanup.
- Next batch: 34.10 - Language System Planning.

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
34.6 - Export CSV Implementation
34.7 - Import CSV Preview + Validation
34.8 - Import CSV Apply + Report
34.8.1 - CSV Export Naming + Date + Code Field Cleanup
34.9 - Settings Full Smoke Test + Cleanup
34.10 - Language System Planning
34.11 - Language Core + Language Picker
34.12 - Language Editor UI
34.13 - Language CSV Export/Import
34.14 - Custom Language Add/Manage
34.15 - Language Full Smoke Test + Cleanup

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
  - Editor direction uses one editable CSV file per language.
  - Do not use a combined language CSV with separate language columns.
- Optimization
  - Media & Library.
  - Cache.
- Data Safety & Migration
  - Backup Database and Restore Database.
  - Import Data and Export Data.
  - Import/Export uses progressive disclosure: export choices are hidden until Export Data is selected, and Import Preview is hidden until Import Data selects/parses a CSV.
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

- 34.10 should plan language keys, storage, editor behavior, custom language behavior, per-language CSV behavior, and fallback rules.
- 34.11 may implement Language Core + Language Picker after the language system plan is approved.
- 34.12 may implement the Language Editor UI.
- 34.13 may implement Language CSV Export/Import.
- 34.14 may implement Custom Language Add/Manage.
- 34.15 should run the Language Full Smoke Test + Cleanup.
- Built-in language dictionaries must not be mutated directly.
- User edits must be stored as overrides or custom language packs.
- Per-language editor edits one selected language at a time.
- User catalog data is never translated.
- Do not scatter hardcoded language behavior through unrelated components.

### Language CSV Direction

- Language CSV is per language only.
- Do not use one combined CSV with columns such as English, Indonesian, and Japanese.
- Preferred per-language CSV columns:
  - `Key`
  - `Text`
  - `Description`
  - `Status`
- Example filenames:
  - `skv-lang-en-YYYYDDMM-HHmmss.csv`
  - `skv-lang-id-YYYYDDMM-HHmmss.csv`
  - `skv-lang-ja-YYYYDDMM-HHmmss.csv`
- Filenames use local PC time.
- CSV export exports one selected language at a time.
- CSV export should produce a full template for that language.
- CSV export includes that language's `Text` column only, not all languages.
- CSV import accepts per-language CSV only.
- CSV import must validate the language code before apply.
- CSV import must validate keys.
- Unknown keys become warnings.
- Duplicate keys become warning/block before apply.
- Empty `Text` means missing translation and should fall back safely.
- CSV import must preview before apply.

### Custom Language Direction

- Language must be editable and extendable.
- User can edit existing language text.
- User can add a new custom language.
- New custom language may be incomplete.
- Missing keys must fall back safely.
- Add Language flow should require:
  - Language Code
  - Language Name
  - Base Language
- Base Language is used for fallback.

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
- Language Editor remains unimplemented.

### 34.6 - Export CSV Implementation

- Implement Export CSV from Settings > Data Safety & Migration.
- Cover Videos, Images, Performers, and Categories as separate CSV exports.
- Include `Action` and `Sakurava Ref`, user-facing editable headers in locked order, safe CSV escaping, text-only path fields, readable category/rating/related fields, and no raw internal IDs, update keys, or JSON column names.
- Keep export read-only: no database mutation, no media file copy, and no source file mutation.
- Keep Import, XLSX, Backup/Restore changes, Clear Cache changes, Language, Category Visibility, and Thumbnail Cache out of scope.

### 34.7 - Import CSV Preview + Validation

- Parse CSV imports for Videos, Images, Performers, and Categories.
- Detect entity type, normalize rows, validate data, and show preview/report.
- Validate `Action`, `Sakurava Ref`, required headers, old technical/raw JSON headers, categories, related references, dates, ratings, numeric fields, and path text.
- Preview Added, Modified, Unchanged, Deleted, and Skipped rows only.
- Missing CSV rows are not delete; delete preview only comes from `Action = Delete`.
- Categories and Related changes require preview diffs and warnings/errors for unknown or ambiguous values.
- Data Safety & Migration should keep the default view compact; the preview table appears only after CSV selection, and Apply remains hidden until preview exists.
- Do not apply or mutate records in this batch.

### 34.8 - Import CSV Apply + Report

- Apply validated CSV import rows only after explicit confirmation.
- Preserve unrelated fields and use safe matching rules from `docs/40-import-export-bulk-data-plan.md`.
- Apply valid Add/Modified/Delete rows, leave Unchanged/Skipped rows untouched, and report row-level failures.
- Delete only through `Action = Delete`; missing rows are not delete.
- Do not silently apply unknown categories or unresolved/ambiguous related values.
- Do not copy, modify, or delete original media files.
- Keep XLSX optional later only if it shares the same validation pipeline.

### 34.8.1 - CSV Export Naming + Date + Code Field Cleanup

- Add user-facing `Code` to Video and Image CSV exports after `Sakurava Ref`.
- Standardize CSV date fields as `YYYY-MM-DD`; import validation rejects slash date formats such as `MM/DD/YYYY` or `M/D/YYYY`.
- Standardize generated CSV export filenames as `skv-(vid/img/per/cat)-YYYYDDMM-HHmmss.csv` using local PC time.
- Keep backup default filenames on the same local timestamp style while preserving the existing backup extension.
- Keep this as a small cleanup before 34.9 without changing category apply logic, Backup/Restore behavior, Clear Cache, Dark Mode, App Shell, or other pages.

### 34.9 - Settings Full Smoke Test + Cleanup

- Run the full Settings smoke pass after Backup/Restore, Clear Cache, CSV Export, Import Preview, Import Apply, and Appearance.
- Clean up stale planned labels only where their implementation has landed.
- Confirm Settings data operations are stable through Backup/Restore, Clear Cache, CSV Export, CSV Import Preview, and CSV Import Apply.
- Keep the next batch as 34.10 - Language System Planning.
- Keep Category Visibility and Thumbnail Cache work in Batch 35.

### 34.10 - Language System Planning

- Plan Language system/editor behavior after Settings data operations are stable.
- Lock the per-language CSV model, not a combined wide CSV model.
- Plan editable overrides, custom language packs, fallback behavior, and the language implementation batches.
- Keep Language controls honest and nonfunctional until implementation is explicitly approved.
- Do not mix Language planning with Category Visibility, Thumbnail Cache, Backup/Restore, Clear Cache, or Import/Export behavior changes.

### 34.11 - Language Core + Language Picker

- Implement core language dictionary loading and the Settings language picker.
- Preserve built-in dictionaries by storing edits separately.
- Missing keys must fall back safely.
- User catalog data is never translated.

### 34.12 - Language Editor UI

- Implement the per-language editor for one selected language at a time.
- Editing existing text stores overrides or custom language pack values.
- Keep incomplete languages safe through fallback behavior.

### 34.13 - Language CSV Export/Import

- Export and import per-language CSV only.
- Use `Key`, `Text`, `Description`, and `Status` columns.
- Export one selected language at a time with filenames `skv-lang-(languageCode)-YYYYDDMM-HHmmss.csv`.
- Import must preview before apply, validate language code and keys, warn on unknown keys, warn/block duplicate keys, and treat empty `Text` as missing translation.

### 34.14 - Custom Language Add/Manage

- Add custom languages with Language Code, Language Name, and Base Language.
- Base Language provides fallback for missing keys.
- New custom languages may be incomplete.

### 34.15 - Language Full Smoke Test + Cleanup

- Verify picker, editor, fallback behavior, per-language CSV export/import, and custom language management.
- Keep user catalog data untranslated.

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

## Not in 34.8.1

Batch 34.8.1 is a small CSV/export consistency cleanup only. It must not:

- modify package files;
- modify database/schema files;
- change Backup/Restore behavior beyond the default generated filename;
- implement Clear Cache changes;
- apply CSV rows without preview and explicit confirmation;
- implement XLSX behavior;
- copy, delete, move, rename, or rewrite media files;
- treat missing CSV rows as delete;
- silently create categories from unknown category labels;
- create related records;
- implement Language;
- implement Category Visibility;
- implement Thumbnail Cache or low-res regeneration;
- start Batch 34.9;
- start Batch 35.1.

## Verification for 34.8.1

Implementation verification:

```powershell
npm.cmd run test
npm.cmd run build
Push-Location src-tauri; cargo test; Pop-Location
```

Manual smoke:

```powershell
npm.cmd run tauri dev
```

## Next Batch

```text
34.10 - Language System Planning
```

34.10 should plan the Language system/editor from the current Settings structure without changing data operations or starting Batch 35. Language planning must preserve the locked per-language CSV direction, custom language support, safe fallback behavior, and the rule that user catalog data is never translated.

## Agent Continuation Rule

Future agents must follow the approved swapped order:

- 34.x is Settings + Data Operations.
- 35.x is Category Visibility + Thumbnail Cache / Low-res.

Do not revert to the old order without explicit user approval.
