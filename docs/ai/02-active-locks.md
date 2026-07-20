# Sakurava Active Locks

## Purpose

This file contains active product, compatibility, release, and safety contracts that must not be changed silently.

These locks remain authoritative until they are explicitly replaced or removed through an approved decision.

This file must not contain:

* temporary batch status;
* implementation plans;
* session history;
* general workflow rules already defined in the Operating Contract;
* unapproved assumptions;
* technical implementation claims that have not been verified.

A product contract recorded here does not prove that the current repository already complies with it.

When current implementation compliance has not been freshly verified, classify it as:

`UNKNOWN`

Before changing a lock:

1. explain the proposed change and its impact;
2. obtain operator approval when required;
3. update the relevant technical decision document;
4. update Current State and Active Batch when affected;
5. record the change in the Session Ledger.

Before creating a Codex prompt, include every applicable lock ID under:

`Protected Contracts`

---

## LOCK-UI-001 — Preserve Existing UI and UX

**Status:** ACTIVE

Unless explicitly approved, implementation must preserve:

* the existing application shell;
* layout structure;
* visual hierarchy;
* established design language;
* input types;
* interaction behavior;
* user workflow;
* existing functional states.

A technical fix must not introduce an unrequested redesign.

Do not change UI or UX merely because another design appears cleaner or more modern.

Meaningful UI or UX changes require:

* a clear product reason;
* operator approval;
* explicit inclusion in the Active Batch scope.

Approved controlled polish does not authorize unrestricted redesign.

---

## LOCK-UI-002 — Forms Remain Full Pages

**Status:** ACTIVE

Existing Sakurava Forms must remain full-page workflows.

Do not convert existing Forms into:

* modal dialogs;
* drawers;
* popovers;
* overlays;
* inline expandable panels;

without a separate explicit product decision.

Allowed Form improvements may include:

* shared page layout;
* spacing;
* typography;
* component consistency;
* validation states;
* loading states;
* error states;
* disabled states;
* success feedback;
* focus behavior;
* keyboard navigation;
* unsaved-change protection when relevant.

Allowed polish must preserve:

* current navigation behavior;
* current workflow;
* existing validation meaning;
* existing Save and Cancel behavior;
* existing data behavior.

---

## LOCK-UI-003 — User-Controlled Motion

**Status:** ACTIVE

Interface animation and motion must remain lightweight, optional, and non-blocking.

When animation behavior is introduced or standardized:

* users must be able to disable interface animations through Settings;
* the preference must persist after restart;
* the preference must be included in Backup and Restore;
* reduced-motion operating-system preferences must be respected where technically applicable;
* disabling animations must not remove functionality;
* animations must not delay required actions;
* animations must not require a heavy framework without an approved technical reason.

Do not introduce decorative motion that materially increases resource use or reduces accessibility.

---

## LOCK-TRANSLATION-001 — Protected Translation Behavior

**Status:** ACTIVE

Translation architecture must not be changed outside an approved translation scope.

Protected behavior:

* English is the core language.
* English is not removable.
* Existing approved English editing and reset behavior must remain until replaced by an approved decision.
* Indonesian and other additional languages are user-managed.
* Existing removable behavior for user-managed languages must remain until replaced by an approved decision.
* CSV translation support must remain available.
* Existing working translation data must not be discarded.
* Unrelated batches may add only the translation keys required by their own feature.
* Broad translation refactoring is prohibited outside the approved translation batch.

This lock may be replaced only after:

* current implementation is audited;
* desired behavior is approved;
* fallback behavior is defined;
* storage and migration requirements are defined;
* CSV compatibility is defined;
* UI behavior is defined;
* verification requirements are approved.

Translation is corrective stabilization work.

It must not silently expand into unrelated Settings, UI, package, or repository redesign.

---

## LOCK-MEDIA-001 — Managed Mini Images Are Protected Catalog Assets

**Status:** ACTIVE

Managed mini images are local catalog assets created and managed by Sakurava.

They are not disposable cache.

Protected product behavior:

* managed mini images are generated automatically when relevant media is added;
* managed mini images provide a local visual representation of externally referenced media;
* managed mini images remain useful when the original source is unavailable;
* managed mini images must be included in `.skv` Backup;
* managed mini images must survive Restore;
* a generic Clear Cache action must not delete managed mini images;
* failed regeneration must not delete or replace the last valid mini image;
* replacement must occur only after a newly generated image has been validated;
* Restore must not automatically discard managed mini images because the external source cannot be found;
* application startup must not automatically regenerate all managed mini images.

