# Import / Export Final Product and Format Decision

Status: Batch 41.8.4A public Sakurava Ref migration and contract v3 implemented.
The dependency-resolution and unified Attention workflow remains deferred to
Batch 41.8.4B.

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

### Implemented 41.8.2 safety boundary and 41.8.3 final hardening

**Versioned XLSX contract:** `src/lib/importExportContract.ts` defines
application ID `app.sakurava.desktop`, current import contract version `2`,
current export format version `2`, and workbook type. Versions 1 and 2 remain
accepted on import. `buildXlsxWorkbook` writes these fields,
the generation timestamp, and included data types as deterministic JSON in the
very-hidden `__SakuravaMetadata` sheet. `buildXlsxCatalogPreview` validates that
metadata, declared/actual sheets, duplicate sheets, and malformed/formula-error
cells before Preview. Tests verify the very-hidden sheet and deterministic
version survive ExcelJS write, user edits to Data, save, and read-back. Missing
metadata produces an explicit legacy-sheet warning; malformed, exposed, or
unsupported metadata blocks Apply (`src/lib/exportWorkbook.ts`;
`src/lib/importCatalog.ts`).

**CSV compatibility policy:** CSV remains an ordinary UTF-8 table without a
nonstandard comment preamble. Import infers the contract only from one supported
canonical header set; a filename is never sufficient proof. Current v3 headers
exclude internal filesystem paths. Exact v1 columns remain accepted for safe
round trips from already released exports, but new exports never emit them.
Missing required, duplicate, renamed/unsupported headers and duplicate record
identifiers block Apply. Missing optional headers warn (`validateHeaders` and
`findDuplicateRefs` in `src/lib/importCsvPreview.ts`; `importSchemaFor` in
`src/lib/exportCsv.ts`).

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

**Deterministic plans and canonical values:** blank-ID Creates now receive a
source identity derived only from source fingerprint, section, sheet/file, and
row. Fingerprints exclude translated Details, warnings, runtime timestamps,
field presentation order, and generated permanent IDs. JavaScript contract keys
use the same code-unit ordering as Rust, removing the cross-language false
“reviewed import plan changed” result. Boolean case, supported enum case,
equivalent numeric/date forms, normalized line endings, and stable relationship
references are canonicalized before comparison, difference generation,
fingerprinting, and Apply (`canonicalCellForComparison` in
`src/lib/importCsvPreview.ts`; `importPlanFingerprintPayload` in
`src/lib/importOperationPlan.ts`; `import_plan_fingerprint` in
`src-tauri/src/commands.rs`).

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

CSV deliberately uses exact canonical-header compatibility inference rather
than a nonstandard preamble. v1 and v2 header sets remain distinguishable and
supported. XLSX carries the explicit
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

Current workbooks use one human-readable header row in canonical form order,
frozen headers, filters, restrained Sakurava header styling, practical widths,
wrapped multiline fields, text-safe identifiers/references, real date cells,
Action validation, and safe enum/boolean dropdowns. Header notes distinguish
required, editable, and read-only identity columns. `__SakuravaMetadata` remains
very-hidden and Examples remain isolated (`configureDataSheet` and
`addMetadataSheet` in `src/lib/exportWorkbook.ts`).

If a selected data type has no records, do not present normal data export.
The integrated **Export as template** option creates the template explicitly
for new or bulk-entered data.

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

### Final editable-field coverage matrix

The v2 column order is Action, stable Sakurava Ref, required/core form fields,
relationship fields, then optional/detail fields. Each field below is exported,
parsed through the same canonical schema, included in Preview differences,
applied by the normalized operation plan, and exported again with the same
meaning (`src/lib/exportCsv.ts`: five `*CsvSchema` constants;
`src/lib/importCsvPreview.ts`; `src/lib/importCsvApply.ts`;
`src/lib/exportCsv.test.ts`: editable-field coverage test).

