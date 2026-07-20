# Sakurava Active Batch

## 1. Batch Metadata

batch: 42.2  
title: Translation Containment  
status: ACTIVE  
phase: AUDIT_READY  
current_stage: Stage 1 — Read-Only Translation Architecture Audit  
current_mode: AUDIT ONLY  
audit_status: READY_FOR_RETRY_AFTER_PROJECT_OS_RECOVERY  
audit_allowed: true  
implementation_status: NOT_STARTED  
implementation_allowed: false  
tests_and_builds_allowed: false  
vite_dev_server_allowed: false  
dependency_remediation_allowed: false  
risk_level: HIGH  

starting_branch: main  
starting_baseline: 528246899386f960a1cce0b6f4bc4cba03b5315b  
starting_baseline_status: REPORTED_SYNCHRONIZED_BY_CODEX_CLOSURE  
starting_git_state_freshly_verified_for_batch_42_2: false  
first_audit_attempt: STOPPED_AT_GIT_PREFLIGHT  
stop_reason: APPROVED_PROJECT_OS_CHANGES_NOT_YET_COMMITTED  
translation_source_inspected: false  
recovery_status: RESOLVED_BY_THIS_DOCUMENTATION_COMMIT  
next_action: rerun Stage 1 through a separate controlled AUDIT ONLY prompt  

previous_batch: 42.1  
previous_batch_title: GitHub and Repository Health Triage  
previous_batch_status: COMPLETED_AND_CLOSED  
previous_batch_closure_commit: 528246899386f960a1cce0b6f4bc4cba03b5315b  

historical_corrective_batch: 41.9  
historical_corrective_batch_status: COMPLETED_AND_CLOSED  
release_completion_batch: 42.11  

approved_scope: READ_ONLY_TRANSLATION_ARCHITECTURE_AUDIT  
master_roadmap: docs/ai/07-master-roadmap.md  
last_updated: 2026-07-20  

---

## 2. Purpose

This file records the active state of Batch `42.2 — Translation Containment`.

Batch `42.2` continues only the unresolved Translation work that remained after Batch `41.9`.

It does not reopen or repeat completed Batch `41.9` corrective work without evidence of regression.

Its purpose is to define and later execute a controlled read-only audit that establishes:

- the current Translation architecture;
- current storage and persistence behavior;
- English core behavior;
- user-managed language behavior;
- fallback and missing-key behavior;
- CSV compatibility;
- Settings integration;
- data-safety and compatibility requirements;
- whether any migration or minimum stabilization is actually required.

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

---

## 4. Current Objective

Execute the smallest safe read-only Translation architecture audit under the approved Stage 0 contract.

The audit must identify current behavior and unresolved risks without modifying:

- source code;
- Translation data;
- Settings;
- database state;
- package metadata;
- dependencies;
- Backup or Restore behavior;
- UI structure.

The audit must distinguish:

- `PROVEN` current behavior;
- `REPORTED` historical behavior;
- `INFERRED` architecture conclusions;
- `UNKNOWN` unresolved areas.

---

## 5. Current Stage

### Stage 0 — Scope Definition

**Status:** COMPLETE  
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

**Status:** READY_FOR_RETRY_AFTER_PROJECT_OS_RECOVERY  
**Mode:** AUDIT ONLY  
**Audit Allowed:** Yes  
**Implementation Allowed:** No  
**Tests and Builds Allowed:** No  
**Vite Dev Server Allowed:** No  

Stage 1 must begin with a fresh read-only Git preflight. If branch, HEAD, tracked state, staging, or repository safety differs unexpectedly from the recorded baseline, the audit must stop before further inspection.

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

## 14. Definition of Ready for Audit

The audit contract is approved. Audit execution is ready only through a controlled prompt that:

- freshly verifies current branch, HEAD, staged state, tracked changes, and untracked evidence before inspection;
- In Scope and Out of Scope are explicit;
- applicable Active Locks are listed;
- data-safety handling is approved;
- migration and compatibility questions are explicit;
- file modification is prohibited;
- Vite dev-server execution is prohibited;
- dependency changes are prohibited;
- tests and builds remain prohibited unless separately approved;
- final report format is approved;
- `audit_allowed` remains `true`.

---

## 15. Definition of Done for Stage 0

Stage 0 is complete because:

- the operator approves the audit goal;
- proposed audit areas are accepted or revised;
- protected contracts are confirmed;
- evidence requirements are accepted;
- stop conditions are accepted;
- final report requirements are accepted;
- audit execution is separately gated through one controlled Codex `AUDIT ONLY` prompt.

---

## 16. Current Decisions

### Approved

- Batch `42.1` is completed and closed.
- Batch `42.2` is active.
- Batch `42.2` Stage 0 scope definition is complete.
- Stage 1 read-only Translation architecture audit is ready but not started.
- Batch `41.9` completed work must not be repeated.
- Batch `42.11` remains separate.
- dependency remediation remains separate.
- implementation permission is false.
- audit permission is true for the approved read-only Stage 1 scope.
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

Audit execution is approved but has not started.

Stage 1 must stop before source inspection when fresh Git preflight shows an unexpected branch, HEAD, staged change, tracked modification, repository mutation, or other ambiguous state.

Implementation remains blocked because current architecture and required containment remain unknown, and the approved scope is audit-only.

---

## 18. Active Feedback

None recorded.

Refer to:

`docs/ai/06-feedback-log.md`

when active unresolved feedback exists.

---

## 19. Next Recommended Action

Create one controlled Codex prompt for:

`Batch 42.2 — Stage 1: Read-Only Translation Architecture Audit`

Required mode:

`AUDIT ONLY`

The prompt must enforce fresh Git preflight, approved evidence areas, historical boundaries, data-safety rules, report format, mutation check, and stop conditions.

Do not authorize file modification, Translation-data mutation, live AppData access, tests, builds, Vite or Tauri execution, dependency changes, migration, commit, merge, or push.
