# Sakurava Active Batch

## 1. Batch Metadata

batch: 42.2  
title: Translation Containment  
status: ACTIVE  
phase: IMPLEMENTATION_PLANNED  
current_stage: 42.2D — Settings and Recovery Integration  
current_mode: READY_PENDING_SEPARATE_APPROVAL  
stage_1_status: COMPLETE  
stage_1_verdict: AUDIT_COMPLETE_WITH_CRITICAL_FINDING  
audit_status: COMPLETE_REPORTED  
audit_allowed: false  
plan_status: COMPLETE_REPORTED  
plan_allowed: false  
implementation_status: READY_PENDING_SEPARATE_APPROVAL  
implementation_allowed: false  
tests_and_builds_allowed: false  
vite_dev_server_allowed: false  
dependency_remediation_allowed: false  
risk_level: HIGH  

starting_branch: main  
starting_baseline: 528246899386f960a1cce0b6f4bc4cba03b5315b  
starting_baseline_status: REPORTED_SYNCHRONIZED_BY_CODEX_CLOSURE  
audited_baseline: 1e0d6dd13e55f36f6bae78d32fbeb26fd56c6b38  
audited_baseline_status: FRESHLY_VERIFIED_AND_SYNCHRONIZED  
starting_git_state_freshly_verified_for_batch_42_2: false  
first_audit_attempt: STOPPED_AT_GIT_PREFLIGHT  
stop_reason: APPROVED_PROJECT_OS_CHANGES_NOT_YET_COMMITTED  
translation_source_inspected: true  
first_attempt_translation_source_inspected: false  
recovery_status: RESOLVED_BY_THIS_DOCUMENTATION_COMMIT  
interposed_prerequisite: Batch 42.13A — Targeted Vite Security Prerequisite (COMPLETED)  
vite_security_prerequisite: SATISFIED  
targeted_vite_high_advisory: REMOVED  
full_batch_42_13: DEFERRED  
strategy: CSV_ENGINE_ONLY  
selected_strategy: CSV_ENGINE_ONLY  
completed_sub_stage: 42.2C — Translation CSV Compatibility and English Baseline Editing  
completed_sub_stage_status: COMPLETED_REPORTED  
implementation_commit: eb0c377f6d412b9ee40c96bb42cbe53a700cebcd  
focused_tests: 146 passed  
production_build: PASSED  
caller_integration: NONE  
runtime_behavior_change: NONE  
migration: NONE  
next_action: review 42.2C results and separately approve 42.2D implementation  

previous_batch: 42.1  
previous_batch_title: GitHub and Repository Health Triage  
previous_batch_status: COMPLETED_AND_CLOSED  
previous_batch_closure_commit: 528246899386f960a1cce0b6f4bc4cba03b5315b  

historical_corrective_batch: 41.9  
historical_corrective_batch_status: COMPLETED_AND_CLOSED  
release_completion_batch: 42.11  

approved_scope: TRANSLATION_CONTAINMENT_PRODUCT_DIRECTION_AND_PLAN  
master_roadmap: docs/ai/07-master-roadmap.md  
last_updated: 2026-07-22  

completed_42_2b: 42.2B — English-Only Language Identity and Resolution  
completed_42_2b_status: COMPLETED_REPORTED  
completed_42_2b_commit: 4cdeb2dcd304f2b24d23fc571e9d4c21e2aeff73  
completed_42_2b_focused_tests: 98 passed  
completed_42_2b_production_build: PASSED  
completed_42_2b_migration: NONE  
completed_42_2b_automatic_recovery: NONE  
completed_42_2b_csv_work: NONE  
completed_42_2b_settings_work: NONE  
completed_42_2b_runtime_behavior: ENGLISH_ONLY_IDENTITY_AND_RESOLUTION_REPORTED  

completed_42_2c: 42.2C — Translation CSV Compatibility and English Baseline Editing  
completed_42_2c_status: COMPLETED_REPORTED  
completed_42_2c_commit: eb0c377f6d412b9ee40c96bb42cbe53a700cebcd  
completed_42_2c_focused_tests: 146 passed  
completed_42_2c_production_build: PASSED  
completed_42_2c_migration: NONE  
completed_42_2c_automatic_recovery: NONE  
completed_42_2c_settings_work: NONE  
completed_42_2c_visible_frontend_change: NONE  
completed_42_2c_runtime_behavior: CSV_ENGINE_ONLY_REPORTED  

---

## 2. Purpose

This file records the active state of Batch `42.2 — Translation Containment`.

Batch `42.2` continues only the unresolved Translation work that remained after Batch `41.9` and the approved product decisions recorded after the Stage 1 audit.

