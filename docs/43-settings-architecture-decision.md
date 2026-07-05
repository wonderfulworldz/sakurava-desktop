# 43 - Settings Architecture Decision

## 1. Purpose

Batch 41 is not a greenfield Settings implementation. The existing product
already contains working Settings capabilities alongside legacy information
architecture, inactive controls, planning copy, and mixed concerns.

Batch 41 normalizes and productizes that existing work. It must preserve safe
working behavior while moving Settings to the approved Normal Settings
structure.

The governing product rule remains:

> Visible setting = functional setting.

A control must not appear merely to describe a possible future feature. An
informational row must report a real current value or clearly explain a real
functional action.

Batch 41.2 adds one narrow presentation exception: a disabled or read-only
visual shell may be visible when it is needed to preserve the approved Settings
control-panel structure. A visual shell is not a setting: it must not accept
input, persist data, trigger an operation, or be described as functional.
Functionalization remains assigned to a later approved sub-batch.

## 2. Source of Truth

Settings decisions must follow these sources in this order:

1. Sakurava AI Guardrail Batch39/40 to Batch41 Settings.
2. Batch 41.0 Settings Architecture Audit findings.
3. The eight-section Normal Settings information architecture locked by this
   document.
4. Existing safety documents for the relevant operation, including category,
   Backup/Restore, Settings persistence, language, and Import/Export safety.

Older documents remain useful implementation history, but they do not override
the guardrail or this decision when they describe an earlier Settings layout,
terminology, or capability boundary.

The locked Normal Settings sections are:

1. Overview
2. Appearance
3. Language
4. Catalog Preferences
5. Library & Media
6. Backup & Recovery
7. Import / Export
8. Performance & Cache

System Info is not a visible Normal Settings section. Diagnostics must also
remain absent. Runtime path, log, version, or support information may be
reconsidered only through a later explicit product and privacy decision.

## 3. Current Baseline Summary

The Batch 41.0 audit established that Settings is already substantial:

- Light and Dark themes are functional.
- App language selection and Language CSV import/export are functional.
- Media folder selection, addition, removal, and runtime asset scope are
  partially functional.
- Database backup and restore are functional at the runtime level.
- CSV export, import preview, confirmation, and apply are functional for part
  of the required catalog scope.
- Scoped app-cache cleanup is functional.
- Batch 41.2 replaced the legacy Settings presentation with the approved
  compact eight-section shell and removed roadmap/status copy from the visible
  UI.
- `src/pages/SettingsPage.tsx` is too large and mixes Normal Settings concerns
  with legacy category/settings concerns.

The baseline must be reused where it satisfies the locked product and safety
requirements. Existing behavior must not be presented as complete when required
safety steps or target entities are still missing.

## 4. Final Normal Settings Information Architecture

### 4.1 Overview

**Purpose**

Provide a concise summary of the eight visible Settings domains and surface
only useful current status.

**Allowed visible controls**

- Navigation to each functional Settings section.
- Short real status summaries, such as current theme, current UI language,
  configured media-folder count, or last known backup status when that value is
  actually tracked.
- Direct actions only when the underlying action is functional and safe.

**Existing capability to reuse**

- Current runtime availability checks.
- Current functional Settings actions and persisted values.

**Not allowed in normal scope**

- Feature roadmap or release-status lists.
- Deferred feature cards.
- Product analytics, cloud sync, accounts, or network services.
- Static claims presented as live system status.

**Stop conditions**

- A status cannot be derived from a real current value.
- An Overview action would bypass confirmation or safety flow in its owning
  section.

### 4.2 Appearance

**Purpose**

Control local visual preferences without mutating catalog data.

**Allowed visible controls**

- Theme: Light and Dark.
- Accent Color: Sakura Pink, Blue, Purple, and Custom Color through a color
  picker.
- UI Density choices only after every visible choice is functional.
- A scoped reset for Appearance only after its exact behavior is defined.

**Existing capability to reuse**

- Existing Light/Dark application and persistence.
- Existing Sakura Pink design tokens where compatible with selectable accents.

