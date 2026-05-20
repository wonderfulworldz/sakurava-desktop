# Import/Export Bulk Data Plan

## Current Checkpoint

- Batch 34.3 - Backup/Restore + Clear Cache Implementation is complete.
- Tag exists: `post-mvp-34-3-backup-restore-clear-cache-v1`.
- Batch 34.4 - Import/Export Bulk Data Planning is complete.
- Tag exists: `post-mvp-34-4-import-export-bulk-data-plan-v1`.
- Batch 34.5 - Appearance + Dark Mode Implementation is complete.
- Tag exists: `post-mvp-34-5-appearance-dark-mode-v1`.
- Current batch: 34.6 - Export CSV Implementation.
- Next batch: 34.7 - Import CSV Preview + Validation.

## Purpose

Import/Export Bulk Data is a safe data exchange and bulk editing workflow. It is not Backup/Restore.

Backup/Restore is full app data safety:

- creates or restores a database-level safety copy;
- may include app-generated cache or thumbnail-like app data later when explicitly supported;
- does not include original media files.

Import/Export is catalog data exchange:

- uses CSV first, with XLSX allowed only through the same validation pipeline;
- covers Videos, Images, Performers, and Categories;
- does not include original media files;
- does not include app-generated thumbnail/cache files;
- requires parse, preview, validation, confirmation, apply, and reporting before any mutation.

CSV Bulk Manual Edit is the official V1 model:

```text
Export from Sakurava -> edit manually in a spreadsheet -> import back -> preview -> apply
```

CSV is not Backup. CSV is a user-friendly and system-compatible manual edit table.

## Supported Entities

### Videos

Planned export/import field groups:

- Identity and title fields:
  - title;
  - original title.
- Release, publisher, and label fields:
  - release date;
  - publisher label;
  - censorship;
  - availability.
- Categories:
  - record category text values from `categoriesJson`.
- Rating:
  - supported rating values from the persisted rating field.
- Media path fields:
  - cover path as text only;
  - media path as text only.
- Tech info fields if already persisted:
  - duration minutes;
  - resolution;
  - file size bytes;
  - file type.
- Related fields if safe:
  - related performers;
  - related images.
- Notes.

### Images

Planned export/import field groups:

- Identity and title fields:
  - title;
  - original title.
- Release, publisher, and label fields:
  - release date;
  - publisher label;
  - censorship;
  - availability.
- Categories:
  - record category text values from `categoriesJson`.
- Rating:
  - supported rating values from the persisted rating field.
- Image and gallery path fields:
  - cover path as text only;
  - folder path as optional text metadata only;
  - gallery image paths as text paths only.
- Image count, resolution, and file metadata if already persisted:
  - image count;
  - main resolution;
  - total file size bytes;
  - main file type.
- Related fields if safe:
  - related performers;
  - related videos.
- Notes.

### Performers

Planned export/import field groups:

- Identity and name fields:
  - name;
  - original name;
  - aliases.
- Birth, debut, and retired fields:
  - birth date;
  - debut date;
  - retired date;
  - derived status should be recalculated by normal app rules where applicable, not blindly trusted from import.
- Personal and physical fields:
  - birthplace;
  - nationality;
  - blood type;
  - height cm;
  - weight kg;
  - measurements;
  - cup size.
- Categories:
  - record category text values from `categoriesJson`.
- Rating:
  - supported rating values from the persisted rating field.
- Related video/image references if safe:
  - related videos;
  - related images.
- Notes.

### Categories

Planned export/import field groups:

- Category identity:
  - parent category as readable category name;
  - category name.
- Category metadata:
  - description;
  - thumbnail path as text only;
  - visibility if implemented later;
  - notes if implemented later.
- Do not expose raw managed category keys or IDs in CSV.

### Media Boundary

- No media file binary import/export.
- Path fields are text only.
- Import/Export must not copy, move, rename, rewrite, or delete media files.
- Import/Export must not include app-generated thumbnail/cache files.

## CSV-First Recommendation

CSV should be the first implementation target.

Reasons:

- simpler parsing and writing model;
- transparent and easy to inspect in text editors;
- easy to edit in spreadsheets;
- easier to diff and review;
- lower dependency and packaging risk;
- easier row-level error reporting.

XLSX is allowed only if it can share the same parse, normalize, validate, preview, confirm, apply, and report pipeline used by CSV. If XLSX adds dependency, packaging, or validation risk, defer it to a later follow-up after CSV is stable.

## Export Workflow

Planned export flow:

1. User opens Settings > Data Safety & Migration.
2. User chooses Export Data.
3. User chooses entity scope:
   - Videos;
   - Images;
   - Performers;
   - Categories;
   - All entities.
4. User chooses format:
   - CSV first;
   - XLSX only if supported through the same pipeline.
