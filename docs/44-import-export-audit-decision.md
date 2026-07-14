# Import / Export Final Product and Format Decision

Status: Batch 41.8.0 final decision. This is a documentation-only batch.

## 1. Executive summary

Sakurava currently has a functional CSV bulk-edit workflow for Videos, Images,
Performers, and Managed Categories. It is not a visual shell: it exports,
previews, validates, confirms, and applies individual CSV rows
(src/pages/SettingsPage.tsx: handleExportCsv, handleImportCsvPreview, and
handleConfirmImportApply; src/lib/exportCsv.ts; src/lib/importCsvPreview.ts;
src/lib/importCsvApply.ts).

The approved future product is one Import / Export system with two equivalent
file representations:

- **XLSX Recommended** — the primary human bulk-edit format.
- **CSV Compatibility** — a compatible text-table format.

They use the same data fields, actions, validation, Preview outcomes, and CRUD
apply behavior. A **data type** means one supported record grouping, such as
Videos; this document avoids the ambiguous user-facing term “domain.”

The initial data types are Videos, Images, Performers, and Managed Categories.
The workflow supports Create, Read/Preview, Update, and explicit Delete. Before
any mutation it must validate, show a summary-first Preview, obtain explicit
confirmation, automatically create a safety backup, revalidate stale Preview
state, and apply atomically. **Atomic** (or transactional) means all approved
changes succeed together, or none are committed; users must never be left with
a half-imported file.

This is Import / Export, not Backup / Recovery. It must not replace the live
database or reuse backup_package_restore as an import operation.

## 2. Existing and verified repository behavior

### Current UI and frontend

Settings has a separate Import / Export card. Import CSV opens a file picker and
produces a preview; Export CSV progressively reveals buttons for Videos, Images,
Performers, and Categories (src/pages/SettingsPage.tsx: Import / Export
SettingsPanelCard and ImportPreviewPanel). The checked Preview Before Apply
switch is visual-only: it has no state or handler, while preview itself is
already mandatory (src/pages/SettingsPage.tsx: ShellToggle beside
settings.importExport.preview).

The current frontend exports all records of one type at a time. It reads one
CSV, lists current records, detects the entity from headers, builds a preview,
and invokes ordinary create/update/delete wrappers on confirmation
(src/pages/SettingsPage.tsx: handleExportCsv, handleImportCsvPreview, and
handleConfirmImportApply).

Existing CSV actions are Auto, Update, Add, Delete, and Skip, with blank
interpreted as Auto (src/lib/importCsvPreview.ts: parseImportAction). The
approved name is now **Create**, replacing the future product/UI use of Add;
existing code remains an audit finding, not a changed runtime contract.

### Current runtime and filesystem behavior

writeExportCsv invokes Rust export_csv_write with a destination path and CSV
text; readImportCsv invokes import_csv_read with a source path
(src/runtime/exportCommands.ts; src/runtime/importCommands.ts;
src-tauri/src/commands.rs: export_csv_write and import_csv_read).

The Tauri dialog helpers choose CSV paths through the save/open dialogs
(src/runtime/dialogCommands.ts: selectExportCsvDestination and
selectImportCsvSource). Rust import checks that an existing path is a CSV file
and reads UTF-8 text. Rust export rejects an empty path or directory and writes
with fs::write; it does not prevent overwrite or prove that a supplied path came
from a picker (src-tauri/src/commands.rs: read_import_csv_file,
validate_import_csv_source, write_export_csv_file, and
validate_export_csv_destination).

### Current validation, matching, and apply behavior

The current CSV schemas use friendly locked headers, Action, and a Sakurava Ref;
they serialize lists as semicolon-separated text and related records as
REF | display (src/lib/exportCsv.ts: entity schemas, sakuravaRef, and
relatedDisplay). The Ref is currently a short hash of the stored ID/key, not the
raw identifier (src/lib/exportCsv.ts: stableRefToken).

Preview checks headers, actions, dates, numeric ratings, paths, duplicate refs
inside the file, categories, and related values. It reports row errors and
warnings (src/lib/importCsvPreview.ts: validateHeaders, previewRow,
validateEditableFields, validateCategories, and validateRelated).
Unknown/ambiguous related references and unknown categories are prevented from
apply (src/lib/importCsvApply.ts: blockingWarningPatterns and rowSafetyIssue).

