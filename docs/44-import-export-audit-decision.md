# Import / Export Final Product and Format Decision

Status: Batch 41.8.2 implemented integrity and safety decision. Batch 41.8.1 is merged.

## 1. Executive summary

Sakurava now has a shared XLSX/CSV bulk-edit workflow for Videos, Images,
Performers, Managed Categories, and Glossary. It exports a canonical field
contract, validates a normalized immutable operation plan, confirms it, and
applies the whole plan through one safety-backed transaction
(src/pages/SettingsPage.tsx: handleImportCatalogPreview and
handleConfirmImportApply; src/lib/importOperationPlan.ts;
src-tauri/src/commands.rs: import_catalog_apply).

The approved product is one Import / Export system with two equivalent
file representations:

- **XLSX Recommended** — the primary human bulk-edit format.
- **CSV Compatibility** — a compatible text-table format.

They use the same data fields, actions, validation, Preview outcomes, and CRUD
apply behavior. A **data type** means one supported record grouping, such as
Videos; this document avoids the ambiguous user-facing term “domain.”

The supported data types are Videos, Images, Performers, Managed Categories,
and Glossary.
The workflow supports Create, Read/Preview, Update, and explicit Delete. Before
any mutation it validates, shows a summary-first Preview, obtains explicit
confirmation, revalidates stale Preview state, automatically creates a safety
backup, and applies atomically. **Atomic** (or transactional) means all approved
changes succeed together, or none are committed; users must never be left with
a half-imported file.

This is Import / Export, not Backup / Recovery. It must not replace the live
database or reuse backup_package_restore as an import operation.

### Implemented 41.8.2 safety boundary

**Versioned XLSX contract:** `src/lib/importExportContract.ts` defines
application ID `app.sakurava.desktop`, import contract version `1`, export
format version `1`, and workbook type. `buildXlsxWorkbook` writes these fields,
the generation timestamp, and included data types as deterministic JSON in the
very-hidden `__SakuravaMetadata` sheet. `buildXlsxCatalogPreview` validates that
metadata, declared/actual sheets, duplicate sheets, and malformed/formula-error
cells before Preview. Tests verify the very-hidden sheet and deterministic
version survive ExcelJS write, user edits to Data, save, and read-back. Missing
metadata produces an explicit legacy-sheet warning; malformed, exposed, or
unsupported metadata blocks Apply (`src/lib/exportWorkbook.ts`;
`src/lib/importCatalog.ts`).

**CSV compatibility policy:** CSV remains an ordinary UTF-8 table without a
nonstandard comment preamble. Import infers the version-1 compatibility
contract only from one supported canonical header set; a filename is never
sufficient proof. Missing required, duplicate, renamed/unsupported headers and
duplicate record identifiers block Apply. Missing optional headers warn
(`validateHeaders` and `findDuplicateRefs` in
`src/lib/importCsvPreview.ts`).

**Explicit clear decision:** the exact case-sensitive token is
`[[SAKURAVA:CLEAR:v1]]`. It is namespaced and versioned to avoid reasonable
user-data collisions. Blank Update cells mean unchanged. The exact token clears
only a nullable editable field marked `clearable` by the canonical contract;
required fields, Action, and Sakurava Ref reject it. Near-marker literal text is
preserved. Preview records “value will be cleared,” and Apply receives the same
normalized empty/null operation (`CsvSchemaColumn.clearable`, `previewRow`, and
`buildNormalizedImportPatch`).

**Immutable Preview plan and stale protection:** `buildImportOperationPlan`
stores source row, section, resolved action, stable identifier, current record,
normalized proposed values, field differences, clear fields, warnings/issues,
dependencies, the trusted catalog context, a source-file fingerprint, and a
deterministic operation fingerprint (`src/lib/importOperationPlan.ts`).
Immediately before mutation, `apply_import_catalog_plan` verifies both signed
fingerprints and re-reads the catalog under the database lock. Stale comparison
projects only affected records, referenced records, connected Glossary
parents/children, and records or Credits that determine category Delete
eligibility. Unrelated catalog and Credit changes do not invalidate Preview.
Relevant changes return `stalePreview` and create neither a backup nor a
mutation (`import_revalidation_snapshot` in `src-tauri/src/commands.rs`).