Full external media is not converted into Sakurava-managed original media through this lock.

Full external media remains referenced through:

* path;
* stream;
* URL;
* source identifier;
* related metadata.

Final dimensions, image profiles, format, encoding quality, storage location, and naming remain subject to a dedicated audit and approved implementation scope.

---

## LOCK-BACKUP-001 — Protected `.skv` Backup Content Boundary

**Status:** ACTIVE

The existing Backup extension remains:

`.skv`

The roadmap does not introduce a new extension.

The `.skv` package represents a Backup of data and assets managed by Sakurava.

Subject to implementation audit, the protected product direction is that `.skv` Backup includes:

* catalog database;
* Work records;
* Image records;
* Performer records;
* Credits;
* Categories;
* Glossary;
* metadata;
* relationships;
* public references;
* media source references;
* managed mini images;
* Settings;
* explicit catalog-feature configuration;
* saved or persistent filters;
* user-managed translations;
* required application configuration;
* package compatibility information;
* integrity information when implemented.

The `.skv` Backup must not be redefined to require full externally referenced media.

Intended exclusions include:

* full external video files;
* full external image files;
* disposable decode cache;
* temporary metadata cache;
* temporary logs;
* temporary exports;
* build output;
* development evidence;
* generated test artifacts.

Do not:

* change the `.skv` extension silently;
* change internal package compatibility silently;
* omit managed mini images from the intended full catalog Backup;
* include full external media without a separate product decision;
* treat a filename extension as sufficient package validation;
* weaken Restore safety to simplify package handling.

Any internal package change remains subject to:

* `LOCK-PACKAGE-001`;
* current-format audit;
* compatibility analysis;
* package-version decision;
* migration decision;
* old-package testing;
* current-package testing;
* corruption testing;
* rollback planning.

---

## LOCK-FEATURE-001 — Non-Destructive Explicit Catalog Features

**Status:** ACTIVE

Explicit catalog features may be enabled or disabled through Settings.

Initial examples include:

* Cup Size;
* three Body Size measurements;
* other separately approved catalog fields.

Protected behavior:

* enabling a feature makes its approved field and filter available;
* disabling a feature hides its approved field from normal UI use;
* disabling a feature hides its related filter;
* disabling a feature must not delete stored values;
* disabling a feature must not clear stored values;
* disabling a feature must not migrate stored values into another field;
* disabling a feature must not remove values from Backup;
* re-enabling a feature restores access to the previous stored values;
* feature state must persist after restart;
* feature state must survive application upgrade;
* feature state must be included in Backup and Restore;
* stable internal feature keys must not depend on translated labels.

The feature system must remain explicit.

Do not expand it into:

* a plugin system;
* a free-form custom-field builder;
* a database schema editor;
* a remote feature-flag service;
* per-Work feature configuration;
* account-based permissions;
* parental-control behavior;

without a separate product decision.

Import and Export behavior for disabled fields must not be changed silently.

---

## LOCK-CREDITS-001 — Credit Type Remains Free Text

**Status:** ACTIVE

Credit Type must remain the free-text field:

`creditTypeText`

Do not:

* convert it into a managed Category dropdown;
* map it automatically to a Category;
* merge it with `creditedAs`;
* remove its free-text behavior;
* change its input type;
* replace existing values through migration;

without an explicit product decision.

---

## LOCK-CREDITS-002 — Credits Remain Independent Records

**Status:** ACTIVE

Each Credit is an independent first-class record.

Protected behavior:

* one Credit equals one record;
* one spreadsheet row represents one Credit;
* Credits for the same Performer remain separate;
* logical duplicate Credits may remain separate;
* Credits must not be collapsed automatically;
* synthetic `credit_legacy` records must not be created.

Technical database IDs are internal implementation details and are not public Credit identities.

---

## LOCK-CREDITS-003 — Public R Ref Identity

**Status:** ACTIVE

Public R Ref is the authoritative spreadsheet identity for Credits.

Protected behavior:

* Add allocates a new R Ref.
* Spreadsheet Add cannot force an R Ref.
* Update resolves only through an authoritative existing R Ref.
* Delete resolves only through an authoritative existing R Ref.
* Update preserves the existing R Ref.
* Delete does not reduce the high-water counter.
* Deleted R Refs are not reused.
* Failed transactions must not commit partially consumed R Ref state.
* Technical database IDs must not be exported as spreadsheet identities.