Updates are partial patches, so fields not represented by a changed CSV header
are preserved (src/lib/importCsvApply.ts: buildPatchFromRow). However, current
empty editable cells can be applied as empty values for a changed row. That is
existing behavior and is superseded by the approved future clear policy below.

Current apply is not atomic: applyImportCsvPreview loops through rows, performs
one normal mutation at a time, catches row failures, and reports the mixture.
Category rows are similarly applied parent-first (src/lib/importCsvApply.ts:
applyImportCsvPreview, applyRow, and applyCategoryRows). The UI only advises the
user to create a backup; it does not create one automatically
(src/pages/SettingsPage.tsx: ImportApplyConfirmPanel, near “Create a Backup
Database before applying imports”).

### Existing tests

- src/lib/exportCsv.test.ts covers four entity schemas, escaping, friendly
  headers, refs, dates, lists, paths, related values, and categories.
- src/lib/importCsvPreview.test.ts covers parsing, headers, actions,
  date/rating validation, classifications, categories, relations, and
  non-mutating preview.
- src/lib/importCsvApply.test.ts covers confirmation, row outcomes, blocked
  rows, removal behavior, no media mutation, and Managed Category hierarchy.
- src/App.test.tsx covers progressive disclosure, Video preview/apply/report,
  category consistency, and Video/Category export.
- src/runtime/exportCommands.test.ts covers current local timestamp naming.
- src-tauri/src/commands.rs tests near export_csv_write_* and import_csv_read_*
  cover filesystem validation and read/write behavior.

## 3. Import / Export boundary

### Existing and verified

Backup / Recovery is internal full-state recovery. Its package flow validates,
previews, confirms, creates safety material, and can replace database state.
Catalog CSV is record exchange. Prior architecture explicitly separates them
(docs/43-settings-architecture-decision.md: Import rules and risk table;
docs/40-import-export-bulk-data-plan.md: boundary and safety sections).

### Approved future product decision

Import / Export is selected record exchange and migration. It may create,
update, or explicitly delete supported records, but it must never directly
replace the live database. It must not reuse backup_package_restore as an
import mechanism. Its mandatory automatic safety backup uses the established
Backup / Recovery capability solely as a recovery artifact, not as import
transport.

## 4. Approved file and format contract

A **format contract** is the versioned agreement describing which sheets,
columns, identifiers, actions, and values Sakurava reads and writes. A
**round-trip** means exporting data, editing it, and safely importing it back.

| Item | Approved decision |
| --- | --- |
| Primary format | **XLSX Recommended** |
| Compatibility format | **CSV Compatibility** |
| Meaning | Same fields, Action behavior, validation, Preview results, and CRUD apply for both formats |
| Unsupported in Batch 41.8 | ODS, legacy XLS, HTML tables, JSON exchange, ZIP/archive formats, and other formats |
| Data types | Videos, Images, Performers, Managed Categories |
| Record Categories | Embedded record fields where currently applicable; categoriesJson remains the storage model |
| Required contract metadata | Explicit format/version marker appropriate to the representation |
| Required headers/fields | Missing required headers are blocking errors |
| Optional headers/fields | Missing optional headers are tolerated with clear warnings where appropriate |

Current CSV has an implicit Sakurava contract through its locked headers but no
explicit format/version marker (src/lib/exportCsv.ts: schemas;
src/lib/importCsvPreview.ts: detectCsvEntity). The explicit marker is an
approved future requirement, not current behavior.

### File naming

All exports use exactly:

~~~
skv-<type>-<YYYYDDMM>-<HHmmss>.<format>
~~~

Examples:

~~~
skv-vid-20261407-053825.csv
skv-vid-20261407-053825.xlsx
skv-per-20261407-053825.xlsx
~~~

Type codes are vid Videos, img Images, per Performers, cat Managed Categories,
and all multiple/all supported data types. Timestamp components use the local
date and time of the computer performing the export. Existing CSV naming already
follows the YYYYDDMM-HHmmss local timestamp pattern
(src/runtime/exportCommands.ts: defaultExportCsvFileName and
localFileTimestamp); XLSX and multi-type naming are approved future behavior.

## 5. Approved XLSX design

XLSX is the primary human bulk-edit format.

For an empty single-type template, the workbook contains:

1. **Instructions** — concise Auto/Create/Update/Delete/Skip guidance,
   required versus optional fields, local date/time conventions, how to clear a
   value, and fields users must not edit.
