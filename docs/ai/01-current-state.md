# Sakurava Current State

## 1. State Metadata

project: Sakurava Desktop  
repository: D:\sakurava-desktop  
application_stack: React + Tauri  

product_state_updated_at: 2026-07-22  
repository_state_recorded_at: 2026-07-22  
repository_state_status: REPORTED_SYNCHRONIZED_BY_CODEX_CLOSURE  
repository_state_evidence: CODEX_CLOSURE_REPORT  
remote_main_verified: true  
tracked_worktree_clean: true  
untracked_entry_count: 1334

default_branch: main  
remote_branch: origin/main  
last_recorded_baseline: c5ca5c1289b7c621283e05171da2a92386dd994e
baseline_label: Batch 42.3A-1 Catalog Integrity Static Audit

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
active_batch: 42.3A
active_batch_title: Catalog Reference Integrity and Deletion Recovery
active_batch_phase: CORRECTIVE_INTEGRITY
active_batch_mode: READY_PENDING_SEPARATE_APPROVAL
audit_status: COMPLETE_REPORTED
batch_42_3a_1_status: COMPLETE_REPORTED
batch_42_3a_1_verdict: ROOT_CAUSE_CONFIRMED_FIX_REQUIRED
primary_root_cause_classification: DELETE_RELATIONSHIP_CASCADE_DEFECT
secondary_classification: LIST_DETAIL_QUERY_DIVERGENCE
data_risk_classification: POTENTIAL_HIDDEN_ORPHANS
operator_problem_evidence: OBSERVED_BY_OPERATOR
code_architecture_findings: REPORTED_BY_CODEX_STATIC_AUDIT
live_appdata_inspected: false
operator_database_inspected: false
runtime_performed: false
audit_allowed: false
plan_status: COMPLETE_REPORTED
plan_allowed: false
implementation_status: NOT_APPROVED
implementation_allowed: false
strategy: DEPENDENCY_SAFE_CATALOG_DELETION
tests_and_builds_allowed: false
runtime_verification_allowed: false
vite_dev_server_allowed: false
dependency_remediation_allowed: false
current_tests_builds_runtime_permission: false
next_proposed_stage: 42.3A-2 — Dependency-Safe Catalog Deletion Fix
next_stage_status: READY_PENDING_SEPARATE_APPROVAL
existing_catalog_repair_stage: SEPARATELY_GATED_IF_REQUIRED
dependency_remediation: false
migration_approved: false
live_data_repair_approved: false
batch_42_3_performance_media_status: SUSPENDED_BY_BLOCKING_INTEGRITY_PREREQUISITE
project_os_tracking_policy: TRACK_IN_REPOSITORY  
project_os_tracking_status: TRACKED_AND_SYNCHRONIZED_REPORTED  

current_reported_batch_42_2b: COMPLETE_REPORTED  
current_reported_42_2b_commit: 4cdeb2dcd304f2b24d23fc571e9d4c21e2aeff73  
current_reported_42_2b_parent: 9e6c3e55f89d086942547190309bc307aaed44bb  
current_reported_batch_42_2c: COMPLETE_REPORTED  
current_reported_implementation_commit: eb0c377f6d412b9ee40c96bb42cbe53a700cebcd  
current_reported_implementation_parent: 843989564e823f8815a0f9508e27f89bf912e858  
current_proposed_sub_stage: 42.3A-2 — Dependency-Safe Catalog Deletion Fix
current_proposed_sub_stage_status: READY_PENDING_SEPARATE_APPROVAL
current_proposed_sub_stage_implementation_allowed: false  
current_proposed_sub_stage_tests_and_builds_allowed: false  
current_proposed_sub_stage_runtime_verification_allowed: false  
current_proposed_sub_stage_dependency_remediation_allowed: false  
current_proposed_sub_stage_manual_smoke_allowed: false
batch_42_2_status: COMPLETED_AND_CLOSED
batch_42_2e_status: COMPLETED_OBSERVED
vite_watcher_correction_status: COMPLETED_REPORTED
vite_watcher_correction_commit: 211e5bdd614ce5cc5e203f894db564702755b709
disposable_manual_smoke: PASSED_OBSERVED_BY_OPERATOR
manual_smoke_used_live_appdata: false
canonical_five_column_csv_smoke: PASSED_OBSERVED_BY_OPERATOR
corrected_utf8_existing_language_reimport: PASSED_OBSERVED_BY_OPERATOR
indonesian_identity: USER_MANAGED
duplicate_normalized_language_identity: NOT_OBSERVED
user_entered_category_data_mutation: NOT_OBSERVED
restart_persistence: PASSED_OBSERVED_BY_OPERATOR
preview_numeric_counts: NOT_REPORTED
next_proposed_batch: 42.3A-2 — Dependency-Safe Catalog Deletion Fix
next_batch_approval: NOT_APPROVED
next_batch_audit_permission: false
next_batch_implementation_permission: false
runtime_permission: false
dependency_remediation_permission: false

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
- Batch `42.2 — Translation Containment`: `COMPLETED_AND_CLOSED`;
- Batch `42.11 — Translation Release Completion`: planned after shared UI stabilization.