It does not reopen or repeat completed Batch `41.9` corrective work without evidence of regression.

Its Stage 1 audit established:

- the current Translation architecture;
- current storage and persistence behavior;
- English core behavior;
- user-managed language behavior;
- fallback and missing-key behavior;
- CSV compatibility;
- Settings integration;
- data-safety and compatibility requirements;
- whether any migration or minimum stabilization is actually required.

The approved product direction is now:

- English `en` is the sole built-in, installed-by-default, default, source, and fallback language;
- Indonesian `id` and every other non-English language are user-managed and removable;
- English is non-removable, CSV-editable, and resettable to the bundled baseline;
- Translation covers application-controlled frontend UI only and never user-entered or stored catalog data;
- one normalized language code represents exactly one identity, with recognized and custom codes supported;
- existing language metadata, overrides, selection, and values require non-destructive compatibility handling;
- every future feature must be translation-ready from initial implementation;
- final CSV and release-facing completion remain assigned to Batch `42.11`.

Batch `42.2` is corrective containment, not Translation release completion.

Release-facing Translation completion remains assigned to Batch `42.11`.

---

## 3. Historical Boundary

### Completed Batch 41.9 Work

Batch `41.9 — Translation Containment and Architecture Baseline` is `COMPLETED_AND_CLOSED`.

Its completed corrective purpose was to repair the Translation section changed by Codex outside approved scope and restore the approved Translation boundary.

Completed Batch `41.9` work must remain historical and must not be recreated as new work.

### Unresolved Work Assigned to Batch 42.2

Batch `42.2` may address only unresolved questions that require fresh repository evidence or an explicit product decision.

Examples include:

- actual current architecture mapping;
- persistence and storage verification;
- fallback and missing-key behavior;
- CSV compatibility;
- compatibility and migration requirements;
- minimum evidence-based containment.

### Work Reserved for Batch 42.11

Batch `42.11 — Translation Release Completion` retains:

- remaining release-critical UI coverage;
- final shared-state Translation coverage;
- final CSV regression;
- final restart persistence verification;
- release-facing completion after shared UI stabilization.

Batch `42.2` must not absorb Batch `42.11`.

### Stage 1 Accepted Findings

The static audit completed without repository, source, data, live AppData, test, build, server, dependency, or Git-ref mutation. No active destructive migration or actual current user-data corruption was proven.

Accepted containment findings are:

- built-in Indonesian conflicts with the approved English-only identity boundary;
- existing custom `id` data must survive removal of built-in treatment;
- non-English CSV round trips and known historical CSV formats require safe compatibility handling;
- Translation persistence is currently non-atomic and must report failures accurately;
- malformed or legacy language data must be preserved until compatibility is resolved;
- Translation localStorage is outside the current Backup/package boundary, which remains assigned to Batches `42.6` and `42.7`.

### Stage 2 Plan-Only Required Output

Stage 2 must define, without implementation:

- exact source files and sub-stage sequencing;
- the English-only built-in transition and non-destructive existing `id` compatibility;
- language-code normalization and one-code/one-identity rules;
- English CSV edit/reset behavior;
- the frontend UI-only Translation boundary and user-data exclusion;
- the future-feature translation-ready contract;
- CSV round-trip and historical-format adapters;
- atomic persistence, accurate errors, and rejected/raw-data preservation;
- focused tests, disposable verification, rollback, and stop conditions.

Stage 2 does not authorize implementation, tests, builds, runtime verification, migration, dependency remediation, package changes, or Backup changes.

---

## 4. Current Objective

Produce the smallest safe Stage 2 Translation containment implementation plan under the approved product direction.

The audit must identify current behavior and unresolved risks without modifying:

- source code;
- Translation data;
- Settings;
- database state;
- package metadata;
- dependencies;
- Backup or Restore behavior;
- UI structure.

The plan must distinguish:

- `PROVEN` current behavior;
- `REPORTED` historical behavior;
- `INFERRED` architecture conclusions;
- `UNKNOWN` unresolved areas.

---

## 5. Current Stage

### Stage 0 — Scope Definition

**Status:** COMPLETE_REPORTED  
**Mode:** DISCUSSION  

The operator approved:

- audit goal;
- In Scope and Out of Scope;
- applicable Active Locks;
- architecture, storage, persistence, key-resolution, CSV, Settings, compatibility, and migration evidence areas;
- data-safety boundaries;
- historical boundaries for Batches `41.9`, `42.2`, and `42.11`;
- evidence classification;
- required report format;
- stop conditions;
- Definition of Done.