Any change to R Ref format, allocation, reuse, resolution, or counter behavior requires a dedicated approved decision.

---

## LOCK-CREDITS-004 — Five Credits per Performer

**Status:** ACTIVE

The maximum remains:

`Five Credits per Performer within the applicable Work relationship`

Protected behavior:

* the limit must be enforced on the final planned state;
* Delete may be evaluated before Add during final-state validation;
* spreadsheet Apply must not bypass the limit.

Do not increase, remove, or reinterpret this limit without a separate approved product decision.

---

## LOCK-IMPORTEXPORT-001 — Credits Spreadsheet Contract

**Status:** ACTIVE

Credits export supports:

* XLSX;
* CSV.

Protected structure:

* one Credit equals one spreadsheet row;
* XLSX sheet name is `Credits`;
* public Sakurava references are used;
* technical database IDs are excluded;
* same-performer Credits remain separate;
* logical duplicates are not collapsed.

The exact headers and order are:

1. Action
2. Sakurava Ref
3. Work Type
4. Work Ref
5. Performer Ref
6. Character / Role
7. Original Character
8. Credited As Mode
9. Credited As
10. Credit Type
11. Role Importance
12. Character Mode
13. Billing Order
14. Note

Single-category filenames are:

* `skv-cre-{YYYYDDMM}-{HHMMSS}.xlsx`
* `skv-cre-{YYYYDDMM}-{HHMMSS}.csv`

The stable internal Credits code is:

`cre`

The internal code must not depend on translated interface text.

Changes to headers, header order, sheet name, filename pattern, or identity fields require explicit approval.

---

## LOCK-IMPORTEXPORT-002 — Safe Spreadsheet Apply

**Status:** ACTIVE

Spreadsheet mutation must preserve:

* Preview before Apply;
* blocking validation for invalid input;
* stale Preview protection;
* final-state capacity validation;
* required safety backup;
* one atomic Apply transaction;
* rollback of all operations on failure;
* final integrity validation before transaction completion;
* no partial committed records;
* no partial committed counter allocation.

Invalid or blocked input must not create hidden mutation.

Codex must not weaken these protections to simplify implementation.

---

## LOCK-REF-001 — Public References Only

**Status:** ACTIVE

Spreadsheet-facing identity and relationships must use public Sakurava references.

Do not:

* expose technical database IDs;
* export technical IDs as identities;
* use technical IDs as authoritative spreadsheet references;
* allow spreadsheet Add to select internal identities;
* silently change public-reference semantics.

Any public-reference change is high risk and requires a dedicated approved scope.

---

## LOCK-DATA-001 — No Live AppData Mutation Testing

**Status:** ACTIVE

Data-sensitive implementation and manual smoke must use a disposable application root.

Required protections:

* disposable-path validation;
* rejection of live AppData collisions;
* no silent fallback to live AppData;
* debug path overrides isolated from release behavior;
* safety backup when required;
* restart verification when persistence is relevant.

Do not perform destructive or mutation-based smoke testing against the operator’s real application data.

Do not claim live-data safety without evidence.

---

## LOCK-PACKAGE-001 — Package and Compatibility Stability

**Status:** ACTIVE

Unrelated batches must not change:

* application version;
* `.skv` backup extension;
* backup package format;
* import/export package format;
* compatibility version behavior;
* stored-data compatibility assumptions.

A dedicated approved release, package, or migration batch is required for these changes.

Before changing `.skv` internals:

* audit the current package;
* identify existing package versions;
* identify existing package compatibility behavior;
* determine whether migration is required;
* define old-package support;
* define corruption behavior;
* define failure behavior;
* define rollback behavior;
* verify existing-user data safety.

Keeping the same `.skv` extension does not authorize an incompatible internal format change.

---

## LOCK-DEPENDENCY-001 — Dependency Work Is Separate

**Status:** ACTIVE

Dependency upgrades and security remediation must use a dedicated batch.

Do not mix dependency changes into unrelated:

* feature work;
* UI polish;
* translation work;
* Backup or Restore work;
* repository cleanup;
* packaging work.

Do not run:

`npm audit fix --force`

without:

* dependency analysis;
* impact assessment;
* approved scope;
* focused regression tests;
* production build verification;
* rollback planning.

