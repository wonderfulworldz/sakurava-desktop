# Sakurava Current State

## 1. State Metadata

project: Sakurava Desktop  
repository: D:\sakurava-desktop  
application_stack: React + Tauri  

product_state_updated_at: 2026-07-25
repository_state_recorded_at: 2026-07-25
repository_state_status: RECONCILED_BY_CODEX_DOCUMENTATION_CLOSURE
repository_state_evidence: CODEX_42_3_2_FINAL_REPORT
remote_main_verified: FRESH_PREFLIGHT_MATCHED_REQUIRED_BASELINE
tracked_worktree_clean: true  
untracked_entry_count: 5392

default_branch: main  
remote_branch: origin/main  
last_recorded_baseline: 2ed304740ab809bf910d59b200065303c8eb0df5
baseline_label: Batch 42.3 Catalog Performance Measurement Baseline

legacy_batch_series: 41.x  
legacy_batch_series_status: CLOSED  
last_completed_legacy_batch: 41.9  
last_completed_legacy_batch_title: Translation Containment and Architecture Baseline  
last_completed_legacy_batch_status: COMPLETED_AND_CLOSED  
last_completed_legacy_batch_type: CORRECTIVE_TRANSLATION_REPAIR  
previous_feature_batch: 41.8.5C  

new_roadmap_series: 42.x  
last_completed_roadmap_batch: 42.3A
last_completed_roadmap_batch_title: Catalog Reference Integrity and Deletion Recovery
last_completed_roadmap_batch_status: COMPLETED_AND_CLOSED  
active_batch: 42.3
active_batch_title: Catalog Performance and Media Audit
active_batch_phase: CONTROLLED_MEASUREMENT
active_batch_mode: PERFORMANCE_BASELINE_PARTIAL_REPORTED
current_stage: 42.3-2A — Targeted Measurement Completion and Startup Breakdown
current_stage_status: READY_PENDING_SEPARATE_APPROVAL
codex_capacity_status: PAUSED_WEEKLY_LIMIT_EXHAUSTED
manual_project_os_update_status: RECONCILIATION_IN_PROGRESS_DOCUMENTATION_ONLY

batch_42_3a_status: COMPLETED_AND_CLOSED
batch_42_3a_final_implementation_baseline_historical: 7e5fc6e7b807047203e645256b2f20f87a298f81
batch_42_3_1_status: COMPLETE_REPORTED
batch_42_3_1_verdict: STATIC_ARCHITECTURE_AUDIT_COMPLETE_MEASUREMENT_REQUIRED
batch_42_3_2_status: PERFORMANCE_BASELINE_PARTIAL_REPORTED
batch_42_3_2_result_review: PARTIAL_BASELINE_ACCEPTED
batch_42_3_2_evidence: REPORTED_BY_CODEX
batch_42_3_2_evidence_root: manual-smoke/42.3-2-performance-measurement-20260722/
measurement_dominant_cost: DATABASE_PREPARATION_AND_REFERENCE_INITIALIZATION
measurement_fixture_or_harness_integrity_gap: DETAIL_IDENTITY_RECOVERY_REQUIRED
measurement_final_remote_state: NOT_FRESHLY_RECONFIRMED_AT_STAGE_END
measurement_implementation_performed: false
measurement_remaining_gaps: STARTUP_REFERENCE_BREAKDOWN; DETAIL_WATERFALL_FIXTURE; PAGE_SIZE_256; GALLERY; IMAGE_TIMING; PHASE_MEMORY; MISSING_SOURCE_REPEATS; METADATA_PRESERVATION

small_dataset_works: 32
medium_dataset_works: 256
acceptance_dataset_works: 1000
small_startup_db_prepare_median_ms: 1004
medium_startup_db_prepare_median_ms: 8580
acceptance_startup_db_prepare_median_ms: 34136
small_home_usable_cold_median_ms: 2040
medium_home_usable_cold_median_ms: 9580
acceptance_home_usable_cold_median_ms: 35170
acceptance_memory_working_set_reported_mib: 436_TO_449
page_size_32_scroll_frame_over_16_7_ms: ZERO_REPORTED
page_size_256_measurement: INCOMPLETE
valid_detail_measurement: INCOMPLETE
realistic_image_decode_measurement: INCOMPLETE