### Stage 1 — Read-Only Translation Architecture Audit

**Status:** COMPLETE  
**Verdict:** AUDIT_COMPLETE_WITH_CRITICAL_FINDING  
**Mode:** AUDIT ONLY (closed)  
**Audit Allowed:** No  
**Implementation Allowed:** No  
**Tests and Builds Allowed:** No  
**Vite Dev Server Allowed:** No  

Stage 1 completed as a static read-only audit from baseline `1e0d6dd13e55f36f6bae78d32fbeb26fd56c6b38`. No implementation or runtime verification occurred.

### Stage 2 — Translation Containment Implementation Plan

**Status:** COMPLETE  
**Mode:** PLAN ONLY (closed)  
**Plan Allowed:** No  
**Implementation Allowed:** No  
**Tests and Builds Allowed:** No  
**Vite Dev Server Allowed:** No  
**Dependency Remediation Allowed:** No  

Stage 2 may define exact files, sequencing, compatibility, rollback, stop conditions, focused tests, and disposable verification. It must not implement or execute them.

### Stage 42.2A — Lossless Translation Storage Foundation

**Status:** READY_PENDING_SEPARATE_APPROVAL  
**Mode:** FOUNDATION_ONLY  
**Implementation Allowed:** No  
**Tests and Builds Allowed:** No  
**Runtime Verification Allowed:** No  

The foundation-only boundary was a new storage primitive and dedicated focused tests only. It preserves current public runtime APIs and remains unused by existing runtime callers. No language-registry, CSV, Settings, runtime Translation, database, migration, Backup, package, dependency, or runtime execution change occurred.

### Stage 42.2B — English-Only Language Identity and Resolution

**Status:** READY_PENDING_SEPARATE_APPROVAL  
**Mode:** READY_PENDING_SEPARATE_APPROVAL  
**Implementation Allowed:** No  
**Tests and Builds Allowed:** No  
**Runtime Verification Allowed:** No  
**Dependency Remediation Allowed:** No  

Future planning must preserve English as the sole built-in/default/source/fallback language, keep Indonesian and all other non-English languages user-managed, preserve existing custom language data non-destructively, and maintain one normalized language code per identity. This closure does not authorize caller integration or behavior changes; 42.2B requires separate approval and its own controlled implementation prompt.

---

### Completed Stage 42.2B — English-Only Language Identity and Resolution

**Status:** COMPLETED_REPORTED  
**Implementation Commit:** `4cdeb2dcd304f2b24d23fc571e9d4c21e2aeff73`  
**Focused Tests:** 98 passed  
**Production Build:** Passed  
**Migration:** None  
**Automatic Recovery:** None  
**CSV Work:** None  
**Settings Work:** None  

English is the sole active built-in, default, source, and fallback language. Indonesian and all other non-English languages remain user-managed and removable; existing custom Indonesian data remains preserved. Normalized identity, duplicate handling, malformed-storage preservation, selected-language fallback, English fallback resolution, and recoverable persistence integration are complete as reported. The 42.2A foundation is now used by the approved identity and resolution paths.

No CSV, Settings, migration, automatic recovery, dependency, database, Rust, Backup, package, workflow, or runtime-server work occurred. The next proposed sub-stage is `42.2C — Translation CSV Compatibility and English Baseline Editing`, which requires a separate implementation prompt. Implementation, tests/builds, runtime verification, and dependency remediation remain false.

### Completed Stage 42.2C — Translation CSV Compatibility and English Baseline Editing

**Status:** COMPLETED_REPORTED  
**Implementation Commit:** `eb0c377f6d412b9ee40c96bb42cbe53a700cebcd`  
**Focused Tests:** 146 passed  
**Production Build:** Passed  
**Format D:** Canonical import/export completed  
**Formats A–C:** Import-only Preview adapters completed  
**English Editing and Reset:** Completed  
**Atomic Apply:** Recoverable logical transaction completed  
**Settings Integration:** None  
**Visible Frontend Workflow Change:** None  
**Runtime Integration:** None  
**Migration:** None  
**Automatic Recovery:** None  

The engine preserves exact storage snapshots, blocks stale or unsafe Preview state, prevents partial apply, and retains compatibility with existing CSV and Settings callers. The full frontend suite was not run. The next proposed sub-stage is `42.2D — Settings and Recovery Integration`, which requires separate approval.

---

## 6. Approved Audit Areas

The following areas are approved for read-only inspection under Stage 1.

### Architecture and File Boundaries

- Translation modules and files;
- runtime loading path;
- UI integration points;
- Settings integration;
- Rust and frontend boundaries where applicable;
- fallback sources;
- key registries or generated key sources.