| Data type | Persisted user-editable fields covered by v2 | Relationship representation | Explicit clear |
| --- | --- | --- | --- |
| Videos | Title, Original Title, Code, Favorite, Availability, Censorship, Release Date, Publisher/Label, Duration, Resolution, File Size, File Type, Source Links, six ratings, Notes | Record Categories, related Performers, related Images use labels/stable refs | Optional text/date/number/list/rating fields only; required Title and booleans reject clear |
| Images | Title, Original Title, Code, Favorite, Availability, Censorship, Release Date, Publisher/Label, Image Count, Main Resolution, Total File Size, Main File Type, Source Links, six ratings, Notes | Record Categories, related Performers, related Videos use labels/stable refs | Optional text/date/number/list/rating fields only; required Title and booleans reject clear |
| Performers | Name, Original Name, Aliases, Favorite, Gender, Birth/Debut/Retired Dates, Birthplace, Nationality, Blood Type, Height, Weight, Measurements, Cup Size, Source Links, six ratings, Notes | Record Categories, related Videos, related Images use labels/stable refs | Optional text/date/number/list/rating fields only; required Name and Favorite reject clear |
| Managed Categories | Category Name, Parent Ref, Description, Show in Videos, Show in Images, Show in Performers, Show in Credits | Parent uses stable CAT Ref; display name is never identity | Parent/Description may clear; required Name and booleans reject clear |
| Glossary | Term, Definition, Parent Ref, Synonyms, Category, Favorite, Source Title, Source URL | Existing stable GLO Ref or reserved same-file GLO-NEW reference | Optional parent/list/text fields may clear; required Term/Definition and Favorite reject clear |

Generated identifiers and timestamps, Performer derived status/counts, UI-only
state, database/runtime state, internal media/cover/folder/gallery/thumbnail
paths, original media bytes, and computed statistics are excluded. Performer
status is derived from persisted date fields during Apply. v1 path columns are
accepted solely for compatibility and do not grant filesystem authority.

A **stable identifier** is an opaque text value used to identify an existing
record across an export/import cycle. Names are labels for people; they are not
identity. A matching title, performer name, or category name must not
automatically merge or overwrite a record. Contract versions 1 and 2 retain the
short hashed Sakurava Ref baseline and block duplicate/colliding visible identifiers
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
moved, renamed, rewritten, or deleted. Current v3 exports exclude internal path
columns entirely. Exact v1 path columns remain readable only for compatibility
and are treated as record text, never as filesystem authority.

## 8. Approved Action model and matching rules

The supported actions are Auto, Create, Update, Delete, and Skip. Auto is the
default and recommended action. Delete is always explicit and must be clearly
highlighted in Preview and confirmation.

| Action / situation | Technical result | Plain-language explanation |
| --- | --- | --- |
| Auto + blank/missing identifier + valid data | Create | Make a new record. |
| Auto + known identifier + changed values | Update | Change that existing record. |
| Auto + known identifier + no changed values | Skip | Nothing needs changing. |
| Auto + unknown supplied identifier | Needs Review | Sakurava cannot safely decide which record you meant. |
| Create + existing identifier | Needs Review | Creating would duplicate an existing record. |
| Update + unknown identifier | Needs Review | There is no matching record to update. |
| Delete + unknown identifier | Needs Review | There is no matching record to delete. |
| Skip | No mutation | Leave this row alone. |
| Row absent from edited file | No mutation | Absence is never Delete. |

Needs Review is a blocking Preview status, with a technical reason and a
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

Preview is read-only. The selected-file card shows filename, format, row count,
and Ready/Needs Review. Compact filter tabs carry the Create, Update, Delete,
Skip/No Changes, and Needs Review counts; the former redundant metrics strip is
removed. The bounded table is the primary review surface, and selected-row
progressive disclosure shows the complete field list and before/after values.

The main review table focuses on Row, Section, Record, Action, Details, and
Status. Details names useful changed fields and preserves the remaining count
as `… +N` at narrow, medium, and wide container widths. Pagination renders only
one page at a time with page sizes 32, 64, 128, and 256.
Raw CSV/XLSX content is secondary detail. If blocking issues exist, Needs
Review opens or is prioritized and final apply is disabled. A stale result
offers Review Again using the already trusted selected file.

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

Videos, Images, Performers, Categories, and Glossary are all selected on the
first Export opening in an app session. User changes are retained while the
component remains mounted; Export as template remains off by default. No new
persistent preference is introduced (`ImportExportPanel` in
`src/pages/SettingsPage.tsx`).

- XLSX: one type creates one workbook; multiple types create one multi-sheet
  workbook.
- CSV: one type creates one CSV; multiple types create one folder containing
  multiple CSV files.