**Safety backup, atomic Apply, and rollback:** the runtime reuses the existing
Safety package writer through `create_import_safety_backup_package`; it does not
reuse Restore as Import (`src-tauri/src/database.rs`). Only after revalidation
and successful backup does the runtime open one SQLite transaction. All creates,
updates, explicit clears, and deletes commit together; any failure rolls back
and reports zero applied counts. `ImportCatalogApplyResult` returns
committed/blocked/rolled-back status, a safe backup package name, exact counts,
failure stage, user message, and rollback state without SQL, paths, or stack
traces (`src-tauri/src/commands.rs`; `src/runtime/importCommands.ts`).

**Same-file Glossary parents:** new Glossary rows may declare a unique temporary
identifier shaped `GLO-NEW-...`, and another row may use it in Parent Ref.
Preview blocks missing, duplicate, self, circular, and delete-conflicting
parents. The uppercase namespace is reserved for temporary Create references,
cannot collide with an existing permanent ID, is never emitted by export, and
is never persisted. Apply topologically creates parents and substitutes
generated permanent database IDs before children. Names never determine identity
(`validateGlossaryDependencies`; `apply_import_operations`). Other catalog
relationships still require existing stable identifiers.

## 2. Existing and verified repository behavior

### Current UI and frontend

Settings has a compact Idle/Import/Export card. Import accepts trusted CSV/XLSX
selection, then shows file metadata and the bounded summary Preview. Export
selects any of the five supported data types, XLSX/CSV, and data/template mode
(`ImportExportPanel` and `CompactImportPreviewPanel` in
`src/pages/SettingsPage.tsx`). Preview is mandatory and no empty table is shown
before file selection.

The frontend loads one catalog snapshot while parsing, builds one normalized
plan, and retains that exact plan through confirmation. It no longer invokes
ordinary row-by-row CRUD wrappers (`handleImportCatalogPreview`,
`handleRequestImportApply`, and `handleConfirmImportApply`). Actions are Auto,
Create, Update, Delete, and Skip; blank Action is Auto
(`parseImportAction` in `src/lib/importCsvPreview.ts`).

### Current runtime and filesystem behavior

Trusted Tauri dialogs select CSV/XLSX sources and single-file or folder export
destinations. `import_catalog_file_read` accepts only existing `.csv`/`.xlsx`
files chosen by the picker; export writers validate extensions and reject
existing destinations rather than silently overwrite
(`src/runtime/dialogCommands.ts`; `src/runtime/catalogExport.ts`;
`src-tauri/src/commands.rs`: import/export validation helpers).

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

Updates are partial patches: blank cells and absent optional headers preserve
current fields; the exact clear token is the only clearing instruction
(`previewRow` and `buildNormalizedImportPatch`). Apply is atomic and uses the
existing Safety package system before opening its transaction
(`apply_import_catalog_plan` and `create_import_safety_backup_package`).

### Existing tests

- src/lib/exportCsv.test.ts covers five entity schemas, escaping, friendly
  headers, refs, dates, lists, paths, related values, and categories.
- src/lib/importCsvPreview.test.ts covers parsing, headers, actions,
  date/rating validation, classifications, categories, relations, and
  non-mutating preview.
- src/lib/importCsvApply.test.ts covers confirmation, row outcomes, blocked
  rows, removal behavior, no media mutation, and Managed Category hierarchy
  constraints.
- src/lib/importCatalog.test.ts and src/lib/importOperationPlan.test.ts cover
  XLSX metadata/sheets/cells, CSV compatibility, Glossary dependencies, clears,
  and deterministic plans.
- src/App.test.tsx covers the Idle/Import/Export workflow, Preview controls,
  confirmation, and supported exports.