### Language Model

- English core behavior;
- English editing and reset behavior;
- user-managed language creation and removal;
- Indonesian and other additional-language behavior;
- selected-language persistence;
- default-language behavior.

### Storage and Persistence

- Translation data storage location;
- database tables or files;
- application restart persistence;
- import/export persistence;
- upgrade compatibility;
- Backup and Restore expectations;
- failure behavior.

### Key Resolution

- fallback behavior;
- missing-key behavior;
- duplicate-key behavior;
- invalid-value behavior;
- key naming and stability;
- behavior when a user-managed language is incomplete.

### CSV Compatibility

- current CSV structure;
- import and export behavior;
- key identity;
- language identity;
- validation;
- duplicate handling;
- missing keys;
- existing-user data safety.

### Compatibility and Migration

- existing stored Translation data;
- current schema or format;
- whether migration is required;
- backward compatibility;
- rollback or recovery requirements;
- preservation of completed Batch `41.9` behavior.

---

## 7. Current Approved Scope

Currently approved:

- fresh read-only Git preflight;
- tracked source and configuration inspection;
- Translation architecture and file-boundary mapping;
- static inspection of storage, persistence, fallback, missing-key, CSV, Settings, compatibility, and migration paths;
- reading existing tests without running them;
- limited Git history inspection when required to identify Batch `41.9` boundaries;
- evidence classification and report preparation;
- Project OS documentation after result review.

Not currently approved:

- source modification;
- Translation data modification;
- source modification;
- Translation data modification;
- Settings changes;
- database inspection requiring application execution;
- live AppData inspection;
- tests;
- builds;
- Vite or Tauri dev-server execution;
- dependency remediation;
- package changes;
- migration;
- commit, merge, or push.

---

## 8. Out of Scope

Until separately approved:

- repeating completed Batch `41.9` corrections without evidence;
- broad Translation architecture replacement;
- Settings redesign;
- UI redesign or broad polish;
- release-facing Translation completion;
- new remote language services;
- language marketplace;
- dependency installation or upgrade;
- Vite remediation;
- package-version changes;
- `.skv` changes;
- Backup or Restore implementation;
- repository cleanup;
- source formatting;
- tests or builds;
- live AppData inspection or mutation.

---

## 9. Applicable Active Locks

Primary locks:

- `LOCK-TRANSLATION-001`;
- `LOCK-UI-001`;
- `LOCK-UI-002`;
- `LOCK-UI-003`;
- `LOCK-DATA-001`;
- `LOCK-PACKAGE-001`;
- `LOCK-DEPENDENCY-001`;
- `LOCK-EVIDENCE-001`;
- `LOCK-PROJECTOS-001`.

Additional protected boundaries:

- `LOCK-BACKUP-001`;
- `LOCK-FEATURE-001`;
- all Credits, Import/Export, and public-reference locks.

The audit must not treat current code as permission to override an Active Lock.

---

## 10. Security and Execution Constraint

Batch `42.1` identified current Vite-related dependency alerts.

Until a dedicated targeted security-remediation stage is approved and completed:

- do not start the Vite development server;
- do not run Tauri development mode when it starts Vite;
- do not run browser-based runtime verification that requires Vite;
- do not update dependencies inside Batch `42.2`;
- do not mix security remediation into Translation work.

Read-only source inspection is approved only through Stage 1 and must begin with fresh Git verification.

---

## 11. Evidence Discipline

Important findings must use:

- `PROVEN` — directly supported by fresh repository evidence;
- `REPORTED` — stated by prior reports or historical records;
- `INFERRED` — reasoned from evidence;
- `UNKNOWN` — insufficient evidence.

The audit must not assume:

- current architecture from old documentation;
- migration need from package age;
- fallback behavior from UI appearance;
- data safety from successful normal use;
- compatibility from unchanged filenames;
- complete key coverage from the absence of visible errors.

---

## 12. Required Future Audit Report

A future audit report must include:

1. architecture map;
2. file and module inventory;
3. storage and persistence map;
4. English core behavior;
5. user-managed language behavior;
6. fallback and missing-key behavior;
7. CSV compatibility;
8. Settings integration;
9. existing-data safety;
10. compatibility and migration assessment;
11. conflicts with Active Locks;
12. minimum containment options;
13. risks and stop conditions;
14. recommendation for the next controlled stage;
15. mutation check proving no files or data changed.

The report must explicitly separate:

- completed Batch `41.9` behavior;
- unresolved Batch `42.2` work;
- deferred Batch `42.11` release completion.

---

## 13. Stop Conditions for a Future Audit