- A type with no records requires the integrated Export as template option,
  not a misleading normal data export.

### Import

The user chooses or drops an XLSX/CSV file first. Sakurava identifies its
contained data type or workbook sheets; it does not require manual type
selection before a valid Sakurava file is chosen. No empty Preview table appears
before file selection. The UI then presents compact filter counts, a bounded
table, and detailed comparison only on request or when records need review.

## 13. Existing safety mechanisms, bounds, and compatibility

Implemented mechanisms include trusted selection, XLSX/CSV contract validation,
locale date parsing, summary Preview, immutable operation plans, explicit clear,
stale revalidation, automatic Safety packages, atomic apply/rollback, structured
results, no-silent-overwrite export, explicit Delete, hierarchy checks, and no
media-byte operations. Input processing is bounded at 25 MiB per file, 16 XLSX
worksheets, 25,000 rows per section, 50,000 total rows, and 32,767 characters
per cell. Preview retains at most the total-row bound and renders only the
selected page (`src/lib/importLimits.ts`; `src/lib/importCatalog.ts`;
`src/lib/importCsvPreview.ts`; `src-tauri/src/commands.rs`). ExcelJS remains
dynamically loaded for XLSX paths.

Current XLSX single-type, multi-type, and template exports always write valid
very-hidden v3 metadata. Missing metadata remains an explicit legacy warning;
malformed, exposed, conflicting, or unsupported metadata blocks Apply. CSV
supports UTF-8 with/without BOM, CRLF/LF, standard quoting, escaped quotes,
multiline cells, trailing empty rows, leading-zero text identifiers, and the
explicit clear token. XLSX supports 1900/1904 date systems, real Date cells,
clearly date-formatted serials, local text dates, and YYYY-MM-DD fallback.
Formula errors and unresolved formula cells block import.

Native checkbox/radio semantics, whole-card labels, visible focus treatment,
modal focus trapping/return, safe Escape, pending-action locks, named icon
controls, text status labels, and accessible toast roles are retained. Color is
never the only Needs Review indicator (`SakuravaCheckbox`, `ExportFormatCard`,
`ConfirmDialog`, and `CompactImportPreviewPanel`).

No schema or migration was required for the earlier v2 Import / Export
hardening for the five supported data types. The later public Sakurava Ref
work in section 16 is a separately authorized, versioned migration and does
not change that historical conclusion.

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

### 41.8.3 — Final Contract, UI and Round-trip Hardening

Purpose: finalize editable-field completeness, deterministic fingerprints,
canonical comparisons, exported-file presentation, bounded parsing, and the
compact accessible Review UI. Exact scope: v2 contract with v1 compatibility,
all five field paths, selected-row before/after comparison, responsive Details,
Needs Review treatment, Review Again, all-sections export default, locale and
workbook fixtures, and explicit resource limits. Risk: medium/high. Required
tests: XLSX/CSV parity, five blank-ID Creates, cross-language fingerprinting,
canonical equivalence, metadata persistence, bounds, accessibility semantics,
atomic Apply, and safety backup regressions. Non-goals: a second apply/backup
system, new formats, schema changes, or media transfer.

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

### Final known limitations

- Cross-device locale inference remains outside the primary same-computer
  workflow; ambiguous local dates are interpreted using the importing computer.
- Microsoft Excel and LibreOffice manual open/save smoke checks remain a release
  verification task because automated tests use ExcelJS structural round trips.
- CSV has no embedded metadata channel; exact headers are its compatibility
  contract.
- Temporary same-file references exist only for Glossary. Other relationships
  must refer to existing stable identifiers.

## 16. Implemented public identity migration and deferred resolution workflow

### 16.1 Pre-migration identity architecture (verified baseline)

Before the 41.8.4A migration, the database had one technical text primary key
per record:
`videos.id`, `images.id`, `performers.id`, `managedCategories.key`, and
`glossary_entries.id`. Credits have their own `credits.id` and store work,
Performer, and Managed Category technical keys in `workId`, `performerId`,
`creditTypeCategoryId`, and `roleImportanceCategoryId`
(`src-tauri/src/database.rs`: the six `CREATE_*_TABLE_SQL` constants).

