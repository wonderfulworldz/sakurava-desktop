# Sakurava Current State

## 1. State Metadata

project: Sakurava Desktop  
repository: D:\sakurava-desktop  
application_stack: React + Tauri  

product_state_updated_at: 2026-07-20  
repository_state_recorded_at: 2026-07-20  
repository_state_status: REPORTED_SYNCHRONIZED_BY_CODEX_CLOSURE  
repository_state_evidence: CODEX_CLOSURE_REPORT  
remote_main_verified: true  
tracked_worktree_clean: true  
untracked_entry_count: 97  

default_branch: main  
remote_branch: origin/main  
last_recorded_baseline: 528246899386f960a1cce0b6f4bc4cba03b5315b  
baseline_label: docs close batch 42.1 and track project OS  

legacy_batch_series: 41.x  
legacy_batch_series_status: CLOSED  
last_completed_legacy_batch: 41.9  
last_completed_legacy_batch_title: Translation Containment and Architecture Baseline  
last_completed_legacy_batch_status: COMPLETED_AND_CLOSED  
last_completed_legacy_batch_type: CORRECTIVE_TRANSLATION_REPAIR  
previous_feature_batch: 41.8.5C  

new_roadmap_series: 42.x  
last_completed_roadmap_batch: 42.1  
last_completed_roadmap_batch_title: GitHub and Repository Health Triage  
last_completed_roadmap_batch_status: COMPLETED_AND_CLOSED  
active_batch: 42.2  
active_batch_title: Translation Containment  
active_batch_phase: AUDIT_READY  
active_batch_mode: AUDIT ONLY  
audit_status: READY_FOR_RETRY_AFTER_PROJECT_OS_RECOVERY  
audit_allowed: true  
implementation_status: NOT_STARTED  
implementation_allowed: false  
tests_and_builds_allowed: false  
vite_dev_server_allowed: false  
dependency_remediation_allowed: false  
project_os_tracking_policy: TRACK_IN_REPOSITORY  
project_os_tracking_status: TRACKED_AND_SYNCHRONIZED_REPORTED  

package_version: NOT_RECORDED  
backup_extension: .skv  
release_target: PRIVATE_PILOT  
distribution_method: DIRECT_WINDOWS_INSTALLER  
store_distribution_planned: false  
target_architecture: WINDOWS_64_BIT  
windows_32_bit_supported: false  
minimum_ram_target: 4_GB  

master_roadmap: docs/ai/07-master-roadmap.md  
active_locks: docs/ai/02-active-locks.md  
active_batch_file: docs/ai/03-active-batch.md  
manual_smoke_evidence_policy: LOCAL_AND_UNTRACKED  
last_manual_smoke_used_live_appdata: false  

---

## 2. Freshness Rule

This file records the latest approved product state and the most recent reported repository state.

These are different evidence classes.

### Product State

Product decisions dated 2026-07-20 remain authoritative unless explicitly replaced through an approved Project OS change.

### Repository State

The Batch `42.1` closure report states that:

- repository root remained `D:\sakurava-desktop`;
- active branch remained `main`;
- local and remote `main` were synchronized at `528246899386f960a1cce0b6f4bc4cba03b5315b`;
- the tracked worktree and staged state were clean;
- exactly nine approved Project OS authority files were committed;
- no application source, dependency, workflow, package, runtime, or local-evidence file was committed;
- `manual-smoke/` remained local and untracked;
- 97 untracked entries remained after closure.

This repository state is:

`REPORTED_SYNCHRONIZED_BY_CODEX_CLOSURE`

It has not been independently re-verified by ChatGPT after the push.

Before repository audit, implementation, tests, builds, package work, dependency remediation, or Git closure, verify current Git state when intervening actions may have changed it.

Fresh Git, test, build, inspector, GitHub, or runtime evidence overrides this recorded state.

---

## 3. Project Condition

Sakurava is a React and Tauri desktop catalog application.

The operator previously estimated that the application was approximately 90 percent functional.

That estimate is:

`OPERATOR_ESTIMATE`

It is not a fresh technical completion measurement.

The project remains in:

`CONTROLLED_EXTENSION`

The approved release direction is a stable Windows Private Pilot.

Current priorities are:

1. preserve working behavior;
2. protect user data;
3. classify repository and GitHub health findings;
4. stabilize Translation through a later controlled batch;
5. measure and improve Catalog performance;
6. establish reliable managed mini media;
7. harden `.skv` Backup and Restore;
8. add non-destructive catalog-feature configuration;
9. improve visual and interaction consistency;
10. prepare a repeatable Windows installer.

Current project principle:

> Preserve, measure, stabilize, and release through controlled change.

The authoritative product direction is stored in:

`docs/ai/07-master-roadmap.md`

Permanent product and safety protections are stored in:

`docs/ai/02-active-locks.md`

---

## 4. Batch-Series Transition

### Legacy Series 41.x

The legacy Batch 41.x series is closed.

Recorded outcome:

- Batch `41.8.5C — Credits Spreadsheet CRUD` remains the previous completed feature batch;
- Batch `41.9 — Translation Containment and Architecture Baseline` completed the corrective work for the Translation section that Codex had changed outside the approved scope;
- Batch `41.9` is recorded as `COMPLETED_AND_CLOSED`;
- completed Batch `41.9` corrections remain part of project history and must not be repeated as new roadmap work;
- unfinished Translation audit, stabilization, and release-completion plans are consolidated into Batch `42.2` and Batch `42.11`;
- Batch `42.2` and Batch `42.11` are continuations of unresolved work, not duplicates of completed Batch `41.9` work.

### New Series 42.x

The approved roadmap is represented by Batch series `42.x`.

- Batch `42.0 — Master Roadmap and Project OS Baseline`: `COMPLETED`;
- Batch `42.1 — GitHub and Repository Health Triage`: `COMPLETED_AND_CLOSED`;
- Batch `42.2 — Translation Containment`: `ACTIVE`;
- Batch `42.11 — Translation Release Completion`: planned after shared UI stabilization.

Batch `42.2` Stage 0 scope definition is complete. Stage 1 is ready for a controlled read-only Translation architecture audit.

Translation implementation, test, build, Vite dev-server execution, dependency remediation, and migration remain unauthorized.

---

## 5. Approved Release Baseline

### Release Type

The first planned release is:

`PRIVATE_PILOT`

Distribution direction:

- direct Windows installer;
- selected users;
- no Microsoft Store;
- no other application store;
- no public automatic-update requirement;
- manual installer updates are acceptable.

### Platform

Approved direction:

- Windows 64-bit only;
- Windows 32-bit excluded;
- Windows 11 64-bit recommended;
- Windows 10 64-bit may remain a compatibility target;
- minimum RAM target 4 GB;
- ARM64 outside the first-release scope.

The exact minimum supported Windows build remains:

`UNKNOWN_PENDING_TECHNICAL_AUDIT`

### Catalog Capacity

Sakurava must not impose an artificial catalog-data limit.

The initial release acceptance baseline is:

- at least 1,000 Work records;
- representative Performer and Credit relationships;
- representative Categories and Glossary data;
- representative managed mini images;
- representative search, filtering, sorting, scrolling, and Detail navigation.

“Unlimited” means no arbitrary product limit. It does not guarantee identical performance at every scale or on every device.

---

## 6. Current Repository and GitHub State

The Batch `42.1` closure report records:

### Git

- local branch: `main`;
- local HEAD: `528246899386f960a1cce0b6f4bc4cba03b5315b`;
- remote branch: `origin/main`;
- remote `main`: the same commit;
- synchronization: reported verified;
- tracked worktree: clean;
- staged state: clean;
- remaining untracked entries: 97.

### Project OS and Local Evidence

The following authority files are now reported tracked:

- `SAKURAVA-CHATGPT-BOOT-PROMPT.md`;
- `docs/ai/00-operating-contract.md`;
- `docs/ai/01-current-state.md`;
- `docs/ai/02-active-locks.md`;
- `docs/ai/03-active-batch.md`;
- `docs/ai/04-session-ledger.md`;
- `docs/ai/05-model-routing.md`;
- `docs/ai/06-feedback-log.md`;
- `docs/ai/07-master-roadmap.md`.

`manual-smoke/` remains protected local untracked evidence.

Runtime databases, temporary exports, logs, generated smoke artifacts, build output, and dependency directories remain excluded from Project OS tracking.

### GitHub Security and Governance

Batch `42.1` classified:

- 7 open Dependabot alerts;
- code scanning disabled;
- secret scanning disabled;
- classic branch protection not configured;
- repository rulesets not configured;
- one dynamic CodeQL run failed at startup and produced no scanning result;
- no immediate production security blocker proven.