reference_safe_form_delete: PASSED_OBSERVED_BY_OPERATOR
reference_safe_bulk_delete: PASSED_OBSERVED_BY_OPERATOR
survivor_detail_access: PASSED_OBSERVED_BY_OPERATOR
recovery_warning_after_accepted_smoke: NOT_OBSERVED
ui_ux_flow: UNCHANGED_OBSERVED_BY_OPERATOR
live_appdata_inspected: false
operator_database_inspected: false
existing_catalog_repair_performed: false
schema_migration: none
package_or_backup_change: none

42_3_audit_allowed: false
42_3_measurement_allowed: false
42_3_implementation_allowed: false
tests_and_builds_allowed: false
runtime_verification_allowed: false
live_appdata_allowed: false
dependency_remediation_allowed: false
migration_approved: false
performance_budget_approved: false
mini_image_profile_approved: false

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
project_os_tracking_policy: TRACK_IN_REPOSITORY
project_os_tracking_status: MANUAL_UPDATE_PENDING_COMMIT

---

## 2. Freshness Rule

This file records approved product state and the latest reported repository state. These are different evidence classes.

### Current repository record

Batch `42.3-2` began after a fresh preflight reported local `main` and
`origin/main` synchronized at:

`2ed304740ab809bf910d59b200065303c8eb0df5`

The measurement report states that the primary tracked worktree and staging
remained clean and all untracked entries remained beneath `manual-smoke/`. Its
final measurement-time remote query was not completed; the current
documentation closure performed a fresh preflight query and confirmed the
required baseline. Therefore:

- local repository state is `REPORTED_UNCHANGED_BY_CODEX_MEASUREMENT`;
- the start-of-stage remote match is `REPORTED`;
- the end-of-measurement remote state is `NOT_FRESHLY_RECONFIRMED`;
- this documentation closure is the authorized reconciliation before any new
  technical stage;
- the recorded untracked count is 5,392 and remains informational while all
  entries stay beneath `manual-smoke/`.

The manual Project OS handoff prepared after the measurement report is
expected to modify or add only:

- `docs/ai/01-current-state.md`;
- `docs/ai/03-active-batch.md`;
- `docs/ai/04-session-ledger.md`;
- `docs/ai/07-master-roadmap.md`;
- `docs/ai/archive/session-ledger-2026.md`.

These intended documentation changes must be reconciled and committed through a
controlled Project OS stage after Codex capacity returns. Until then, a dirty
tracked state limited exactly to these five paths is expected and must not be
discarded automatically.

Fresh Git, test, build, inspector, or runtime evidence overrides this recorded
state.

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

Batch `42.2` and its Translation stages are completed historical work. Current active work is Batch `42.3`, with static audit complete and a partial disposable performance baseline recorded.

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
4. Batch 42.3A — Catalog Reference Integrity and Deletion Recovery (closed).
5. Batch 42.3 — Catalog Performance and Media Audit (active; Stage 42.3-2A pending separate approval).
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

## 10. Current Batch Position

### Batch 42.3 — Catalog Performance and Media Audit

Status:

`ACTIVE`

Current proposed stage:

`42.3-2A — Targeted Measurement Completion and Startup Breakdown`

Current stage permission:

`READY_PENDING_SEPARATE_APPROVAL`

Result Review:

`PARTIAL_BASELINE_ACCEPTED`

All measurement, optimization, implementation, test, build, runtime, and
dependency permissions remain `false`.

### Completed Stage 42.3-1

Static architecture audit verdict:

`STATIC_ARCHITECTURE_AUDIT_COMPLETE_MEASUREMENT_REQUIRED`

Recorded static findings include original external images being used for
visible thumbnails, complete-table collection loading before frontend paging,
frontend search/filter/sort, fixed Detail command waterfalls, and no managed
mini-image generation system.

### Completed Stage 42.3-2

Measurement verdict:

`PERFORMANCE_BASELINE_PARTIAL`

Evidence class:

`REPORTED_BY_CODEX`

The dominant measured cost was database preparation/reference initialization:

- Dataset S, 32 Works: about 1.0 second median;
- Dataset M, 256 Works: about 8.6 seconds median;
- Dataset A, 1,000 Works: about 34.1 seconds median.