- src/runtime/exportCommands.test.ts covers current local timestamp naming.
- src-tauri/src/commands.rs tests prove stale Preview creates no backup,
  operation failure rolls back earlier changes, and same-file Glossary
  parent/child creation commits together.

## 3. Import / Export boundary

### Existing and verified

Backup / Recovery is internal full-state recovery. Its package flow validates,
previews, confirms, creates safety material, and can replace database state.
Catalog CSV is record exchange. Prior architecture explicitly separates them
(docs/43-settings-architecture-decision.md: Import rules and risk table;
docs/40-import-export-bulk-data-plan.md: boundary and safety sections).

### Approved and implemented product boundary

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
| Data types | Videos, Images, Performers, Managed Categories, Glossary |
| Record Categories | Embedded record fields where currently applicable; categoriesJson remains the storage model |
| Required contract metadata | Explicit format/version marker appropriate to the representation |
| Required headers/fields | Missing required headers are blocking errors |
| Optional headers/fields | Missing optional headers are tolerated with clear warnings where appropriate |

CSV deliberately uses version-1 compatibility inference through its exact
locked headers rather than a nonstandard preamble. XLSX carries the explicit
machine-readable metadata marker (`src/lib/importExportContract.ts`;
`src/lib/importCatalog.ts: readWorkbookMetadata`).

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
glo Glossary, and all multiple/all supported data types. Timestamp components
use the local date and time of the computer performing the export. XLSX and CSV,
including multi-file CSV, use one operation timestamp
(`src/lib/exportArtifacts.ts`; `src/runtime/catalogExport.ts`).

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
sheet and separate Videos, Images, Performers, Managed Categories, and Glossary
sheets.
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
| Glossary | XLSX/CSV import/export | XLSX and CSV | Stable GLO identifier; dependency-aware parent references |
| Record Categories | Embedded fields | Embedded fields only | Text labels in categoriesJson; not a separate data type |

A **stable identifier** is an opaque text value used to identify an existing
record across an export/import cycle. Names are labels for people; they are not
identity. A matching title, performer name, or category name must not
automatically merge or overwrite a record. Contract version 1 retains the short
hashed Sakurava Ref baseline and blocks duplicate/colliding visible identifiers
both in the source file and in the current catalog (`findDuplicateRefs`;
`buildCurrentRowsByRef`). A different identifier representation would require a
later contract version to preserve round trips.

Deferred data types are Credits/roles, Settings/preferences,
media-root configuration, original media files, and app-managed assets. Credits
and roles remain deferred because their multiple-row identity and
work/performer dependencies require a dedicated design
(docs/43-settings-architecture-decision.md: Credit and performer rules).

Imported/exported data must not cause arbitrary local path mutation. No media
file, cover/gallery/thumbnail byte, cache, or app-managed asset is copied,
moved, renamed, rewritten, or deleted. Path text is represented only under the
versioned contract’s validated policy; it never grants filesystem authority.
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
the initial product priority. `src/lib/importDate.ts` now normalizes local
numeric dates, valid XLSX date cells and serials, and the stable YYYY-MM-DD
fallback without a UTC calendar-day shift.

## 10. Approved update and clear policy

For Update, an empty editable cell means **leave the current value unchanged**.
It must never silently erase existing data. Clearing an existing value requires
an explicit clear instruction. This behavior is approved.

The exact clear marker is implemented as `[[SAKURAVA:CLEAR:v1]]` and shared by
XLSX and CSV. It is explained in XLSX Instructions, previewed as a field clear,
and tested. Blank Update cells remain unchanged.

## 11. Approved import flow and safety

The required flow is:

~~~
choose file → validate → summary Preview → review issues/changes
→ explicit confirmation → revalidate → automatic safety backup → apply → result
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

The main review table focuses on Row, Section, Record, Action, Details, and
Status.
Raw CSV/XLSX content is secondary detail. If blocking issues exist, Needs
Attention opens or is prioritized and final apply is disabled.