Videos, Images, and Performers store additional relationships in JSON using
`performerId` or `recordId`. Managed Categories store `parentKey`; Glossary
stores `parent_id`. Forms, routes, CRUD commands, Preview snapshots, stale
revalidation, and atomic Apply all resolve these technical keys directly
(`src/lib/videoIntegration.ts`; `src/lib/imageIntegration.ts`;
`src/lib/performerIntegration.ts`; `src/pages/GlossaryPage.tsx`;
`src-tauri/src/commands.rs`: CRUD helpers, `import_revalidation_snapshot`, and
`apply_import_operations`).

New Videos, Images, Performers, Glossary entries, and Credits receive
`<type>_<epoch-milliseconds>_<process-counter>` from `new_id`. Managed Category
keys are name-derived hashes from `build_managed_category_key`. Neither
mechanism provides a permanent monthly business sequence or a durable no-reuse
ledger (`src-tauri/src/commands.rs`: `new_id` and
`build_managed_category_key`).

The earlier v1/v2 spreadsheet “Sakurava Ref” was not stored. `sakuravaRef`
derived `VID/IMG/PER/CAT/GLO-<seven-character FNV token>` from the technical
key on demand. Preview reconstructed the same hash over the current catalog
and blocked detected collisions. That baseline had no persisted mapping that
could issue, reserve, search, or prove non-reuse of `TYYMM-NNNN`
(`src/lib/exportCsv.ts`: `sakuravaRef` and `stableRefToken`;
`src/lib/importCsvPreview.ts`: `buildCurrentRowsByRef`).

### 16.2 Implemented decision: hidden technical keys plus public Sakurava Ref

The approved public form `TYYMM-NNNN` cannot safely be implemented by
relabeling or repurposing the existing primary keys. It requires all of the
following durable state:

- one immutable canonical Sakurava Ref for every Video, Image, Performer,
  Managed Category, and Glossary record;
- a transactional per-section/per-issuance-month high-water counter so Delete
  never makes a committed number available again;
- aliases from supported raw legacy keys and v1/v2 hashed Refs to exactly one
  canonical Sakurava Ref;
- a schema-version marker and idempotent migration record;
- runtime boundary mapping so routes and SQLite row keys can remain hidden
  while forms, search, files, Preview, references, and Apply use only the
  canonical Ref;
- restore-time migration and counter reconciliation so an older Backup package
  remains usable without rewinding the no-reuse high-water mark.

Batch 41.8.4A implements this migration boundary. Technical row keys remain
unchanged and hidden; `sakuravaRef` is the immutable public business identity.
Import Ref, Resolution, Attention resolution UI, and risk-based destructive
workflow remain explicitly deferred to Batch 41.8.4B.

### 16.3 Implemented migration, allocation, alias, and Restore policy

The implementation keeps existing SQLite primary keys as hidden row keys and
adds a canonical business-identity layer (`src-tauri/src/database.rs`:
`migrate_sakurava_refs`, `migrate_sakurava_ref_connection`,
`allocate_sakurava_ref`, and `resolve_sakurava_ref`):

The pre-migration audit on 2026-07-17 found Videos 51, Images 112,
Performers 59, Managed Categories 53, and Glossary 3. All sections were below
the 9,999 migration-month capacity. The audit found no missing/duplicate
technical IDs, released v1/v2 derived-Ref collisions, broken supported JSON or
hierarchy references, hierarchy cycles, or broken Credits references.

1. `schemaMigrations` records `41.8.4A-sakurava-ref-v1` after the transaction
   validates successfully.
2. `sakuravaRef TEXT` is added to the five supported record tables, backfilled
   transactionally, and protected by unique non-empty indexes plus runtime
   validation.
3. Add `sakuravaRefCounters(sectionCode, issuanceYymm, lastSequence)` with a
   composite primary key and a checked sequence range of 1–9999. Allocation
   runs under the same write transaction as record creation; it increments the
   stored high-water value and never counts current records.
4. Add `sakuravaRefAliases(sectionCode, alias, sakuravaRef, aliasKind)` with a
   unique section/alias constraint. Backfill both raw technical keys and exact
   v1/v2 hashed Refs. Any ambiguous hash collision blocks migration before
   mutation rather than guessing.
5. All legacy records use the migration computer's local `YYMM`. Each section
   is ordered by its technical key with binary collation; this makes migration
   repeatable but does not claim historical creation order. Capacity is checked
   before backup or mutation and is limited to 9,999 legacy records per section.