Dependency and security remediation remains assigned to Batch `42.13`.

A targeted approved remediation stage is required before future work that starts the Vite development server.

---

## 7. Last Completed Roadmap Batch

### Batch 42.1 — GitHub and Repository Health Triage

Status:

`COMPLETED_AND_CLOSED`

Closure commit:

`528246899386f960a1cce0b6f4bc4cba03b5315b`

Recorded result:

- local and GitHub `main` were matched before closure;
- seven Dependabot alerts were classified;
- no immediate production security blocker was proven;
- code scanning and secret scanning were recorded as disabled;
- branch protection and repository rulesets were recorded as absent;
- Project OS authority files were tracked in one documentation-only commit;
- `manual-smoke/` remained local and untracked;
- no source, dependency, workflow, package, test, build, or remediation change occurred.

This closure evidence is based on the Codex report and is classified as:

`REPORTED`

### Legacy Translation Correction — Batch 41.9

Batch `41.9 — Translation Containment and Architecture Baseline` remains `COMPLETED_AND_CLOSED` for its corrective Translation scope.

Completed Batch `41.9` work must not be repeated.

Unresolved Translation containment work belongs to Batch `42.2`.

Release-facing Translation completion remains assigned to Batch `42.11`.

### Previous Verified Feature Batch — Batch 41.8.5C

Batch `41.8.5C — Credits Spreadsheet CRUD` remains the previous feature batch with detailed recorded technical verification.

Recorded verification:

- focused frontend tests: 151 passed;
- Rust tests: 122 passed;
- production build: passed;
- export inspector regression: passed;
- disposable manual smoke: passed;
- restart persistence: passed;
- safety backup: verified.

These results apply only to the recorded Batch `41.8.5C` baseline.

---

## 8. Approved Batch Roadmap

The approved roadmap sequence is:

1. Batch 42.0 — Master Roadmap and Project OS Baseline.
2. Batch 42.1 — GitHub and Repository Health Triage.
3. Batch 42.2 — Translation Containment.
4. Batch 42.3 — Catalog Performance and Media Audit.
5. Batch 42.4 — Managed Mini Media Foundation.
6. Batch 42.5 — Catalog and Database Performance.
7. Batch 42.6 — Backup and Restore Audit.
8. Batch 42.7 — `.skv` Backup and Atomic Restore Hardening.
9. Batch 42.8 — Explicit Catalog Feature Configuration.
10. Batch 42.9 — Design System and Iconography Foundation.
11. Batch 42.10 — Controlled UI Polish.
12. Batch 42.11 — Translation Release Completion.
13. Batch 42.12 — Repository Professionalization.
14. Batch 42.13 — Dependency and Security Remediation.
15. Batch 42.14 — Windows Identity and Packaging.
16. Batch 42.15 — Private Pilot Release Candidate.

Batch 42.0 is complete as a product and documentation baseline.

This does not prove repository state and does not grant technical execution permission.

---

## 9. Key Approved Product Contracts

Detailed authoritative wording remains in Active Locks.

Summary:

- existing Forms remain full pages;
- existing Backup extension remains `.skv`;
- internal `.skv` compatibility must not change silently;
- full external media is excluded from Backup;
- managed mini images are protected catalog assets included in Backup;
- failed mini-image regeneration preserves the previous valid image;
- disabled explicit catalog features retain their stored data;
- interface motion must be lightweight and user-disableable;
- English remains the non-removable core language;
- user-managed languages and CSV Translation support remain protected;
- automated GitHub findings require controlled classification before remediation;
- dependency remediation and repository cleanup remain separate workstreams.

---

## 10. Active Batch

### Batch 42.2 — Translation Containment

Current status:

`ACTIVE`

Current phase:

`AUDIT_READY`

Current stage:

`Stage 1 — Read-Only Translation Architecture Audit`

Current mode:

`AUDIT ONLY`

Audit status:

`READY_FOR_RETRY_AFTER_PROJECT_OS_RECOVERY`

Audit permission:

`APPROVED`

Implementation permission:

`NOT_APPROVED`

Tests and builds:

`NOT_APPROVED`

Vite dev-server execution:

`NOT_APPROVED`

Dependency remediation:

`NOT_APPROVED`

Risk level:

`HIGH`