Process-to-Home usable scaled from about 2.0 seconds to about 35.2 seconds. Direct
representative SQL statements remained below about 1 millisecond median at the
acceptance dataset. Collection frontend transformations remained small at the
measured scale. Page-size-32 scrolling showed no reported frame interval above
16.7 ms. Original source images reached a source-to-render area ratio up to
about 248.5×. Acceptance-dataset aggregate working set was reported around
436–449 MiB without proof of a memory leak.

The baseline is incomplete for page size 256, valid Detail waterfalls, gallery,
realistic image request/decode timing, phase-specific memory, and repeated
missing-source requests. Detail measurement encountered a disposable fixture or
harness identity conflict and must not be treated as a production defect.

No performance budget, mini-image profile, schema/index change, cache change,
UI/UX change, or implementation is approved.

---

## 11. Current Unknowns

The following remain unverified or incomplete:

- exact breakdown inside database preparation/reference initialization;
- whether repeated startup migration or validation work can safely be reduced;
- valid Video, Image, and Performer Detail command waterfalls;
- page-size-256 render, scrolling, and memory behavior;
- realistic photographic image request and decode cost;
- Image gallery behavior at representative scale;
- phase-specific Tauri and WebView2 memory;
- repeated missing-source request behavior;
- final performance budgets for startup, interaction, scrolling, memory, and media;
- final managed mini-image dimensions, encoding, crop behavior, and profiles;
- final remote state after the partial measurement, because the end-of-stage fresh query did not complete.

Do not represent these items as proven until the applicable controlled stage is completed.

---

## 12. Current Blockers

Batch `42.3` is not blocked by a proven product defect, but execution is paused
because the weekly Codex limit is exhausted.

Before any further repository measurement or implementation:

1. manually prepared Project OS replacements must be present;
2. fresh Git preflight must classify the expected five documentation changes;
3. those changes must be reviewed and committed through a documentation-only
   reconciliation stage;
4. Stage `42.3-2A` must receive separate approval;
5. a new disposable evidence root and explicit byte limit must be defined.

These blockers do not prevent discussion, checkpoint review, or product-budget decisions.

---

## 13. Primary Risks

1. The measured 34-second startup cost may be optimized without first proving which validation or migration phase dominates.
2. The disposable Detail identity conflict may be mistaken for a production catalog defect.
3. Backend pagination, virtualization, memoization, cache, or indexes may be implemented despite insufficient evidence.
4. Managed mini-image dimensions may be selected from synthetic low-entropy media rather than realistic source measurements.
5. Manual Project OS changes may be discarded because they are mistaken for unexpected worktree drift.
6. The evidence root may exceed its intended size if further measurements reuse it.
7. Performance work may cross into Batch 42.4, 42.5, 42.6/42.7, or 42.10 without separate approval.
8. Recorded repository state may become stale before Codex capacity returns.

---

## 14. Current Protected Areas

Do not change the following without approved scope:

- existing UI and workflow;
- full-page Form behavior;
- Translation architecture and stored language data;
- database contracts, schema, and public references;
- Credits behavior;
- spreadsheet atomic Apply behavior;
- `.skv` extension and package compatibility;
- managed mini-image retention direction;
- configurable-feature data retention;
- dependency versions;
- live AppData handling;
- manual-smoke evidence policy.

Refer to:

`docs/ai/02-active-locks.md`

for authoritative lock wording.

---

## 15. Recommended Next Action

After Codex weekly capacity returns, perform one controlled documentation-only
Project OS reconciliation stage first.

Expected modified or added tracked paths:

- `docs/ai/01-current-state.md`;
- `docs/ai/03-active-batch.md`;
- `docs/ai/04-session-ledger.md`;
- `docs/ai/07-master-roadmap.md`;
- `docs/ai/archive/session-ledger-2026.md`.

Do not discard these files automatically.

After the documentation state is verified and committed, separately review and
approve or reject:

`42.3-2A — Targeted Measurement Completion and Startup Breakdown`

No further audit, measurement, tests, builds, runtime, optimization, managed
media, schema/index, dependency, UI/UX, or live-data work is approved by this
record.