A security warning does not automatically authorize broad dependency replacement.

---

## LOCK-SECURITY-001 — Automated Findings Require Controlled Triage

**Status:** ACTIVE

Automated GitHub findings must be inspected and classified before remediation.

Possible findings include:

* dependency alerts;
* code scanning;
* secret scanning;
* GitHub Actions warnings;
* deprecated Actions;
* workflow failures;
* repository security recommendations;
* code-quality findings.

Each finding must be evaluated for:

* current status;
* severity;
* reachability;
* production relevance;
* development-only relevance;
* false-positive possibility;
* affected files;
* blast radius;
* correct remediation batch;
* required verification;
* rollback risk.

Do not:

* apply every automated recommendation automatically;
* treat all warnings as release blockers;
* dismiss critical findings without evidence;
* mix broad security remediation into unrelated work;
* use force-fix commands as a substitute for analysis.

An exposed secret, compromised workflow, or active critical reachable vulnerability may override the normal roadmap and require a dedicated recovery or security stage.

---

## LOCK-EVIDENCE-001 — Manual Smoke Evidence Remains Local

**Status:** ACTIVE

The `manual-smoke/` directory is local verification evidence.

It must remain untracked unless an explicit decision states otherwise.

Do not:

* stage it with broad Git commands;
* commit runtime databases;
* commit temporary exports;
* commit generated smoke artifacts;
* delete it during normal closure without operator approval.

Repository cleanup must not treat protected local evidence as ordinary generated waste.

---

## LOCK-PROJECTOS-001 — Project OS Authority Files Are Tracked

**Status:** ACTIVE

Project continuity must be represented in the repository rather than depending on chat history or one local machine.

The following authority files must be tracked:

- `SAKURAVA-CHATGPT-BOOT-PROMPT.md`;
- `docs/ai/00-operating-contract.md`;
- `docs/ai/01-current-state.md`;
- `docs/ai/02-active-locks.md`;
- `docs/ai/03-active-batch.md`;
- `docs/ai/04-session-ledger.md`;
- `docs/ai/05-model-routing.md`;
- `docs/ai/06-feedback-log.md`;
- `docs/ai/07-master-roadmap.md`.

Protected behavior:

- stage only explicitly approved Project OS paths;
- do not use broad staging commands when local evidence is present;
- do not include `manual-smoke/`, runtime databases, temporary exports, logs, generated smoke artifacts, build output, or dependency directories;
- Project OS updates must distinguish recorded state from fresh evidence;
- historical Session Ledger entries must remain historical and must not be rewritten merely because the current status changed;
- a Project OS commit must not include application source, dependency, workflow, package, or runtime changes unless separately approved.

The tracking policy does not make every documentation file authoritative. Only approved Project OS and decision documents receive authority through their defined ownership.

---

## Lock Review

Before repository audit or implementation:

1. identify the locks relevant to the request;
2. verify that the approved scope does not conflict with them;
3. include applicable lock IDs in the Codex prompt when Codex is used;
4. distinguish product contracts from current implementation evidence;
5. stop and request a decision when a conflict exists;
6. do not treat current code as permission to override a lock;
7. do not treat a model recommendation as permission to override a lock;
8. do not weaken a lock to simplify implementation.

Before package, migration, Restore, media, or feature-toggle work, review at minimum:

* `LOCK-UI-001`;
* `LOCK-MEDIA-001`;
* `LOCK-BACKUP-001`;
* `LOCK-FEATURE-001`;
* `LOCK-DATA-001`;
* `LOCK-PACKAGE-001`;
* `LOCK-DEPENDENCY-001`;
* `LOCK-EVIDENCE-001`.

Before Translation work, review at minimum:

* `LOCK-UI-001`;
* `LOCK-UI-002`;
* `LOCK-UI-003`;
* `LOCK-TRANSLATION-001`;
* `LOCK-DATA-001`;
* `LOCK-PACKAGE-001`;
* `LOCK-DEPENDENCY-001`;
* `LOCK-EVIDENCE-001`.

Before repository or GitHub remediation, review at minimum:

* `LOCK-DEPENDENCY-001`;
* `LOCK-SECURITY-001`;
* `LOCK-EVIDENCE-001`;
* `LOCK-PROJECTOS-001`.

A lock remains active until the Project OS explicitly records its replacement or removal.