**Not allowed in normal scope**

- Disabled density options.
- Theme previews that do not apply.
- Viewer Preferences.
- Controls that alter catalog, media, or database data.

**Stop conditions**

- Accent changes require an unapproved broad design-token rewrite.
- A preference requires schema or backend persistence.
- Custom Color cannot meet contrast and validation requirements.

### 4.3 Language

**Purpose**

Expose exactly two conceptual areas: Info and Translation. Translation applies
to application UI text, never user data.

**Allowed visible controls**

- Info: selected app language, installed languages, fallback behavior, and
  coverage information when derived from real translation keys.
- Translation: export starter/language CSV, preview and import a custom
  language, select an installed language, remove or reset eligible custom
  languages.
- Up to 25 installed custom languages.

**Existing capability to reuse**

- Existing language context, English fallback, custom-language metadata,
  overrides, defensive localStorage parsing, and Language CSV workflow.

**Not allowed in normal scope**

- Translation of titles, performer names, categories, notes, file paths, or
  other user data.
- An in-app language editor outside the agreed CSV workflow.
- More than the Info and Translation conceptual groups.
- Silent modification or removal of English source text.

**Stop conditions**

- Existing Language CSV compatibility would be broken.
- Enforcing the 25-language limit would discard installed data.
- A translation operation touches catalog records or user data.

### 4.4 Catalog Preferences

**Purpose**

Control whether each catalog remembers its last presentation state.

**Allowed visible controls**

- Remember last view: on/off.
- Remember last sort: on/off.
- Remember last filter: on/off.
- Reset remembered catalog state.

**Existing capability to reuse**

- Current in-session view, sort, filter, table-sort, and page-size state.
- Current per-catalog state boundaries.

**Not allowed in normal scope**

- Default values displayed as settings without persistence.
- Record-field defaults.
- Category behavior changes.
- Viewer Preferences.
- Search, page size, or other state unless a later approved decision explicitly
  adds it to the remembered-state contract.

**Stop conditions**

- Reset scope is not explicit.
- Remembered state would mutate catalog records.
- Invalid persisted state cannot fall back safely.

### 4.5 Library & Media

**Purpose**

Manage local folders that Sakurava may access for media and image assets.

**Allowed visible controls**

- Pick and add a folder.
- Remove a configured folder.
- Open a configured folder.
- Check whether a configured folder exists and is accessible.
- Real status for each configured folder.

**Existing capability to reuse**

- Existing folder picker.
- Existing media-root localStorage.
- Existing runtime directory validation and asset-scope allowance.
- Existing safe media/folder opening or path-status capabilities where their
  contracts fit this use.

**Not allowed in normal scope**

- Automatic scanning controls without a functional scanner.
- Folder watchers or scheduler services.
- File copy, move, rename, or deletion.
- Media backup mixed into database backup.

**Stop conditions**

- New filesystem authority or a new Tauri command is required.
- A folder action could escape the selected root or mutate source media.
- Missing or inaccessible folders cannot be reported without crashing.

### 4.6 Backup & Recovery

**Purpose**

Protect and restore the Sakurava database and explicitly allowlisted durable
app-managed assets while clearly excluding external media files and disposable
caches.

**Current legacy behavior**

- The existing manual backup asks the user to select a destination and creates
  a database-only `.sqlite` file through SQLite online backup.
- The existing restore command validates the selected SQLite source inside the
  apply command, creates a database safety backup, and attempts database
  rollback if apply fails.
- The existing Settings confirmation occurs before the command performs its
  validation. There is no separate read-only validation and preview step.
- Raw SQLite backup and restore remain legacy compatibility behavior. They are
  not the final Batch 41.7 package target.

**Allowed visible controls**

- Create a manual backup in Sakurava's default backup folder.
- Open the default backup folder.
- Add an optional note to a backup.
- Enable or disable automatic backup while Sakurava is running.
- Select the approved automatic-backup frequency and rotation count.
- Select and validate a restore package.
- Show a read-only restore summary/preview before confirmation.
- Confirm and execute restore only after successful validation and preview.
- Show the restore source, safety-package path, and result.

