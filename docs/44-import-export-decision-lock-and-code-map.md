# Import/Export Decision Lock and Code Map

## 1. Status and authority

This document is the authoritative product and implementation boundary for
Import/Export follow-up batches after 41.8.4B. It records decisions only; C1
does not change runtime behavior. The existing audit decision remains the
historical record; this document resolves the final UX direction.

Batch 41.9 (language and translation management) is explicitly excluded.

## 2. Locked final product

The user flow is:

`Choose File → Preview → Apply Import → Confirm → Finished`

Preview is read-only. There is no in-app Review, Attention, resolution choice,
or per-row decision workflow in the final UX.

The only spreadsheet system columns are:

1. `Action`
2. `Sakurava Ref`
3. section-specific editable columns

Public actions are `Auto`, `Add`, `Update`, and `Delete`. Blank Action is Auto.
Removing a row never deletes it; Delete must be explicit.

Auto with a blank Ref creates (Add); Auto with an existing changed Ref updates;
Auto with an unchanged Ref produces no operation; an unknown Ref produces a
non-blocking warning and no operation.

## 3. Preview, warnings, and blockers

Final filters are All, Add, Update, Delete, and Warning. The table is Row,
Section, Sakurava Ref, Record, Action, and Details. Action is displayed as a
chip; Warning is a Details condition, not an action or status column.

Cell and record problems never disable Apply. Invalid values use a deterministic
safe default, an empty value, cleared relationship, or a row-not-applied
result, with factual Details. Only unreadable files, unsupported/corrupt
workbooks, missing/duplicate required headers, or uninterpretable structure
block Apply.

Confirmation is one compact dialog containing Add/Update/Delete/Warning counts,
the safety-backup note, one acknowledgement, and an additional destructive
acknowledgement for large deletes.

## 4. Safety invariants to preserve unchanged

The following are Keep requirements in every follow-up batch: authoritative
Ref migration gating; file and stale revalidation; verified automatic safety
backup; one SQLite transaction; relationship cleanup before referenced deletes;
final integrity validation inside the transaction; complete rollback; no
partial success; no media deletion; durable Ref high-water/no-reuse behavior;
valid empty-catalog state; and Restore staging, reopen, route remount, and
recovery-state corrections.

## 5. Credits and exclusions

Credits Import/Export, public Ref R, schema/migration work, and relationship
CRUD for Credits are deferred to 41.8.5. Batch 41.9 language management is
unchanged and outside this plan.

## 6. Current implementation map