Automatic safety backup is mandatory before every mutating import. Preview
freshness and affected references are revalidated under the database lock
before backup. Apply then runs inside one database transaction, where existing
CRUD constraints revalidate identifiers, relationships, and delete eligibility.
If any approved operation fails, cancel/roll back all operations from that import and
report the cause. The safety backup supports recovery but is not an alternate
apply path. The former frontend per-row partial-success path remains only as a
legacy unit-tested helper and is no longer called by Settings Apply.

## 12. Approved export and import UX

### Export

The UI lets the user select one or more supported data types, choose
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

## 13. Existing safety mechanisms and remaining hardening

Implemented mechanisms include trusted selection, XLSX/CSV contract validation,
locale date parsing, summary Preview, immutable operation plans, explicit clear,
stale revalidation, automatic Safety packages, atomic apply/rollback, structured
results, no-silent-overwrite export, explicit Delete, hierarchy checks, and no
media-byte operations. Remaining hardening is larger-file bounds, broader real
Excel/locale fixtures, and selected-row field comparison presentation.

No schema or migration is required for the five supported data types. No new
schema is authorized by this decision.

## 14. Final Batch 41.8 sequence

### 41.8.0 — Final Product and Format Decision

Purpose: lock the XLSX-first/CSV-compatible product, safety, UX, data-type, and
format decisions. Exact scope: this document and audit preservation. Risk: low.
Required tests: git diff --check and document whitespace review. Non-goals:
production code, runtime contracts, schema/migrations, dependencies, or
Backup/Recovery changes.

### 41.8.1 — XLSX/CSV Catalog Workflows

Purpose: build the shared XLSX Recommended/CSV Compatibility catalog workflow.
Exact scope: canonical fields, file naming, one/multi-type exports, templates,
trusted destinations, locale-aware CSV/XLSX parsing, five-data-type Preview,
and the compact Idle/Import/Export UI. Risk: medium/high. Required tests:
contract parity, filenames, sheets/folders, templates, locale parsing, Preview
actions, workflow states, and no overwrite/path mutation. Non-goals: immutable
operation plans, stale revalidation, automatic import safety backup, atomic
apply, media bytes, extra formats, or schema/migrations.

### 41.8.2 — Import Integrity and Safety

Purpose: make Preview and Apply one deterministic safety boundary. Exact scope:
versioned XLSX metadata, exact-header CSV compatibility, explicit clear,
immutable normalized operation and source-file fingerprints, same-file Glossary
dependencies, dependency-scoped stale revalidation, automatic Safety package,
one SQLite transaction, rollback, and structured results. Risk: high. Required tests: corrupt contracts/headers/cells,
clear semantics, dependency graphs, stale state, backup ordering, commit and
rollback, exact counts, and all five data types. Non-goals: schema changes,
media transfer, Backup/Restore redesign, or additional formats.

### 41.8.3 — Import Review and Round-trip Hardening

Purpose: harden review detail and real Excel/CSV round trips around the completed
safety core. Exact scope: selected-row before/after comparison, expanded locale
fixtures, compatibility fixtures from released 41.8.1 exports, accessible
failure/re-review affordances, and disposable-catalog manual verification. Risk:
medium. Required tests: XLSX/CSV parity, locale/date/decimal edge cases, clear
display, stale re-review, and structured failure copy. Non-goals: a second
apply/backup system, new formats, schema changes, or media transfer.

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

- Broader cross-device locale/Excel compatibility fixtures.
- Selected-row comparison presentation and final visual details.
- Any temporary-reference model beyond Glossary requires a separate
  relationship decision.

## 16. Explicit non-goals

- No schema/migration or new dependency in Batch 41.8.2.
- No Backup/Recovery semantic change or database replacement through Import.
- No ODS, legacy XLS, HTML table, JSON exchange, ZIP/archive, or additional
  format work for Batch 41.8.
- No media copy, move, rename, rewrite, deletion, cache exchange, or arbitrary
  filesystem mutation from imported values.
- No Credits/roles, Settings/preferences, media-root configuration,
  original media files, or app-managed asset import/export.
- No unrelated Settings, Batch 39, or Batch 40 changes.
- No commit or amend.