2. **Data** — the real editable table, with no dummy/example rows. Action
   defaults to Auto. Where practical, it uses dropdown validation, real
   spreadsheet date cells/formatting, text identifiers, and visibly
   distinguished or protected internal/read-only fields.
3. **Examples** — safe clearly labelled example rows, never read by the
   importer.

For multi-type XLSX export, produce one skv-all workbook with an Instructions
sheet and separate Videos, Images, Performers, and Managed Categories sheets.
Real Data sheets never contain dummy records.

If a selected data type has no records, do not present normal data export.
Offer **Download Template** instead, explicitly for creating or bulk entering
new data.

## 6. Approved CSV design

CSV remains the compatible text-table representation of the same contract.

An empty CSV template contains headers only, with no dummy data. Sakurava UI
provides editing guidance; examples are separate if needed. CSV does not promise
dropdowns, protected cells, multiple sheets, or spreadsheet styling.

One selected type exports one CSV file. Multiple selected types export one
folder containing one CSV per data type. Empty selected data types use Download
Template rather than a normal data export.

## 7. Approved data types, fields, and media policy

| Data type | Existing support | Approved initial support | Identity and relationships |
| --- | --- | --- | --- |
| Videos | CSV import/export | XLSX and CSV | Stable text identifier; Record Categories; related Performers and Images |
| Images | CSV import/export | XLSX and CSV | Stable text identifier; Record Categories; related Performers and Videos |
| Performers | CSV import/export | XLSX and CSV | Stable text identifier; manual aliases; Record Categories; related Videos and Images |
| Managed Categories | CSV import/export | XLSX and CSV | Stable text identifier; parent/category metadata |
| Record Categories | Embedded fields | Embedded fields only | Text labels in categoriesJson; not a separate data type |

A **stable identifier** is an opaque text value used to identify an existing
record across an export/import cycle. Names are labels for people; they are not
identity. A matching title, performer name, or category name must not
automatically merge or overwrite a record. The current short hashed Sakurava Ref
is the verified baseline; the final contract must provide stable text
identifiers with collision detection and versioned semantics.

Deferred data types are Glossary, Credits/roles, Settings/preferences,
media-root configuration, original media files, and app-managed assets. Credits
and roles remain deferred because their multiple-row identity and
work/performer dependencies require a dedicated design
(docs/43-settings-architecture-decision.md: Credit and performer rules).

Imported/exported data must not cause arbitrary local path mutation. No media
file, cover/gallery/thumbnail byte, cache, or app-managed asset is copied,
moved, renamed, rewritten, or deleted. Path text may be represented only under
the future contract’s validated policy; it never grants filesystem authority.
This finalizes the portable path safety decision while leaving exact column
presentation to implementation.

## 8. Approved Action model and matching rules

The supported actions are Auto, Create, Update, Delete, and Skip. Auto is the
default and recommended action. Delete is always explicit and must be clearly
highlighted in Preview and confirmation.

| Action / situation | Technical result | Plain-language explanation |
| --- | --- | --- |
| Auto + blank/missing identifier + valid data | Create | Make a new record. |
| Auto + known identifier + changed values | Update | Change that existing record. |
| Auto + known identifier + no changed values | Skip | Nothing needs changing. |
| Auto + unknown supplied identifier | Needs Attention | Sakurava cannot safely decide which record you meant. |
| Create + existing identifier | Needs Attention | Creating would duplicate an existing record. |
| Update + unknown identifier | Needs Attention | There is no matching record to update. |
| Delete + unknown identifier | Needs Attention | There is no matching record to delete. |
| Skip | No mutation | Leave this row alone. |
| Row absent from edited file | No mutation | Absence is never Delete. |

Needs Attention is a blocking Preview status, with a technical reason and a
plain-language explanation. There is no silent overwrite, automatic name merge,
or automatic related-record creation. Duplicate identifiers, ambiguous related
references, and stale Preview conflicts block final apply. Required headers are
blocking; optional missing headers warn where the contract permits them.

## 9. Approved date, time, number, and locale policy

The primary workflow assumes a Sakurava export is edited and re-imported on the
same computer.

- Export dates and times follow that computer’s regional settings and local time
  zone where applicable.
- CSV delimiters and decimal formatting align with local computer settings where
  practical.