5. App generates export file(s).
6. Export includes headers.
7. Export serializes array-like and JSON-like fields safely.
8. App reports completion and output location.

All-entity export should prefer one file per entity for CSV:

- `sakurava-videos.csv`
- `sakurava-images.csv`
- `sakurava-performers.csv`
- `sakurava-categories.csv`

If XLSX is supported later, one workbook with one sheet per entity can be considered only if the same validation and serialization rules are reused.

### Action and Sakurava Ref

Every exported CSV must start with:

1. `Action`
2. `Sakurava Ref`

`Action` defaults to `Auto` on export. Future import preview/validation recognizes these planned values:

- `Auto`
- `Update`
- `Add`
- `Delete`
- `Skip`

`Sakurava Ref` is a stable, user-friendly reference for matching existing exported rows without exposing raw IDs:

- Videos use `VID-...`
- Images use `IMG-...`
- Performers use `PER-...`
- Categories use `CAT-...`

Rows manually added by the user will later have a blank `Sakurava Ref`.

Rules:

- Do not expose raw internal IDs, UUIDs, database IDs, or `sakuravaUpdateKey`.
- Do not require users to understand UUIDs, raw IDs, or raw JSON for normal bulk edit.
- Future import preview/validation must use the shared friendly-header mapping layer to map user-facing headers back to internal fields.
- Future import semantics:
  - `Sakurava Ref` present + changed fields = Modified.
  - `Sakurava Ref` present + unchanged fields = Unchanged.
  - `Sakurava Ref` blank + main required fields filled = Added.
  - `Action = Delete` = Deleted.
  - `Action = Skip` = Skipped.
- Missing CSV row is not Delete.
- Delete only happens through `Action = Delete` and later explicit apply confirmation.
- Ambiguous matching without usable refs must be handled in Batch 34.7/34.8 preview and validation before any apply step.
- Do not use hidden columns as a safety mechanism; the user should be able to inspect the file.

### Array and JSON-Like Serialization

CSV should avoid raw JSON where a simpler documented format is safer.

Recommended V1 approach:

- categories: semicolon-separated readable text labels;
- aliases: semicolon-separated readable text labels;
- gallery image paths and performer mini thumbnails: limited split path columns;
- rating fields: split into user-facing rating columns;
- related references: semicolon-separated `REF | Display Name` values where possible, with unresolved raw IDs kept out of normal export.

The implementation batch locks exact column names through a reusable friendly header -> internal field mapping layer that future import preview/validation must reuse.

Editable CSV fields should exclude calculated/automatic display values such as Performer Status, Filmography, Pictorials, Astrological Sign, Years Active, and auto-detected media availability/tech fields.

## Import Workflow

Import must be staged. It must not mutate records during parse or preview.

Planned import flow:

1. User opens Settings > Data Safety & Migration.
2. User chooses Import Data.
3. App recommends creating a Backup Database first.
4. User chooses a CSV/XLSX file.
5. App parses the file.
6. App detects entity type from headers, sheet name, or explicit selection.
7. App normalizes row values into a draft import model.
8. App validates each row.
9. App previews proposed adds, updates, skipped rows, warnings, and errors.
10. User reviews the preview.
11. User confirms apply.
12. App applies valid confirmed changes.
13. App reports results and errors.

The apply step must be explicit and must show a clear confirmation message before mutation.

## Import Modes

Supported planned modes:

- Add new records.
- Update existing records.
- Add + Update.

### Matching Strategy

Preferred matching for normal user-friendly CSV:

- `Sakurava Ref` when present and recognized.
- Videos: title and optional release date context.
- Images: title and optional release date context.
- Performers: name and optional birth date/debut date context.
- Categories: parent category plus category name context.

Safety rules:

- Avoid accidental overwrite.
- Ambiguous matches must require user review or be rejected.
- Missing matches in update-only mode should be skipped with an error or warning.
- Matching must be shown in preview before apply.
- Add-only import must not update existing records.
- Raw IDs or hidden update keys must not be required for normal user bulk edit.
- Missing CSV rows must not be interpreted as delete.

## Validation Rules

Validation must be row-level and must produce actionable messages.

Required checks:

- required fields:
  - Video title required for new Video records;
  - Image title required for new Image records;
  - Performer name required for new Performer records.
- duplicate detection:
  - duplicate matching candidates;
  - duplicate rows in the import file;
  - possible duplicates against existing records.
- invalid dates:
  - invalid date format;
  - impossible dates;
  - retired date before debut date when applicable.
- invalid ratings:
  - non-numeric values where numeric rating is expected;
  - values outside allowed range;
  - malformed rating structures.
- invalid category arrays:
  - malformed array text;
  - empty labels;
  - duplicate labels after normalization.
- invalid path strings:
  - dangerous control characters;
  - unsupported empty placeholders;
  - path text that cannot be stored safely.