**Existing capability to reuse**

- SQLite online backup.
- Restore-source validation and integrity check.
- Pre-restore safety backup and rollback behavior.
- Existing restore-source file dialog and runtime database foundation.

**Default backup location**

Normal manual and automatic backups use:

```text
%APPDATA%\app.sakurava.desktop\backups
```

The user does not choose a destination for normal backup. The runtime must
resolve and create this app-owned directory, constrain package creation,
listing, rotation, and deletion to it, and expose an Open Backup Folder action
that opens only this resolved directory.

**Target package contents**

A conceptual Sakurava backup package contains:

```text
manifest.json
sakurava.sqlite
optional backup-note metadata
explicitly allowlisted durable app-managed assets, only after ownership is defined
```

Original video files, original full image files, user media roots, and
disposable caches are excluded. `thumbnail-cache`, `preview-cache`, and
`generated-cache` are explicitly excluded. File paths referenced by records
remain database metadata; referenced files are not copied.

The physical package format is not yet locked. Implementation must stop until
one of these is explicitly approved:

1. a directory package v1 implemented without a new dependency; or
2. a single archive package with explicit archive-dependency approval.

The UI and documentation must not claim that either format is implemented
before that decision.

**Restore safety flow**

The required flow is:

```text
select -> validate -> preview -> safety package -> confirm -> apply -> result
```

Validation and preview are read-only and must happen before any mutation.
Confirmation is available only after successful validation and preview. The
safety package must cover every component that apply may replace and must be
created before confirmation. Apply must not bypass validation, preview, safety
package creation, or confirmation. The result must report the restored source,
safety-package path, and failure/rollback outcome.

**Automatic backup model**

- No OS scheduler, Windows Task Scheduler, background service, or always-on
  tray process is used.
- Automatic backup runs only while Sakurava is open.
- If a due backup was missed while the app was closed, the next app start may
  create at most one catch-up backup.
- A concurrency lock must prevent unsafe overlap with manual backup, restore,
  import, or other database mutation.
- Rotation applies only to automatic backups and runs only after a successful
  automatic backup.
- Rotation inspects only the default backup folder, trusts package manifest
  metadata rather than filename inference, deletes only automatic backups,
  never deletes manual backups, and refuses every path outside the default
  backup folder.

**Not allowed in normal scope**

- Original/full media-file backup.
- User media-root backup.
- Disposable-cache backup.
- Cloud backup.
- One-click restore.
- Restore without read-only validation, preview, a complete safety package,
  and confirmation.
- An OS scheduler, background service, or always-on tray requirement.
- Automatic rotation of manual backups.

**Stop conditions**

- The physical package format is not approved.
- The durable app-managed asset allowlist or ownership boundary is undefined.
- An archive dependency is required but not approved.
- Restore preview cannot run read-only before mutation.
- The safety package cannot cover every restored component.
- Restore failure cannot preserve or roll back the restored component set as
  far as the approved package contract requires.
- Rotation cannot distinguish trusted manual and automatic packages.
- Any delete or rotation path can escape the default backup folder.
- Auto Backup requires an OS scheduler, background service, or always-on tray.
- Restore can run concurrently with backup, import, or database mutation.
- Raw SQLite compatibility and migration policy is undefined.

### 4.7 Import / Export

**Purpose**

Provide local bulk data exchange and editing through a defined CSV package,
separate from full database backup and restore.

**Allowed visible controls**

- Export the locked CSV package.
- Select an import package.
- Validate and preview all proposed changes.
- Explicitly confirm apply.
- Display a row-level apply report.

**Existing capability to reuse**

- Existing friendly CSV headers and escaping.
- Existing Videos, Images, Performers, and Categories export.
- Existing CSV read/write commands.
- Existing import preview, validation, confirmation, and report patterns.

**Not allowed in normal scope**

- Merge by title or name.
- Implicit delete from a missing row.
- Direct apply without preview and confirmation.
- Raw database IDs or raw JSON as the normal user workflow.
- Media-file transfer.
- Language translation CSV mixed with catalog Import / Export.