- Import first interprets date/time and decimal values using the current
  computer’s regional settings.
- Import also accepts YYYY-MM-DD as a stable date fallback.
- Values such as 1/2/2026 are interpreted using the current computer’s local
  format, not rejected merely because another locale could read them differently.
- Impossible or unsupported values are rejected.

Plain-language rule: Sakurava and Excel on the same computer should read dates
using the same local format. Cross-device locale handling is an edge case, not
the initial product priority. This replaces the current CSV-only strict
YYYY-MM-DD import validation (src/lib/importCsvPreview.ts: isValidDateOnly),
which remains existing behavior until Batch 41.8.2 changes the parser.

## 10. Approved update and clear policy

For Update, an empty editable cell means **leave the current value unchanged**.
It must never silently erase existing data. Clearing an existing value requires
an explicit clear instruction. This behavior is approved.

The exact clear marker or spreadsheet control syntax is a **deferred
implementation detail** for Batch 41.8.2. It must be shared by XLSX and CSV,
explained in Instructions/How to Edit, previewed as a clear, and tested. The
current empty-cell apply behavior is not approval for the future contract.

## 11. Approved import flow and safety

The required flow is:

~~~
choose file → validate → summary Preview → review issues/changes
→ explicit confirmation → automatic safety backup → revalidate → apply → result
~~~

Preview is read-only. It must show a summary first:

- total records;
- Create count;
- Update count;
- Delete count;
- Skip count;
- Needs Attention count.

The initial review must not show a full raw table by default. Its levels are:

1. Summary counts and readiness.
2. Review Issues or Review Changes table.
3. Selected-record field comparison and optional original source row.

The main review table focuses on Status, Record, Action, Changes, and Issue.
Raw CSV/XLSX content is secondary detail. If blocking issues exist, Needs
Attention opens or is prioritized and final apply is disabled.

Automatic safety backup is mandatory before every mutating import. Apply must
run inside one database transaction with in-transaction revalidation of
identifiers, relationships, category constraints, and Preview freshness. If any
approved operation fails, cancel/roll back all operations from that import and
report the cause. The safety backup supports recovery but is not an alternate
apply path. The existing frontend per-row partial-success behavior is therefore
not the approved final implementation.

## 12. Approved export and import UX

### Export

The future UI lets the user select one or more supported data types, choose
**XLSX Recommended** or **CSV Compatibility**, then use one primary Export
action and one trusted destination picker. It does not add unnecessary
format/scope wizard steps.

- XLSX: one type creates one workbook; multiple types create one multi-sheet
  workbook.
- CSV: one type creates one CSV; multiple types create one folder containing
  multiple CSV files.
- A type with no records offers Download Template, not normal data export.

### Import

The user chooses or drops an XLSX/CSV file first. Sakurava identifies its
contained data type or workbook sheets; it does not require manual type
selection before a valid Sakurava file is chosen. No empty Preview table appears
before file selection. The UI then presents summary first, detailed tables on
request or when issues need attention, Download Template, and How to Edit
guidance.

## 13. Existing safety mechanisms and final gaps

Existing mechanisms include picker use, CSV file checks, preview before apply,
confirmation, validation, row reports, partial patches, explicit Delete,
category deletion checks, and no media-byte operations
(src/runtime/dialogCommands.ts; src/lib/importCsvPreview.ts;
src/lib/importCsvApply.ts).

Approved implementation must close these gaps:

1. XLSX support and a shared XLSX/CSV normalized model.
2. Explicit format/version metadata and stable identifier collision handling.
3. Local-format date/time/number parsing.
4. Summary-first Preview and stale-Preview revalidation.
5. Explicit clear behavior.
6. Automatic safety backup.
7. A purpose-built runtime apply contract with atomic transaction and rollback.
8. No-silent-overwrite export write behavior and validated picker authority.
9. Bounded parsing, structured errors, and comprehensive round-trip coverage.

No schema or migration is required for the initial four data types. No new
schema is authorized by this decision.

## 14. Final Batch 41.8 sequence

### 41.8.0 — Final Product and Format Decision

Purpose: lock the XLSX-first/CSV-compatible product, safety, UX, data-type, and
format decisions. Exact scope: this document and audit preservation. Risk: low.
Required tests: git diff --check and document whitespace review. Non-goals:
production code, runtime contracts, schema/migrations, dependencies, or
Backup/Recovery changes.