| Location | Current responsibility | Decision | Target | Dependency / risk |
|---|---|---|---|---|
| `src/pages/SettingsPage.tsx` `CompactImportPreviewPanel` | Filters, status badges, Status column, Review entry, Apply footer | Rewrite | C2/C4 | Remove UI state without weakening Apply gating or confirmation |
| `src/pages/SettingsPage.tsx` `ImportAttentionReviewDialog` | Review N items, resolution selectors, Apply-to-all | Remove | C2 | Package-local decisions must disappear from final state |
| `src/pages/SettingsPage.tsx` `ImportApplyConfirmPanel` | Confirmation and current critical acknowledgement | Rewrite | C4 | Retain backup/atomic safety copy and acknowledgement semantics |
| `src/components/ConfirmDialog.tsx` | Generic accessible confirmation dialog | Keep/reuse | C4 | `confirmDisabled` supports the final acknowledgement |
| `src/lib/exportCsv.ts` schemas | Section field mapping and current v3 system columns | Rewrite | C2 | Remove `Import Ref`/`Import Resolution`; preserve field coverage and unique `Resolution` video field |
| `src/lib/importCsvPreview.ts` | CSV parsing, headers, dates, row differences, current resolution parsing | Rewrite | C2/C3 | Keep strict structural blockers; make data warnings non-blocking |
| `src/lib/importCatalog.ts` `applyImportResolutions` | Rebuilds Preview from package-local resolutions and synthetic operations | Remove/rewrite | C2/C3 | Replace with automatic projected cleanup; preserve dependency facts and integrity inputs |
| `src/lib/importOperationPlan.ts` | Immutable normalized operations and fingerprint | Rewrite | C3/C4 | Remove resolution operations while retaining deterministic plan/fingerprint |
| `src/lib/importCsvApply.ts` | Row patch preparation and skipped-row behavior | Rewrite | C3 | Add/Update/unknown-Ref fallback semantics; preserve clear and type normalization |
| `src/lib/language.ts` Import/Export keys | Current Attention/Review/resolution copy | Remove/rewrite | C2/C4 | Do not alter language architecture; remove only obsolete feature keys |
| `src/App.tsx` | Migration state, database epoch, Restore route remount | Keep | — | Required to prevent stale database/UI state |
| `src/runtime/databaseCommands.ts` | Runtime command wrappers and migration gate | Keep | — | Public Ref resolver and runtime gating are safety boundaries |
| `src-tauri/src/commands.rs` | Atomic Apply, operation execution, backup, final validation | Keep/rewrite only at call boundary | C3/C4 | Never weaken transaction, rollback, Credits protection, or integrity validation |
| `src-tauri/src/database.rs` | Migration state, counters, aliases, Restore lifecycle | Keep | — | No schema/migration change in C1–C4 |
| `src/App.test.tsx` | UI, v3 export, Restore, lifecycle coverage; monolithic App suite | Rewrite tests with UI | C2/C4 | Preserve B1.1 rollback, Restore remount, v3 identity assertions; isolate suite debt |
| `src/lib/importCatalog.test.ts` | Preview, projected dependencies, resolution tests | Rewrite/remove resolution cases | C2/C3 | Retain projected-state and Credits safety tests |
| `src/lib/importCsvPreview.test.ts` | Strict parser/contract/date tests | Keep/rewrite expectations | C2/C3 | Add warning/non-blocking and system-column coverage |
| `src/lib/importOperationPlan.test.ts` | Fingerprint, clear, deterministic create tests | Rewrite | C3/C4 | Preserve canonical plan and stale protection |
| `src/lib/importCsvApply.test.ts` (if added by C2) | Row fallback/application behavior | Rewrite | C3 | Must prove warnings never imply partial success |

## 7. Import Ref and Import Resolution findings

`Import Resolution` is read by `importCsvPreview.ts`, ignored by
`importCsvApply.ts`, stored in `ImportCatalogPreview`, passed through
`SettingsPage` state, converted by `applyImportResolutions`, serialized into
`ImportPlanOperation` through `resolutionOperations`, and included indirectly
in fingerprints. Its UI and translation keys are concentrated in
`ImportAttentionReviewDialog` and the confirmation summary. It is therefore a
package-local B2A/B2B feature, not a catalog field.

`Import Ref` is parsed and exported as a package-local identity. It is not
persisted as a final catalog ID, but same-file Glossary Create parent/child
resolution currently depends on temporary references and dependency refs in
the operation plan. Removing the column without an alternative internal
source-row identity would break same-file Adds. C3 must decide whether to keep
an invisible/package-only source identity, infer relationships by deterministic
source row context, or retain a compatibility-only Import Ref. No decision is
made here.

## 8. Keep / Remove / Rewrite / Defer summary

**Keep:** XLSX/CSV parsers, section field contracts, public Ref resolver,
canonical normalization, date handling, Preview diff primitives, migration
gate, automatic backup, package lock, atomic Rust transaction, final integrity
validation, rollback, Restore lifecycle, counters, aliases, and empty-catalog
tests.

**Remove (C2):** Review modal, Review N items, Attention/Needs Review/Ready/
Skipped structural statuses, resolution selectors, Apply-to-all, Detach,
Replace, Cascade, package-local resolution state, Import Resolution column,
Status column, and resolution-only translations/tests.

**Rewrite (C2/C3/C4):** Action parsing (`Create` becomes `Add`), Auto inference,
filters/table, warning Details, non-blocking fallbacks, relationship cleanup,
operation-plan serialization/fingerprints, and compact confirmation summary.

**Defer:** Credits sheet/file and Ref R (41.8.5), schema decisions, unrelated
language management, and Batch 41.9.

## 9. Batch boundaries

### C2 — Remove Review and simplify Preview

Remove the Review/resolution UX, Import Resolution, Status column, and Create
label; retain safe backend behavior temporarily where compilation requires it.