**Stop conditions**

- Apply cannot create a safety backup first.
- Credit identity cannot preserve multiple credits for the same performer/work.
- Apply is partial without a locked transaction and failure-reporting policy.
- Date values are ambiguous.
- An import would overwrite unrelated fields.

### 4.8 Performance & Cache

**Purpose**

Provide functional, understandable controls needed for catalogs containing
thousands or tens of thousands of items.

**Allowed visible controls**

- Clear the specifically scoped app-generated cache.
- Show real cache counts or sizes only when they are actually measured.
- Functional performance preferences only when backed by a real implementation.

**Existing capability to reuse**

- Existing scoped cache-clear runtime command.
- Existing protection that excludes source media and catalog records.

**Not allowed in normal scope**

- Static cache-size values.
- Thumbnail, preview, search-index, or lazy-loading controls without a working
  pipeline.
- Broad cleanup of the app-data directory.
- Performance claims not backed by measurement.

**Stop conditions**

- Recursive deletion scope expands.
- Canonical path containment cannot be proven.
- A control requires new indexing, thumbnail, or lazy-loading architecture.

### 4.9 Excluded Support Information

System Info and Diagnostics are not visible Normal Settings sections. Logs were
not added in Batch 41.2 and remain deferred. An end-user log action, version,
runtime path, or similar support tool may be proposed later only when it has a
clear functional use, safe privacy boundaries, and explicit approval for any
new runtime or Tauri command.

## 5. Storage Decisions

The Normal Settings storage boundaries are locked as follows:

| Domain | Storage decision |
| --- | --- |
| Appearance | Versioned localStorage keys unless a later approved migration changes this. |
| Language | Existing selected-language, custom-language, removed-bundled-language, and override localStorage keys. Enforce a maximum of 25 installed custom languages without destructive truncation. |
| Catalog Preferences | Versioned localStorage for preference toggles and remembered per-catalog state. Invalid or obsolete values fall back safely. |
| Media folders | Existing localStorage media-root storage unless a later filesystem decision is explicitly approved. Runtime scope must be restored defensively. |
| Backup & Recovery | Versioned backup settings plus packages under `%APPDATA%\app.sakurava.desktop\backups`. Packages contain the database, manifest, optional note, and only explicitly allowlisted durable app-managed assets. Original media, user media roots, and disposable caches are excluded. Raw user-selected SQLite files are legacy compatibility, not the final Batch 41.7 target. |
| Import / Export | A local CSV folder or ZIP package containing the locked CSV files and `manifest.json`. |
| Performance & Cache | Existing app-data cache folders operated on through the existing scoped runtime command. |

Normal Settings does not require a Settings database table or migration. A
future proposal for a Settings table, app configuration file, or migration must
stop and obtain explicit approval, including its backup/restore implications.

## 6. UI Normalization Decisions

Batch 41.2 Safe UI Shell Normalization is complete. Its final mockup is strong
structural and UX direction for the Settings shell:

- a compact control panel rather than a documentation layout;
- eight stacked section cards;
- a Settings search box at the upper right;
- a pink icon and title in every section header;
- compact label/value/control rows;
- a reset icon visual shell at the lower right of every card; and
- Sakurava components, tokens, spacing, and interaction patterns rather than an
  arbitrary native-looking clone.

The visible sections are Overview, Appearance, Language, Catalog Preferences,
Library & Media, Backup & Recovery, Import / Export, and Performance & Cache.
Viewer Preferences, System Info, and Diagnostics remain absent.

A disabled or read-only visual shell is allowed only to preserve this approved
structure. It must not store data, mutate runtime state, trigger an operation,
or claim to be functional. It must not use `MVP`, `Planned`, `Soon`, `Batch`,
`dummy`, or `placeholder` as visible status labels. Each shell becomes
functional only in its assigned, separately approved sub-batch.

Logs were intentionally not added in Batch 41.2. Logs may appear later only
when an existing safe end-user action can be reused or a new runtime/Tauri
command and its privacy boundary receive explicit approval.