### 41.8.1 — XLSX/CSV Export Contract and Templates

Purpose: build a single export contract represented as XLSX Recommended and CSV
Compatibility. Exact scope: format/version markers, file naming, one/multi-type
exports, empty templates, XLSX Instructions/Data/Examples sheets, CSV templates,
field mappings, and trusted destinations. Risk: medium. Required tests: contract
snapshots, filenames, empty/template behavior, all type/sheet/folder layouts,
local formatting, and no overwrite/path mutation. Non-goals: import parsing,
apply, media bytes, extra formats, schema/migrations.

### 41.8.2 — XLSX/CSV Parser and Summary Preview

Purpose: normalize both representations into one validation and summary-preview
pipeline. Exact scope: format/version detection, locale-aware values with
YYYY-MM-DD fallback, required/optional headers, stable identifiers, Action
classification, explicit-clear marker, limits, issues, changes, and stale token.
Risk: high. Required tests: both formats produce identical normalized outcomes;
invalid/version/locale/duplicate/conflict/clear cases; all four data types;
Preview non-mutation; accessibility state coverage. Non-goals: mutations,
safety-backup creation, media operations, schema/migrations.

### 41.8.3 — CRUD Import Apply and Safety

Purpose: apply approved Create/Update/Delete operations safely. Exact scope:
automatic safety backup, revalidation, one reviewed runtime command,
transactional apply/rollback, structured results, and explicit Delete
confirmation. Risk: high. Required tests: transaction success, failure-after-N
rollback, safety-backup failure, stale conflicts, category/relationship
constraints, no path/media mutation, and UI contract tests. Non-goals: database
replacement, Backup restore reuse, extra data types/formats, migrations.

### 41.8.4 — Import / Export Product UI

Purpose: implement the approved compact, summary-first UI. Exact scope: file
drop/choose, type detection, Recommended/Compatibility chooser, template/How to
Edit, progressive review, issues/changes/field detail, confirmations, and
friendly localized result states. Risk: medium. Required tests: state
transitions, cancellation, issue prioritization, apply disabled, delete
highlighting, accessibility, and all type/format user flows. Non-goals: new
runtime semantics, visual polish unrelated to usability/accessibility, extra
formats/data types.

### 41.8.5 — Excel and CSV Round-trip Hardening

Purpose: prove same-computer Excel/CSV reliability and defensive behavior.
Exact scope: round-trip fixtures, regional date/time/decimal cases, workbook
protection/validation behavior where supported, compatibility/error messages,
large-file bounds, and regression hardening. Risk: medium/high. Required tests:
Windows locale-aware fixtures, XLSX/CSV parity, cross-type workbooks, empty
templates, explicit clears, conflict/rollback, and path/media safety. Non-goals:
cross-device locale guarantees, ODS/XLS/HTML, archive dependencies, new data
types, or schema changes.

## 15. Resolved decisions and deferred implementation details

### Resolved product decisions

- Initial Delete support is included, explicit only.
- Safety backup is mandatory and automatic.
- Imported/exported data cannot cause arbitrary local path mutation.
- Stable text identifiers determine existing records; names are labels, not
  identity.
- Missing optional headers warn where appropriate; missing required headers
  block.
- Initial formats are XLSX Recommended and CSV Compatibility.
- Auto is the default action; a missing source row is never Delete.
- Initial import supports full CRUD with mandatory preview, confirmation,
  revalidation, and atomic apply.

### Deferred implementation details

- Exact clear-value marker/control shared by XLSX and CSV.
- Exact XLSX library/dependency selection.
- Precise locale helper implementation.
- UI visual details reserved for Batch 41.8.4.

## 16. Explicit non-goals

- No production behavior change in Batch 41.8.0.
- No runtime contract change, schema/migration, or dependency in this batch.
- No Backup/Recovery semantic change or database replacement through Import.
- No ODS, legacy XLS, HTML table, JSON exchange, ZIP/archive, or additional
  format work for Batch 41.8.
- No media copy, move, rename, rewrite, deletion, cache exchange, or arbitrary
  filesystem mutation from imported values.
- No Glossary, Credits/roles, Settings/preferences, media-root configuration,
  original media files, or app-managed asset import/export.
- No unrelated Settings, Batch 39, or Batch 40 changes.
- No commit or amend.