6. Technical row keys and physical relationships remain internal. CRUD lookup
   accepts formatted/canonical Refs and supported legacy aliases; current
   files, Preview, search, and visible system information use Sakurava Ref.
   Relationship serialization exposed to forms, search, Preview, and files
   resolves technical keys through the canonical Ref layer. The migration does
   not rewrite physical JSON, Credit, or hierarchy storage because those keys
   remain valid hidden database implementation details.
7. Create and verify a normal Safety package before migration. Use one SQLite
   transaction for the migration/backfill; validate uniqueness, aliases,
   hierarchy, Credits, JSON relations, and counts before commit. On any failure,
   roll back and retain the safety package.
8. Restore upgrades a legacy package and fully validates it before success is
   reported. Merge the per-section/month high-water
   values from the pre-restore Safety database with the restored database using
   the maximum value, preventing an in-place restore from reissuing a Ref used
   later in the same installation. Existing directory package v1 remains
   readable; do not invent a second backup format.

Canonical storage removes the hyphen (`V26070042`); UI, copy, and export render
`V2607-0042`. Parsing and search normalize case and one optional hyphen. Section
codes are V Video, I Image, P Performer, C Managed Category, G Glossary, and R
reserved for Credits. The Ref is immutable after allocation and remains text in
CSV/XLSX.

### 16.4 Authoritative migration state and mandatory-upgrade policy

Policy A, mandatory upgrade, is final. Ref-dependent contract-v3 Import,
Export, Create, relationship mutation, and Apply are available only after the
catalog passes one authoritative migration-state validator. The validator has
three outcomes (`SakuravaRefMigrationState` and
`sakurava_ref_migration_status_for_connection` in
`src-tauri/src/database.rs`):

- **legacy** — no completed Sakurava Ref infrastructure exists. Sakurava shows
  **Upgrade catalog references** and does not emit or accept contract v3.
- **migrated** — the ledger entry, all five Ref columns, valid non-empty Refs,
  unique indexes, counters, complete unambiguous aliases, schema rules, and
  supported relationship integrity all validate. Contract v3 is enabled.
- **invalid** — partial or inconsistent migration evidence exists. Sakurava
  fails closed, disables Ref-dependent workflows, and offers **Retry
  Validation** and **Open Backup & Recovery**. It does not treat this as a
  routine legacy upgrade or attempt silent repair.

Status checks are read-only. Startup, Settings navigation, and Import/Export
navigation never invoke migration. Only explicit confirmation of **Upgrade
References** calls `sakurava_ref_migration_apply`; the existing verified Safety
package is created and preview-validated before the schema/backfill
transaction. Migration does not return early merely because one Ref column
exists: only the authoritative `migrated` state permits an idempotent no-op.

Frontend product boundaries call the same authoritative status command, while
Rust mutation and atomic-Apply command boundaries independently require the
migrated state. A status-command failure therefore fails closed rather than
unlocking Ref-dependent behavior.

### 16.5 Implemented contract v3 identity boundary

The public-Ref contract is v3. Versions 1 and 2 remain compatibility inputs
through raw technical and exact derived-Ref aliases; new exports use v3
metadata and expose no technical key. Leading columns in 41.8.4A are:

1. Action
2. Sakurava Ref
3. required/core fields
4. relationship fields
5. optional/detail fields

Blank Sakurava Ref on Create is allocated during the same SQLite transaction as
the record insert. Update/Delete resolve current Refs or supported v1/v2
aliases. The existing reserved same-file Glossary temporary reference mechanism
continues only as compatibility plumbing and never becomes a permanent Ref.
Import Ref and Resolution columns are not part of 41.8.4A. The clear marker
remains `[[SAKURAVA:CLEAR:v1]]`.

All current workbook representations identify themselves consistently as
`sakurava-bulk-edit-v3`: numeric metadata, machine contract identifier,
Instructions, templates, and Examples agree. The very-hidden
`__SakuravaMetadata` sheet remains the authoritative XLSX contract location;
CSV retains the exact-header compatibility policy.