## 7. Capability Decisions by Section

| Section | Keep/reuse | Hide/remove until functional | Requires approval | Suggested implementation batch |
| --- | --- | --- | --- | --- |
| Overview | Real current status and compact shell | Fake metrics, roadmap, and release-state rows | Any shortcut into a data-risk action | 41.2 complete |
| Appearance | Light/Dark and approved read-only shells | Any shell presented as functional | Broad token rewrite or new persistence layer | 41.3 |
| Language | Context, fallback, custom CSV, overrides | In-app editor and extra conceptual groups | CSV compatibility change or storage migration | 41.4 |
| Catalog Preferences | Existing per-catalog session-state model and read-only shell | Persistence claims before implementation | Remember/reset contract expansion | 41.5 |
| Library & Media | Picker, root storage, scope validation | Scanner, watcher, mutation controls | New filesystem authority or command | 41.6 |
| Backup & Recovery | SQLite backup, restore integrity validation, database safety backup, and rollback foundation | Destination-picker backup as the final target; OS scheduler/service; unapproved package claims | Package format, durable asset allowlist, new scoped runtime commands, archive dependency, and raw SQLite compatibility | 41.7.0-41.7.5 |
| Import / Export | Existing CSV foundation and staged preview | Unsupported entities/package claims | All implementation work in this data-risk section | 41.8 |
| Performance & Cache | Scoped cache clear | Unmeasured size and unavailable pipelines | Expanded recursive deletion or new performance architecture | 41.9 |

## 8. Data-Operation Decisions

### 8.1 Backup & Recovery

- The user-selected database-only `.sqlite` artifact is legacy compatibility,
  not the final Batch 41.7 package.
- Normal backup creates a package under
  `%APPDATA%\app.sakurava.desktop\backups` without a destination picker.
- The target package contains `manifest.json`, `sakurava.sqlite`, optional note
  metadata, and only explicitly allowlisted durable app-managed assets.
- Original/full media, user media roots, and disposable caches are excluded.
- Referenced media paths remain database metadata only.
- Restore must follow:
  `select -> validate -> preview -> safety package -> confirm -> apply -> result`.
- Validation and preview must be read-only.
- The safety package must cover every component that apply may replace.
- Restore failure must preserve or roll back the approved restored component
  set as far as the locked package contract requires.
- The result must report the restore source, safety-package location, restored
  components, and failure/rollback outcome.
- Automatic backup runs only while Sakurava is open, with at most one catch-up
  backup on next start.
- Automatic rotation is confined to the default backup folder, runs only after
  successful automatic backup, uses trusted manifest metadata, and never
  deletes manual packages.

### 8.2 Import / Export Package

The target package contains:

```text
manifest.json
videos.csv
images.csv
performers.csv
credits.csv
categories.csv
glossary.csv
```

The package may be represented as a selected folder or a ZIP file only after the
exact package handling is approved. Both representations must use the same
manifest and validation rules.

Import rules:

- Parse and validate without mutation.
- Show a complete preview before apply.
- Create a database safety backup before apply.
- Require explicit confirmation.
- Same ID means update.
- New ID means create.
- An invalid row is skipped and included in the report.
- A missing row is not a delete.
- Normal scope does not merge by title, performer name, or other display text.
- Apply must preserve fields not represented by the imported change.
- Apply must have a locked transactional or explicitly reported partial-apply
  policy before implementation.

Credit and performer rules:

- Preserve multiple credits for the same performer/work.
- Do not add a uniqueness constraint that collapses multiple roles.
- Credit identity must distinguish separate credit rows.
- `performers.csv` exports only manual aliases stored in `aliasesJson`.
- Auto role-derived Known Names must not be exported or imported as manual
  aliases.
- Import must not mutate `aliasesJson` from derived display names.

Language CSV remains separate from catalog Import / Export. It translates only
static application UI keys and must never translate or rewrite user data.

Categories must remain category labels/metadata. Character names must not be
stored or imported as Categories.