Batch `42.2` exists to define and later execute a controlled read-only audit of unresolved Translation architecture and data-safety questions.

It must preserve the completed corrective work from Batch `41.9` and must not repeat it without evidence of regression.

It must remain separate from:

- Translation Release Completion in Batch `42.11`;
- dependency and security remediation in Batch `42.13`;
- Settings redesign;
- broad UI polish;
- package or Backup changes;
- repository cleanup.

The authoritative current scope and blockers are stored in:

`docs/ai/03-active-batch.md`

### First Stage 1 Preflight Disposition

The first Stage 1 preflight stopped before authority-file or Translation-source inspection because four approved Project OS files were modified but not yet committed.

Evidence class: `REPORTED_BY_CODEX_PREFLIGHT`.

No application source, Translation source, data, dependency, workflow, test, build, server, or Git-ref mutation occurred. Translation architecture remains unassessed.

The approved recovery disposition is to preserve and commit those documentation updates. After this documentation-only commit is synchronized, Stage 1 remains ready for a separate full preflight retry. Implementation remains prohibited.

---

## 11. Current Unknowns

The following remain unverified or intentionally deferred:

- current Translation architecture and file boundaries;
- Translation storage and persistence behavior;
- fallback and missing-key behavior;
- English core editing and reset behavior;
- user-managed language lifecycle;
- CSV import and export compatibility;
- Settings integration;
- whether migration is required;
- whether completed Batch `41.9` protections remain fully reflected in current code;
- exact remediation versions and compatibility impact for the seven Dependabot alerts;
- code-scanning results, because code scanning is disabled;
- secret-scanning results, because secret scanning is disabled;
- current managed mini-image implementation;
- current Catalog performance bottlenecks;
- current `.skv` package structure and compatibility;
- current Restore atomicity and rollback;
- current configurable-feature architecture;
- current installer configuration.

Do not represent these items as proven until the applicable controlled audit or implementation batch is completed.

---

## 12. Current Blockers

Batch `42.2` read-only audit execution is approved but has not started.

The audit must begin with fresh verification of branch, HEAD, staged state, tracked modifications, and untracked evidence. It must stop before inspection if the repository state is ambiguous or differs unexpectedly from the recorded baseline.

Implementation remains blocked because:

- the current stage is audit-only;
- current Translation architecture is unknown;
- implementation scope has not been approved;
- dependency remediation is separate;
- Vite `7.3.3` remains affected by current alerts;
- Vite dev-server execution is prohibited until a targeted security-remediation stage is approved and completed;
- tests and builds are not approved.

These blockers do not prevent requirement discussion or Project OS documentation maintenance.

---

## 13. Primary Risks

1. Batch `42.2` may accidentally repeat completed Batch `41.9` corrective work.
2. Translation audit may silently expand into Settings redesign, broad UI work, package changes, or dependency work.
3. Existing Translation data may be misinterpreted without storage and persistence evidence.
4. Fallback, missing-key, CSV, or migration assumptions may be treated as proven without audit.
5. Vite dev-server work may expose the developer to the current `launch-editor` alert before remediation.
6. Dependency remediation may be mixed into Translation work.
7. Release-facing Translation completion may be pulled forward from Batch `42.11`.
8. Recorded closure state may become stale before the next repository operation.

---

## 14. Current Protected Areas

Do not change the following without approved scope:

- existing UI and workflow;
- full-page Form behavior;
- Translation architecture and stored language data;
- database contracts;
- public references;
- Credits behavior;
- spreadsheet atomic Apply behavior;
- `.skv` extension and package compatibility;
- managed mini-image retention;
- configurable-feature data retention;
- dependency versions;
- live AppData handling;
- manual-smoke evidence policy.

Refer to:

`docs/ai/02-active-locks.md`

for authoritative lock wording.

---

## 15. Recommended Next Action

Create one controlled Codex prompt for:

`Batch 42.2 — Stage 1: Read-Only Translation Architecture Audit`

Required mode:

`AUDIT ONLY`

The prompt must include fresh Git preflight, the approved architecture and data evidence sources, historical boundaries for Batches `41.9`, `42.2`, and `42.11`, required report format, sensitive-data rules, and stop conditions.

Do not authorize file modification, Translation-data mutation, live AppData access, tests, builds, Vite or Tauri execution, dependency changes, migration, commit, merge, or push.