### C3 — Auto and permissive warnings

Implement Auto inference, non-blocking normalization, row-not-applied results,
automatic relationship cleanup, warning Details, and projected-plan alignment
with the final validator. Resolve the Import Ref same-file design here.

### C4 — Confirmation and Apply closure

Implement the final compact confirmation, counts, acknowledgement/destructive
acknowledgement, post-Apply reset, dead-code cleanup, and disposable restart /
recovery smoke while preserving all safety invariants.

### 41.8.5 — Credits

Separate Credits XLSX sheet and CSV file, schema/migration, public Ref R, and
Add/Update/Delete/Auto parity.

## 10. Acceptance gates and unresolved questions

Before C3 approval, answer: what internal mechanism replaces visible Import Ref
for same-file Adds; how unknown Refs are represented without blocking Apply;
which relationship fallbacks are safe and deterministic; what counts as a
“large” destructive import; and how warnings are represented in fingerprints
without translated copy.

Acceptance requires concrete mapping for every removed key/test, preservation
of B1.1 rollback and empty-catalog tests, preservation of Restore remount tests,
no technical IDs in exports/UI, and no weakening of final-state validation.

## C2 completion note

C2 removed active Review/resolution controls, the Status column, and the
public Import Ref/Import Resolution export columns. Preview now uses
All/Add/Update/Delete/Warning terminology. Older files containing the obsolete
Import Resolution column remain readable and that column is ignored. Import Ref
remains internal transitional input support for same-file Add relationships;
it is not exported or shown in Preview. The internal temporary-reference and
synthetic-resolution code remains intentionally until C3 selects the same-file
Add relationship replacement and rewrites the plan.
No Batch 41.9 decision changed.

## C3 completion note

C3 treats blank Action as Auto and uses Add, Update, Delete, or a
row-not-applied Warning result. Record-level invalid values are normalized to
safe empty/default values where supported, while invalid required Adds and
unresolvable targets are omitted without blocking the rest of the file.
Category and Glossary deletes receive deterministic cleanup updates for
surviving nullable relationships before deletion. Credits category references
are cleared; a Video, Image, or Performer Delete that would require clearing a
non-null Credit work/performer relation is not applied rather than corrupting
the Credit. Import Ref remains deprecated compatibility input only; current
exports omit it, and new-to-new relationships without an issued Ref are not
inferred. C4 owns the compact final confirmation and final cleanup of the
transitional internal operation field.

## C4 completion note

C4 completes the single compact **Confirm Import** dialog. It presents only
Add, Update, Delete, and Warning row counts, one verified-safety-backup note,
and one required acknowledgement. The acknowledgement uses stronger wording
when the existing substantial-delete threshold is reached. Successful Apply
clears the selected file, Preview, immutable plan, acknowledgement, filters,
and stale state, then reloads catalog category data and the authoritative
reference state. Failed Apply preserves a safe current Preview where possible,
reports that no catalog changes were saved, and does not alter recovery state
after a valid rollback.

The former resolution-specific synthetic operation field is now named
`automaticCleanupOperations`; it represents only deterministic relationship or
hierarchy cleanup that the permissive importer needs before a safe Delete.
Current exports and normal imports continue to omit Import Ref and Import
Resolution. Legacy Import Ref remains an internal compatibility input only;
new-to-new relationships without an issued Sakurava Ref remain a two-step
operation with a Warning. Credits spreadsheet CRUD and Ref `R` remain deferred
to 41.8.5. Batch 41.9 remains unchanged.

## C4.1 completion note

Delete rows now bypass editable-payload normalization completely: only their
Action and target identity are evaluated. Consequently, a normal Delete has no
Warning merely because exported required fields, dates, or numbers are blank
or malformed. Required Add text fields use the deterministic `N/A` fallback;
other supported scalar defaults remain type-aware, while an Add with no safe
required relationship still becomes a row-not-applied Warning. Invalid Update
replacement values preserve the existing value rather than overwriting it.