Credits, Roles, and Known Names behavior remains protected by the closed Batch
39 decisions. Source Links external-browser behavior remains protected by the
closed Batch 40 decisions. No Settings sub-batch may change either behavior as
an incidental side effect.

## 9. Date Parsing Decision

Export uses canonical deterministic formats:

```text
YYYY-MM-DD
YYYY-MM-DDTHH:mm:ss
YYYY-MM-DDTHH:mm:ss+07:00
```

Use `YYYY-MM-DD` for date-only fields. Use the timestamp forms only for fields
whose contract includes a time. An offset must be preserved when an offset is
part of the exported value.

Import may accept multiple documented date formats, but parsing must be
deterministic and must not depend on the operating-system locale.

Ambiguous dates such as `03/04/2026` must not be guessed silently. The preview
must warn or block the row and require the user to provide an unambiguous value.
Format precedence and normalization must be documented and tested before apply
is enabled.

If reliable parsing requires a new dependency, implementation must stop and
request explicit approval before adding it.

## 10. Risk and Stop-Condition Table

| Risk | Locked response / stop condition |
| --- | --- |
| Schema or migration needed | Stop. Normal Settings assumes no schema change; request explicit approval. |
| New Tauri command needed | Stop and document the command, authority, validation, and alternatives before approval. |
| Restore overwrite risk | Do not apply without read-only validation, preview, a safety package covering all restored components, confirmation, and failure recovery. |
| CSV partial apply or transaction risk | Lock atomic versus reported partial-apply semantics before implementation. |
| Date parsing ambiguity | Warn or block; never infer silently or use PC locale. |
| Credit identity and multiple-role risk | Preserve distinct credit rows; do not add performer/work uniqueness. |
| `aliasesJson` versus role-derived Known Names | Export/import manual aliases only; derived names remain display-only. |
| Media-folder filesystem risk | Validate roots, keep access scoped, and do not mutate media files. Stop for expanded authority. |
| Cache recursive-delete risk | Limit deletion to canonical approved cache folders under app data. Stop if scope expands. |
| System path/log privacy risk | Do not expose paths or logs until content, redaction, and user value are approved. |

## 11. Batch Sequencing After 41.1

The direct Batch 41 sequence is:

```text
41.2  Safe UI Shell Normalization (complete)
41.2.1 Settings Shell Decision Amendment (docs only)
41.3  Appearance Functionalization
41.4  Language
41.5  Catalog Preferences
41.6  Library & Media
41.7.0 Backup & Recovery Audit + Decision Amendment
41.7.1 Runtime package foundation
41.7.2 Restore validation and preview
41.7.3 Package restore safety
41.7.4 Settings UI and manual backup
41.7.5 App-open automatic backup
41.8  Import / Export
41.9  Performance & Cache
```

Batch 41.7 and Batch 41.8 are data-risk sections. Each requires explicit user
approval before implementation and must use the safety and stop conditions
locked in this document.

Logs, System Info-like values, and other support tools are future/optional.
They are outside the visible Normal Settings architecture and require explicit
approval, including approval for any new runtime/Tauri command and privacy
contract.

This sequence is not authorization to implement a later sub-batch. Each
sub-batch must remain independently scoped and reviewed.

## 12. Verification and Acceptance

This decision batch is documentation-only.

Required verification:

```powershell
git status --short --branch
git diff --check
```

Acceptance criteria:

- Only this architecture decision document is added or modified.
- No Settings UI, component, hook, storage, runtime, Tauri, Rust, schema,
  database, dependency, or test file changes.
- The eight-section visible Normal Settings structure is explicit.
- The visual-shell exception is non-functional, non-persistent, and clearly
  separated from functional settings.
- Storage boundaries and data-operation safety requirements are explicit.
- Stop conditions require approval before risk or scope expands.
- Backup/Restore and Import/Export behavior or semantics do not change without
  approval.
- No schema, database, migration, Tauri, or runtime change is implied.
- Credits/Roles/Known Names and Source Links behavior remain unchanged.
- No commit is created before user review.