A future read-only audit must stop and report when it encounters:

- evidence of current Translation data corruption;
- an unexpected migration running automatically;
- a requirement to start Vite or mutate dependencies;
- a requirement to inspect or mutate live AppData;
- sensitive user data that cannot be safely summarized;
- architecture conflict that cannot be resolved from read-only evidence;
- repository mutation;
- a proposed action outside the approved scope.

---

## 14. Definition of Ready for Stage 2 Planning

Stage 1 is complete. Stage 2 planning is ready only through a controlled PLAN ONLY prompt that:

- preserves the approved English-only and user-managed-language boundary;
- defines exact source files and sub-stage sequencing;
- defines non-destructive compatibility, rollback, and stop conditions;
- keeps implementation, migration, tests, builds, Vite, Tauri, and dependency remediation prohibited;
- keeps Backup/package inclusion assigned to Batches `42.6` and `42.7`;
- keeps release-facing completion assigned to Batch `42.11`;
- records `plan_allowed: true` and `implementation_allowed: false`.

---

## 15. Definition of Done for Stage 1

Stage 1 is complete because:

- fresh Git preflight passed;
- architecture, data model, lifecycle, fallback, CSV, Settings, persistence, safety, and compatibility were assessed;
- critical findings were accepted as containment inputs;
- no mutation, runtime execution, dependency change, migration, or live-data inspection occurred;
- the approved product direction was recorded;
- Stage 2 planning, 42.2A, 42.2B, and 42.2C are complete as reported; 42.2D is proposed pending separate approval.

---

## 16. Current Decisions

### Approved

- Batch `42.1` is completed and closed.
- Batch `42.2` is active.
- Batch `42.2` Stage 0 scope definition is complete.
- Stage 1 read-only Translation architecture audit is complete with verdict `AUDIT_COMPLETE_WITH_CRITICAL_FINDING`.
- Stage 2 Translation containment implementation planning is `COMPLETE_REPORTED`.
- English `en` is the sole built-in/default/source/fallback language.
- Indonesian and every other non-English language are user-managed and removable.
- English is non-removable, CSV-editable, and resettable.
- Translation is limited to application-controlled frontend UI; user data remains unchanged.
- Every future feature must be translation-ready from initial implementation.
- Batch `41.9` completed work must not be repeated.
- Batch `42.11` remains separate.
- dependency remediation remains separate.
- implementation permission is false.
- 42.2B implementation is complete as reported.
- 42.2C implementation is complete as reported.
- 42.2D is the next proposed sub-stage and remains unapproved.
- audit permission is false because Stage 1 is complete.
- plan permission is complete for the approved Stage 2 planning scope.
- tests and builds are not approved.
- Vite dev-server execution is prohibited.

### Not Yet Approved

- any expansion beyond the approved read-only scope;
- any Codex prompt that permits mutation;
- implementation;
- migration;
- tests or builds;
- runtime verification;
- dependency remediation;
- next-stage activation.

---

## 17. Current Blockers

Stage 1 audit, Stage 2 planning, the 42.2A foundation-only stage, 42.2B identity/resolution, and 42.2C CSV compatibility are complete as reported. The 42.2D stage remains pending separate approval.

Implementation remains blocked because separate 42.2D approval has not been granted; tests, builds, runtime verification, dependency remediation, migration, package changes, and Backup changes remain prohibited for the proposed stage.

---

## 18. Active Feedback

See the active Visual Front End warning instruction in `docs/ai/06-feedback-log.md`.

Refer to:

`docs/ai/06-feedback-log.md`

when active unresolved feedback exists.

---

## 19. Next Recommended Action

After Result Review, separately approve or decline a controlled prompt for:

`Batch 42.2D — Settings and Recovery Integration`

Required mode:

`READY_PENDING_SEPARATE_APPROVAL`

The proposed work must preserve the completed English-only identity/resolution and CSV engine behavior until separately approved. It may narrow into the existing Settings Translation workflow, but must not redesign Settings or alter Catalog Import/Export.

Implementation is not currently authorized.

### Proposed Stage 42.2D Boundary

The proposed `42.2D — Settings and Recovery Integration` would narrowly integrate the existing Translation Settings workflow with explicit Preview and confirmation, accurate success/failure results, English reset access, transaction-journal recovery access, and rejected/raw recovery export. Existing Settings structure and workflow must be preserved; Settings redesign, Catalog Import/Export changes, Rust, dependencies, migration, and unrelated production paths remain out of scope. Because rendered Settings behavior may change, any future implementation prompt must follow the active conditional frontend notification rule. Separate approval is required.
