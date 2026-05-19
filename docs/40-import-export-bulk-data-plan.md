# Import/Export Bulk Data Plan

## Current Checkpoint

- Batch 34.3 - Backup/Restore + Clear Cache Implementation is complete.
- Tag exists: `post-mvp-34-3-backup-restore-clear-cache-v1`.
- Current batch: 34.4 - Import/Export Bulk Data Planning.
- Batch 34.4 is docs-only and must not change source code, runtime commands, schema, package files, tests, or UI behavior.

## Purpose

Import/Export Bulk Data is a safe data exchange and bulk editing workflow. It is not Backup/Restore.

Backup/Restore is full app data safety:

- creates or restores a database-level safety copy;
- may include app-generated cache or thumbnail-like app data later when explicitly supported;
- does not include original media files.

Import/Export is catalog data exchange:

- uses CSV first, with XLSX allowed only through the same validation pipeline;
- covers Videos, Images, and Performers;
- does not include original media files;
- does not include app-generated thumbnail/cache files;
- requires parse, preview, validation, confirmation, apply, and reporting before any mutation.

## Supported Entities

### Videos

Planned export/import field groups:

- Identity and title fields:
  - stable update key when exported for update workflows;
  - title;
  - original title;
  - code.
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
  - stable update key when exported for update workflows;
  - title;
  - original title;
  - code.
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
  - stable update key when exported for update workflows;
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

If XLSX is supported later, one workbook with one sheet per entity can be considered only if the same validation and serialization rules are reused.

### Export IDs and Update Keys

Normal UI should not expose raw internal IDs. Export files may include an internal update key only when needed for safe update mapping.

Rules:

- If included, name the column clearly, such as `sakuravaUpdateKey`.
- Document that the column is for update matching, not normal editing.
- Do not require users to understand UUIDs or raw IDs for add-only import.
- Do not use hidden columns as a safety mechanism; the user should be able to inspect the file.

### Array and JSON-Like Serialization

CSV should avoid raw JSON where a simpler documented format is safer.

Recommended V1 approach:

- categories: delimiter-separated text labels with escaping rules, or one normalized JSON array string if the preview can explain it clearly;
- aliases: same approach as categories;
- gallery image paths: delimiter-separated path text or normalized JSON array string;
- related references: documented structured text with stable keys where available.

The implementation batch must lock the exact column names and escaping rules before coding.

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

Preferred matching:

- Use stable internal update key only when the file came from a Sakurava export and includes the documented update key.

Fallback matching:

- Videos: title and optional release date/code context.
- Images: title and optional release date/code context.
- Performers: name and optional birth date/debut date context.

Safety rules:

- Avoid accidental overwrite.
- Ambiguous matches must require user review or be rejected.
- Missing matches in update-only mode should be skipped with an error or warning.
- Matching must be shown in preview before apply.
- Add-only import must not update existing records.

## Validation Rules

Validation must be row-level and must produce actionable messages.

Required checks:

- required fields:
  - Video title required for new Video records;
  - Image title required for new Image records;
  - Performer name required for new Performer records.
- duplicate detection:
  - duplicate update keys;
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
- Copy must state that Import/Export is CSV/XLSX data exchange for Videos, Images, and Performers.
- Copy must state that media files are not included.
- Backup/Restore copy must remain full app data safety copy.
- Restore must not be described as Import.
- Export must not be described as Backup.

## Implementation Batch Recommendation

Official roadmap remains unchanged:

```text
34.5 - Appearance + Dark Mode Implementation
```

If the user chooses to implement Import/Export immediately after this plan instead of following the current official roadmap, split implementation into smaller batches:

1. Import/Export V1 Export CSV
   - Export Videos, Images, and Performers to documented CSV files.
   - Include headers and safe serialization.
   - No import behavior.
2. Import/Export V1 Import CSV Preview
   - Parse CSV.
   - Detect entity type.
   - Validate rows.
   - Show preview and report.
   - No apply behavior.
3. Import/Export V1 Apply with Validation
   - Add/update records only after confirmation.
   - Use safe matching rules.
   - Preserve unrelated fields.
   - Produce apply report.
4. XLSX optional follow-up
   - Add XLSX only through the same validation/preview/apply pipeline.
   - Do not fork business rules by file format.

## Not in 34.4

Batch 34.4 does not implement code. It must not:

- modify `src/`;
- modify `src-tauri/`;
- modify package files;
- modify database/schema files;
- modify tests;
- implement Import button behavior;
- implement Export button behavior;
- implement CSV parsing;
- implement XLSX parsing;
- implement file picker behavior;
- implement DB mutations;
- import or export media files;
- change Backup/Restore;
- change Clear Cache;
- implement Dark Mode;
- implement Language;
- implement Category Visibility;
- implement Thumbnail Cache or low-res regeneration.

## Next Batch

Next official batch:

```text
34.5 - Appearance + Dark Mode Implementation
```