Formatted, canonical, and case-varied current Refs are normalized by one
frontend identity layer (`src/lib/sakuravaRef.ts`) before Preview maps,
operation plans, Apply preparation, relationships, stale fingerprints, search,
or new navigation links use them. The layer also supports raw legacy keys and
exact v1/v2 derived aliases, distinguishes malformed from unknown values, and
never uses display names as identity. Rust resolves the same public and alias
forms to hidden technical keys. Current navigation prefers formatted Sakurava
Refs; retained technical-key routes are hidden compatibility inputs only.
Current relationship exports use public Refs for Video/Image/Performer links,
Managed Category and Glossary parents, and embedded Record Categories. Record
Category Refs are resolved back to the existing stored labels during Apply, so
the public identity boundary does not change the `categoriesJson` schema.

### 16.6 Deferred to 41.8.4B: Attention, dependency, and confirmation workflow

The final structural statuses are Ready, Attention, No Change, and Skipped
(Indonesian: Ready-equivalent product copy, Perhatian, no-change equivalent,
and skipped equivalent). “Attention” is the only review term; internal severity
or decision classifications are not additional permanent badges. Badges remain
one line and communicate with text, not color alone.

Attention must always have a next action. Mandatory decisions show
**Review N items** and open grouped progressive disclosure. The user may choose
Detach, Cascade, Replace, or Skip for one item or all equivalent items. The
system then rebuilds the normalized plan, dependency order, risk, and
fingerprint. Informational Attention does not block Apply and is summarized in
confirmation.

Delete validation uses the projected final plan: included Glossary/category
children are ordered before parents and do not create redundant Attention.
Detach preserves dependent catalog records and Credits while removing the
relationship. Replace rewrites relationships before the target Delete. Cascade
expands only eligible catalog operations; Credits are never silently deleted.
Delete-all remains possible after all decisions resolve, final impact is shown,
confirmation completes, the Safety package succeeds, and atomic Apply starts.

Risk is computed from the final plan: Standard for ordinary Create/Update,
Caution for Clear/Detach/parent or broad updates, High for Delete/Replace/
Cascade, and Critical for section-wide or near-total destructive plans.
Confirmation remains concise but includes affected counts, relationship
changes, chosen resolution effects, automatic backup, atomicity, and the fact
that original media is not deleted. Critical confirmation adds explicit
acknowledgement.

The final Preview columns are Row, Section, Sakurava Ref, Record, Action,
Details, and Status. Search/copy accepts canonical or formatted Ref. Mandatory
Attention shows Review N items rather than an unexplained disabled Apply.

### 16.7 Migration and regression verification

The identity migration verification covers deterministic local YYMM
allocation, per-section/month sequencing, 9,999 exhaustion, no reuse after
Delete and Restore, uniqueness, immutability, formatted/canonical lookup,
legacy raw/hash aliases, collision rejection, transactional backfill, migration
rollback, old Backup package restore-and-upgrade, and Safety package recovery.
JSON relations, hierarchy links, Credit references, CRUD resolution, Preview,
stale scope, operation fingerprints, and atomic Apply retain their existing
regression coverage while current files emit contract v3.

Batch 41.8.4B must add resolution tests for projected Delete ordering, Detach, Cascade,
Replace, Skip, Credits preservation, apply-to-all stability, risk selection,
critical acknowledgement, stale revalidation, backup-before-transaction, full
rollback, and unchanged original media. UI tests must prove unified Attention,
one-line statuses, Review N items, an actionable next step for every supported
case, and consistent English/Indonesian copy.

The translation architecture is frozen until Batch 41.9. Batch 41.8.4A adds
only the minimum migration validation and recovery copy through the existing
translation infrastructure; it does not change core languages, removability,
fallbacks, reset behavior, or translation CSV behavior.

## 17. Explicit non-goals

- No replacement of hidden SQLite primary keys or physical relationship
  storage; Sakurava Ref is an additional business-identity layer.
- No Attention/Detach/Cascade/Replace implementation; that is Batch 41.8.4B.
- No new dependency.
- No Backup/Recovery semantic change or database replacement through Import.
- No ODS, legacy XLS, HTML table, JSON exchange, ZIP/archive, or additional
  format work for Batch 41.8.
- No media copy, move, rename, rewrite, deletion, cache exchange, or arbitrary
  filesystem mutation from imported values.
- No Credits/roles, Settings/preferences, media-root configuration,
  original media files, or app-managed asset import/export.
- No unrelated Settings, Batch 39, or Batch 40 changes.
- No commit or amend.