- invalid related references:
  - unresolved referenced record;
  - ambiguous referenced record;
  - malformed related reference value.
- unknown columns:
  - report as warnings unless strict mode is selected.

No partial silent corruption is allowed. Rows with errors must not be applied. Rows with warnings may be applied only if the preview and confirmation make the warnings clear.

## Category Behavior

Current category model:

- Record Categories are text labels stored in `categoriesJson`.
- Managed Categories are stored separately as app-managed category metadata.
- Record Category operations must not silently mutate Managed Categories unless a future batch explicitly implements that behavior with preview and confirmation.

Planning rules:

- Import should not silently create uncontrolled category chaos.
- Unknown category labels must be previewed.
- Categories fields are preview-diff fields in Batch 34.7.
- User should eventually be able to choose whether to keep, map, or create Managed Categories, but that may be later than V1.
- Safest first implementation: import record category text values only after preview.
- Do not automatically create parent/child categories from import files in V1.
- Do not migrate record categories to IDs.
- Preserve `categoriesJson` as the record category storage model.

## Related Fields Behavior

Related fields must preserve current safety boundaries.

Plan:

- Export related references in a documented, inspectable format.
- Include enough display context for humans to review, such as title/name snapshots.
- Related fields are preview-diff fields in Batch 34.7.
- Import related references only when the target record can be resolved safely.
- Unresolved related references should be reported in the preview and error report.
- Ambiguous related references should be rejected or require user review.
- No back-link saves.
- No Video/Image mutation from Performer import unless explicitly importing and confirming those Video/Image records.
- No relation table or schema change without a separate planning batch.

## Data Safety

Import/Export must follow these safety rules:

- Recommend Backup Database before import.
- No destructive mutation without confirmation.
- No source media deletion.
- No media copy/move/rename/rewrite.
- No broad clear operation.
- No schema change without planning.
- No raw JSON or raw internal IDs in normal UI.
- Import must preserve unrelated fields.
- Import must use partial patches rather than incomplete full-record replacement where practical.
- Import must produce a report.
- Failed rows must not corrupt valid rows.
- Runtime errors must leave the database in a known state.

For apply implementation, use transaction-oriented behavior where possible:

- either all confirmed valid rows apply successfully;
- or a clearly documented partial-apply mode reports exactly what was applied and what failed.

The safest V1 default is transactional apply for the selected import batch.

## Error Report

The import report should include:

- entity type;
- import mode;
- source file name;
- total rows;
- valid rows;
- warning rows;
- error rows;
- skipped rows;
- applied rows;
- failed apply rows;
- row number;
- field name;
- severity;
- message;
- suggested fix where practical.

The report should be visible in-app. A downloadable or copyable summary can be added later if it remains local-only and does not introduce broad file behavior.

## UI Placement

Import/Export belongs in Settings > Data Safety & Migration.

Controls:

- Import Data.
- Export Data.

Placement rules:

- Keep Import/Export visually separate from Backup & Restore.
- Copy must state that Import/Export is CSV data exchange for Videos, Images, Performers, and Categories. XLSX remains optional later only if it shares the same validation pipeline.
- Copy must state that media files are not included.
- Backup/Restore copy must remain full app data safety copy.
- Restore must not be described as Import.
- Export must not be described as Backup.

## Implementation Batch Recommendation

Current implementation sequence:

```text
34.6 - Export CSV Implementation
34.7 - Import CSV Preview + Validation
34.8 - Import CSV Apply + Report
```

1. 34.6 - Export CSV Implementation
   - Export Videos, Images, Performers, and Categories to documented CSV files.
   - Include `Action` and `Sakurava Ref`, user-facing editable headers in locked order, safe CSV escaping, readable categories/ratings/related values/path lists, and no raw internal IDs/update keys/JSON column names.
   - No import behavior.
   - No media file export, original media copy, or database mutation.
2. 34.7 - Import CSV Preview + Validation
   - Parse CSV.
   - Detect entity type.
   - Validate rows.
   - Show preview and report.
   - No apply behavior.
3. 34.8 - Import CSV Apply + Report
   - Add/update records only after confirmation.
   - Use safe matching rules.
   - Preserve unrelated fields.
   - Produce apply report.
4. XLSX optional follow-up
   - Add XLSX only through the same validation/preview/apply pipeline.
   - Do not fork business rules by file format.

## Not in 34.6

Batch 34.6 implements Export CSV only. It must not:

- modify package files;
- modify database/schema files;
- implement CSV parsing;
- implement XLSX parsing;
- implement Import CSV preview;
- implement Import CSV apply;
- implement DB mutations;
- import or export media files;
- copy original media files;
- change Backup/Restore;
- change Clear Cache;
- implement Language;
- implement Category Visibility;
- implement Thumbnail Cache or low-res regeneration.

## Next Batch

Next batch:

```text
34.7 - Import CSV Preview + Validation
```