Batch `42.2` and its Translation stages are completed historical work. Current active work is the interposed corrective Batch `42.3A`.

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

### Interposed Security Prerequisite — Batch 42.13A

Batch `42.13A — Targeted Vite Security Prerequisite` completed from starting baseline `65a4815505d7f268b66d5616541b770f9252d684`.

Evidence class: `REPORTED_BY_CODEX_VERIFICATION`.

- Vite was updated from `7.3.3` to `7.3.5`.
- The targeted Vite high advisory was removed; the final audit reported no high or critical advisory and retained only four low and two moderate unrelated findings for full Batch `42.13`.
- Controlled full-suite A/B verification found no patch-specific failure. The complete suite remains not fully passing.
- The cover-preview timeout was reproduced on Vite `7.3.3` and classified as a baseline-flaky test, not a Vite `7.3.5` regression.
- The final production build passed. No Vite dev server, Tauri process, application runtime, or smoke test ran.
- No application, Translation, Rust, database, Backup, workflow, or test source changed.

Batch `42.2` Stage 2 planning, 42.2A foundation, and 42.2B identity/resolution are complete as reported. The next proposed sub-stage is `42.2C — Translation CSV Compatibility and English Baseline Editing`.

### Batch 42.2A — Lossless Translation Storage Foundation

Evidence class: `REPORTED_BY_CODEX`.

Batch `42.2A` completed in commit `ab9d9d98ab2b04cbedf41674bb34fd9e5f965409` (parent `7583b85e4e6308809e8eee768b3914f438e44ae3`). Exactly two new files were added: `src/lib/translationStorage.ts` and `src/lib/translationStorage.test.ts`.

The foundation provides injected storage, exact raw snapshots, malformed-value diagnostics, duplicate-property diagnostics, journal-first `RECOVERABLE_LOGICAL_TRANSACTION` planning and commit, rollback, pending inspection, explicit recovery, and a pure recovery-export model. Focused verification reported 46 passed tests and a passing Vite 7.3.5 production build. No caller integration, runtime Translation behavior change, startup recovery, migration, existing Translation module change, or dependency/database/Rust/Backup/package/workflow/runtime change occurred. The full frontend suite was not run; known pre-existing failures remain separately classified.

The next proposed sub-stage is `42.2B — English-Only Language Identity and Resolution`. Its implementation status is `READY_PENDING_SEPARATE_APPROVAL`; implementation, Translation tests/builds, runtime verification, and dependency remediation remain false.

### Batch 42.2B — English-Only Language Identity and Resolution

Evidence class: `REPORTED_BY_CODEX`.

Batch `42.2B` completed in commit `4cdeb2dcd304f2b24d23fc571e9d4c21e2aeff73` (parent `9e6c3e55f89d086942547190309bc307aaed44bb`). English is recorded as the sole active built-in, default, source, and fallback language. Indonesian and all other non-English languages remain user-managed; existing custom `id` data remains preserved and removable. Normalized identity, duplicate handling, malformed-storage preservation, English fallback, and recoverable persistence integration are complete as reported.

Focused Translation verification reported 98 passed tests across seven files, and the Vite 7.3.5 production build passed. No CSV, Settings, migration, automatic recovery, dependency, database, Rust, Backup, package, workflow, or runtime-server work occurred. The full frontend suite was not run; known unrelated baseline failures remain separately classified.