The large Delete planner now removes Credit-protected Video, Image, and
Performer rows from its projected delete set before evaluating dependent
Categories. It clears nullable Category relationships on the preserved
records, preserves Credits and their required work/performer targets, and
then deletes the remaining safe records atomically. Warnings count only rows
with an actual fallback, cleanup, or omitted operation. Credits CRUD and
public Ref `R` remain deferred to 41.8.5; Batch 41.9 remains unchanged.

## C4.2 completion note

The Delete-all Apply failure was traced to `plan.skippedCount`, not imported
cell data: automatic cleanup operations were included in the runtime-operation
total and subtracted from spreadsheet rows. In the 278-row plan that yielded
`-25`, while Rust correctly expects the count as an unsigned `usize`.
`skippedCount` now counts only non-executable spreadsheet rows; automatic
cleanup operations never affect it. Delete operations continue to serialize an
empty editable payload, so unused negative or otherwise invalid Delete cells
cannot reach the Rust command.

The TypeScript runtime boundary now validates non-negative integral structural
values before invoking Tauri. A malformed internal plan is not sent to Rust;
the user is asked to Preview again with concise no-changes-saved copy, while
development logging retains the field detail. Credits scope remains unchanged:
Credit-protected Deletes remain omitted, and Credits CRUD/public Ref `R` stay
deferred to 41.8.5. Batch 41.9 remains unchanged.

## C4.3 completion note

The false Delete-all stale rejection was traced to the Apply-time target check:
it compared `operations[*].currentRecord` with a freshly serialized Rust
catalog record after the scoped catalog-staleness check had already passed.
That transport-shape comparison could reject the same immutable Preview plan
without a catalog change. Plan integrity now validates operation targets against
the stored Preview snapshot, while the separately scoped live-catalog snapshot
continues to reject real changes before a safety backup or transaction begins.

Automatic cleanup updates are canonicalized before plan fingerprinting and
serialization. The frontend revalidates the stored plan fingerprint immediately
before invoking Rust; filters, search, pagination, dialog state, and the
acknowledgement are not plan inputs. The stale message now says: “The catalog
changed after this Preview. Preview the file again before applying.” Credits
scope and Batch 41.9 remain unchanged.

## C4.4 closure gate map

The final Import Apply path has one canonical plan: parser output is normalized
into executable Add/Update/Delete operations, deterministic automatic cleanup,
non-executable Warning rows, an immutable catalog snapshot, and a semantic
fingerprint. Apply uses that stored plan only; filters, search, pagination,
dialog visibility, acknowledgement, Details text, and translated labels are
not semantic-plan inputs.

| Gate | Internal code | Blocks only when | User result |
| --- | --- | --- | --- |
| File open / parser | `FILE_UNREADABLE` | File cannot be opened or interpreted | Preview cannot be built. |
| Header / section map | `HEADER_INVALID` | Required Action/header/section structure is absent, duplicated, or unmappable | Preview cannot be built. |
| Preview normalization | `PREVIEW_BUILD_INVALID` | The workbook cannot produce a supported Preview | Preview cannot be built. |
| Plan shape | `PLAN_STRUCTURE_INVALID` | Unsupported executable operation or malformed structural value | Preview Again; no changes saved. |
| Plan fingerprint | `PLAN_FINGERPRINT_MISMATCH` | Stored semantic plan differs from its canonical payload | Preview Again; no changes saved. |
| Planned target scope | `PLAN_REVALIDATION_INVALID` / `PLAN_TARGET_INVALID` | Immutable plan cannot be reconciled with its stored Preview snapshot | Preview Again; no changes saved. |
| Catalog revalidation | `CATALOG_STALE` | A relevant catalog record changed after Preview | Preview Again; no changes saved. |
| Runtime payload | `COMMAND_SERIALIZATION_INVALID` / `COMMAND_DESERIALIZATION_INVALID` | Internal command payload cannot be transported safely | Preview Again; no changes saved. |
| Package lock | `PACKAGE_OPERATION_BUSY` | Another package operation is active | Retry after it finishes. |
| Safety backup | `BACKUP_CREATE_FAILED` / `BACKUP_VERIFY_FAILED` | Required backup cannot be created or verified | No catalog changes are made. |
| Transaction | `TRANSACTION_START_FAILED` / `TRANSACTION_FAILED` | SQLite cannot start or execute the plan | Roll back; no catalog changes saved. |
| Final integrity | `FINAL_INTEGRITY_FAILED` | Projected final state violates authoritative catalog validation | Roll back; no catalog changes saved. |
| Commit / rollback | `COMMIT_FAILED` / `ROLLBACK_FAILED` | Database finalization or rollback fails | Recovery handling only when rollback itself fails. |
| Post-Apply reset | `POST_APPLY_RESET_FAILED` | UI reload cannot complete after a committed plan | Catalog remains committed; refresh safely. |

