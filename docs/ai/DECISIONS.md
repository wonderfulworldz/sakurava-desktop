# Durable Decisions and Product Contracts

These decisions are active product or architecture contracts. They do not
authorize implementation by themselves. Execution and safety rules live in
`AGENTS.md`; historical outcomes live in `HISTORY.md`.

## UI and Translation

### LOCK-UI-001 — Preserve Existing UI and UX

Preserve the existing shell, layout, visual hierarchy, interaction behavior,
workflow, controls, and functional states. New frontend work follows the
closest established Sakurava pattern. Redesign requires explicit product and
batch approval.

### LOCK-UI-002 — Forms Remain Full Pages

Existing Forms remain full-page workflows. They are not converted to modals,
drawers, popovers, overlays, or inline panels without a separate product
decision. Improvements must preserve navigation, validation meaning, Save,
Cancel, and data behavior.

### LOCK-UI-003 — User-Controlled Motion

Motion is lightweight, optional, non-blocking, and accessible. If introduced,
users can disable it through a persistent Settings preference that is respected
by Backup/Restore where applicable; reduced-motion preferences are respected
when technically applicable.

### LOCK-TRANSLATION-001 — Protected Translation Behavior

English (`en`) is the sole built-in, default, source, and fallback language.
Indonesian and other non-English languages are user-managed and removable.
Translation covers application-controlled UI text only, never catalog data.
English is editable/resettable through the approved CSV workflow. The canonical
CSV is `id_lang,language,key,translation,context`; historical formats remain
import-compatible. One normalized code represents one language identity, and
future features add their own English Translation keys.

## Media, Backup, and Explicit Features

### LOCK-MEDIA-001 — Managed Mini Images Are Protected Catalog Assets

Managed mini images are local catalog assets, not disposable cache. They remain
useful when originals are unavailable, are included in `.skv` Backup, and are
not removed by Clear Cache. Failed regeneration preserves the last valid output;
replacement follows staging and validation. Startup-wide regeneration is not
allowed. Approved profile families are Landscape 16:9, Standard 4:3, Square
1:1, and Portrait 4:5 with bounded Thumbnail/Medium/Large tiers and no upscale.
The accepted foundation remains inert where implementation was separately
gated; exact format, storage, queue, lifecycle, and integration decisions remain
scope-gated.

### LOCK-BACKUP-001 — Protected `.skv` Backup Content Boundary

`.skv` remains the Backup extension. Backup includes catalog records,
relationships, public references, settings, translations, feature state,
managed mini images, compatibility and integrity information when implemented.
It excludes full externally referenced media, disposable cache, temporary
exports/logs, build output, and evidence. Internal package changes require
compatibility, migration, corruption, rollback, and old/new package analysis.

### LOCK-FEATURE-001 — Non-Destructive Explicit Catalog Features

Explicit features such as Cup Size and Body Size may be enabled or disabled.
Disabling hides fields and filters but never deletes, clears, migrates, or
removes stored values from Backup. State persists, survives upgrades, and uses
stable internal keys. This is not a plugin system, schema editor, account
permission system, or parental-control system.

## Credits, References, Import, and Export

### LOCK-CREDITS-001 — Credit Type Remains Free Text

`creditTypeText` remains free text; it is not a Category selector and is not
merged with `creditedAs` without an explicit decision.

### LOCK-CREDITS-002 — Credits Remain Independent Records

Each Credit is one first-class record and one spreadsheet row. Same-Performer
Credits remain separate; logical duplicates are not automatically collapsed;
synthetic `credit_legacy` records are not created.

### LOCK-CREDITS-003 — Public R Ref Identity

Public R Ref is the authoritative Credit spreadsheet identity. Add allocates a
new Ref; Update/Delete resolve an existing authoritative Ref; deleted Refs are
not reused; high-water and transaction state remain safe. Technical IDs are
internal and are never spreadsheet identity.

### LOCK-CREDITS-004 — Five Credits per Performer

The maximum is five Credits per Performer within the applicable Work
relationship. Final-state validation may evaluate Delete before Add, and
spreadsheet Apply cannot bypass the limit.

### LOCK-IMPORTEXPORT-001 — Credits Spreadsheet Contract

Credits export supports XLSX and CSV, uses one row per Credit, the `Credits`
sheet, public references, and the locked 14-column header order. Filenames use
the `skv-cre-{YYYYDDMM}-{HHMMSS}` contract and the stable internal code `cre`.

### LOCK-IMPORTEXPORT-002 — Safe Spreadsheet Apply

Spreadsheet mutation requires Preview, blocking validation, stale-Preview
protection, final-state capacity checks, a safety Backup, one atomic Apply,
rollback, final integrity validation, and no partial records or counters.

### LOCK-REF-001 — Public References Only

Spreadsheet-facing record identity and relationships use public Sakurava Ref;
technical database IDs are internal. Allocation, ownership, current-owner
updates, conflicting Add claims, relationship canonicalization, and counters
remain deterministic and transaction-safe. This lock does not replace the
separate Credit R Ref contract.

## Compatibility and Safe Filter

### LOCK-PACKAGE-001 — Package and Compatibility Stability

Unrelated batches do not change application version, `.skv` extension, package
format, import/export format, compatibility behavior, or stored-data
assumptions. A package/migration batch must audit existing versions, migration,
corruption, failure, rollback, and user-data safety first.

### LOCK-SAFEFILTER-001 — Non-Destructive Safe Filter and Direct R+

Safe Filter is a global ON/OFF visibility filter, defaulting safely to ON when
state is missing or invalid. R+ is a direct marker only on Video, Image,
Performer, Category, and Glossary. There is no inheritance, propagation,
inference, semantic or AI classification, or Force Safe behavior. When ON,
directly R+ records and the approved sensitive surfaces (Censorship,
Measurements/body measurements, Cup Size) are hidden without deleting or
rewriting data. Backup/Restore remains complete, Import/Export remains
reference-closed, and existing Glossary-reference data is retained.

## Superseded Authority

Legacy `LOCK-PROJECTOS-001` tracked the old Project OS file set. Its mechanics
are superseded by the Project Brain V2 file set and authority order. Legacy
execution, evidence, dependency, security, and live-data locks are represented
in `AGENTS.md` rather than duplicated as product contracts.