The next proposed sub-stage is `42.2C — Translation CSV Compatibility and English Baseline Editing`. Its implementation status is `READY_PENDING_SEPARATE_APPROVAL`; implementation, tests/builds, runtime verification, and dependency remediation remain false.

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
4. Batch 42.3A — Catalog Reference Integrity and Deletion Recovery.
5. Batch 42.3 — Catalog Performance and Media Audit (suspended).
6. Batch 42.4 — Managed Mini Media Foundation.
7. Batch 42.5 — Catalog and Database Performance.
8. Batch 42.6 — Backup and Restore Audit.
9. Batch 42.7 — `.skv` Backup and Atomic Restore Hardening.
10. Batch 42.8 — Explicit Catalog Feature Configuration.
11. Batch 42.9 — Design System and Iconography Foundation.
12. Batch 42.10 — Controlled UI Polish.
13. Batch 42.11 — Translation Release Completion.
14. Batch 42.12 — Repository Professionalization.
15. Batch 42.13 — Dependency and Security Remediation.
16. Batch 42.14 — Windows Identity and Packaging.
17. Batch 42.15 — Private Pilot Release Candidate.

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

### Batch 42.3A — Catalog Reference Integrity and Deletion Recovery

Current status: `AUDIT_COMPLETE_FIX_REQUIRED`
Phase: `CORRECTIVE_INTEGRITY`
Audit status: `COMPLETE_REPORTED`
Audit verdict: `ROOT_CAUSE_CONFIRMED_FIX_REQUIRED`
Primary classification: `DELETE_RELATIONSHIP_CASCADE_DEFECT`
Secondary classification: `LIST_DETAIL_QUERY_DIVERGENCE`
Data risk: `POTENTIAL_HIDDEN_ORPHANS`
Operator evidence: `OBSERVED_BY_OPERATOR`
Static findings: `REPORTED_BY_CODEX_STATIC_AUDIT`

The static audit found that ordinary parent deletion can commit without dependency-safe cleanup or final reference validation. Surviving Credits and inbound JSON relationships may become dangling. Lists bypass global validation while Detail gets require it, allowing recovery errors to appear as misleading not-found states. Spreadsheet deletion is materially safer and must not be weakened. Restore replaces the database with a previously valid snapshot; it is not the corrective implementation.

Current implementation permission: `false`
Tests and builds permission: `false`
Runtime permission: `false`
Live AppData permission: `false`
Existing-catalog repair permission: `false`
Dependency remediation permission: `false`
Migration approved: `false`

Next proposed stage: `42.3A-2 — Dependency-Safe Catalog Deletion Fix`
Next-stage status: `READY_PENDING_SEPARATE_APPROVAL`
Existing-catalog repair: `SEPARATELY_GATED_IF_REQUIRED`
Batch `42.3` performance/media work: `SUSPENDED_BY_BLOCKING_INTEGRITY_PREREQUISITE`

Batch `42.2` Translation work remains completed historical state. Its details belong in historical sections, the Session Ledger, and the Master Roadmap, not in the active stage.

Evidence class: `REPORTED_BY_CODEX_PREFLIGHT`.

No application source, Translation source, data, dependency, workflow, test, build, server, or Git-ref mutation occurred. Translation architecture remains unassessed.

The approved recovery disposition was to preserve and commit those documentation updates. That recovery was synchronized before the audited baseline, after which Stage 1 completed separately. Implementation remains prohibited.

---

## 11. Current Unknowns

The following remain unverified or intentionally deferred:

- actual runtime restart persistence and WebView storage location;
- actual live user-language storage shapes and prevalence of legacy formats;
- runtime outcome of focused Translation tests and disposable verification;
- detailed English reset UX and implementation mechanics;
- Backup/package inclusion and migration behavior for Translation;
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

Batch `42.2` Stage 1 audit, Stage 2 implementation plan, and 42.2A through 42.2D1 are complete as reported. The next proposed sub-stage is `42.2E — Disposable Translation Manual Smoke Verification`.

Implementation remains blocked because:

- the current mode is ready pending separate approval;
- 42.2E manual smoke has not started and remains unapproved;
- dependency remediation is separate;
- Vite `7.3.5` is the current reported prerequisite state;
- Vite dev-server execution remains separately gated;
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

Review this completed Batch `42.2D1` documentation closure before considering one separately approved prompt for:

`Batch 42.2E — Disposable Translation Manual Smoke Verification`

Required mode:

`READY_PENDING_SEPARATE_APPROVAL`

The next scope must preserve the completed English-only identity/resolution, CSV engine, Settings integration, and user-facing CSV contract without assuming approval for manual smoke.

Implementation remains unapproved until that separate controlled approval.