Data-level dates, numbers, unknown row Refs, unsupported row Actions,
relationships, parents, cycles that can be ignored, Credit-protected Deletes,
omitted rows, automatic cleanup, and UI-only state are not global blockers.
They become a Warning, deterministic fallback, cleanup, or row-not-applied
result.

The C4.4 false blocker was the `PLAN_FINGERPRINT_MISMATCH` preflight: the
TypeScript serializer represented an object property with `undefined` as the
literal token `undefined`, while Tauri JSON omitted that property before Rust
computed the same plan fingerprint. Canonical plan serialization now matches
JSON transport semantics: undefined object values are omitted and undefined
array values normalize to null. Rust records the precise internal gate and
diagnostic detail without exposing either to normal UI.

Regression coverage constructs a disposable 278-record workbook Preview with
273 executable Deletes, five Credit-protected non-executable Warning rows, and
automatic Category cleanup. The matching Rust transaction fixture verifies a
safety-backed atomic commit of 273 Deletes, preservation of the five required
Credit targets and all Credits, final integrity validation, and a reopened
migrated catalog. The desktop manual unchanged-catalog and real-stale smoke
remain required before final closure; they are not implied by these fixtures.
Credits CRUD/public Ref `R` remains 41.8.5 work. Batch 41.9 remains unchanged.

## C4.6 completion note

The remaining final-integrity failure was not migration metadata loss or a
second connection: the transaction-scoped validator read the same pending
SQLite transaction and found one surviving Video's `relatedImagesJson` still
referencing an Image scheduled for Delete. The development-only diagnostic
identified the precise `videos.relatedImagesJson` source and missing Image
target; ledger, aliases, counters, schema, and indexes remained intact.

Automatic cleanup now removes Video/Image/Performer relationship entries only
from surviving records when their target is deleted by the same plan. Cleanup
for one surviving record is merged into one deterministic update, so Category
and catalog-relationship cleanup cannot produce duplicate operation targets.
The final validator remains unchanged and continues to run inside the import
transaction before commit.

The fresh desktop replay of `skv-all-20261707-202542.xlsx` completed with
278 Preview rows, 273 executable Deletes, five Credit-protected rows, and 277
total catalog changes including cleanup. After restart, the catalog remained
migrated with Import/Export available and no recovery UI. Credits CRUD/public
Ref `R` remains deferred to 41.8.5; Batch 41.9 remains unchanged.

## 41.8.4C final closure

The final product path is Choose File → Preview → Apply Import → Confirm →
Finished. Preview remains read-only and exposes only All, Add, Update, Delete,
and Warning filters with Row, Section, Sakurava Ref, Record, Action, and Details
columns. Public actions are Auto, Add, Update, and Delete; blank Action is Auto,
Delete is explicit, unchanged rows produce no operation, and data-level
fallbacks or omitted rows remain warnings rather than global blockers.

Current XLSX/CSV exports omit Import Ref and Import Resolution; legacy inputs
may still be accepted internally without making either column part of the
current workflow. Essential structure, migration, stale-catalog, package-lock,
backup, runtime, and rollback failures remain the only global blockers.

The immutable plan uses canonical JSON-compatible fingerprints, deterministic
cleanup ordering, unique operation targets, and a non-negative `skippedCount`
derived only from non-executable Preview rows. Automatic cleanup covers
surviving Video, Image, Performer, Category, Glossary, and nullable Credit
relationships while excluding projected Deletes and merging fields per target.
The fresh 278/273/5 desktop Delete-all Apply and restart both succeeded without
recovery UI. Credits CRUD/public Ref `R` remains 41.8.5 work; Batch 41.9 is
unchanged.
