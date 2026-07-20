# Sakurava Current State

## 1. State Metadata

project: Sakurava Desktop  
repository: D:\sakurava-desktop  
application_stack: React + Tauri  

product_state_updated_at: 2026-07-20  
repository_state_recorded_at: 2026-07-20  
repository_state_status: PROVEN_AT_AUDIT_TIME  
repository_state_evidence: LOCAL_GIT_AND_GITHUB_WEB  
remote_main_verified: true  
tracked_worktree_clean: true  
untracked_entry_count: 106  

default_branch: main  
remote_branch: origin/main  
last_recorded_baseline: f41abe6eb582e72d8253ef75c4519ce93c2fa405  
baseline_label: merge add credits spreadsheet CRUD  

legacy_batch_series: 41.x  
legacy_batch_series_status: CLOSED  
last_completed_batch: 41.9  
last_completed_batch_title: Translation Containment and Architecture Baseline  
last_completed_batch_status: COMPLETED_AND_CLOSED  
last_completed_batch_type: CORRECTIVE_TRANSLATION_REPAIR  
last_completed_batch_completion_basis: OPERATOR_CONFIRMED  
previous_feature_batch: 41.8.5C  

new_roadmap_series: 42.x  
last_completed_roadmap_batch: 42.1  
last_completed_roadmap_batch_title: GitHub and Repository Health Triage  
last_completed_roadmap_batch_status: CLOSED  
active_batch: 42.2  
active_batch_title: Translation Containment  
active_batch_phase: PENDING_ACTIVATION  
active_batch_mode: DISCUSSION  
audit_status: COMPLETE_WITH_CLASSIFIED_FINDINGS  
audit_allowed: false  
implementation_allowed: false  
project_os_tracking_policy: TRACK_IN_REPOSITORY  
project_os_tracking_status: COMPLETED_BY_DOCUMENTATION_COMMIT  
batch_42_1_closure_reference: THIS_DOCUMENTATION_COMMIT  

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

This file records the latest approved product state and the most recent repository evidence.

These are different evidence classes.

### Product State

Product decisions dated 2026-07-20 remain authoritative unless explicitly replaced through an approved Project OS change.

### Repository State

The Batch `42.1` audit verified the following state on 2026-07-20:

- repository root: `D:\sakurava-desktop`;
- active branch: `main`;
- HEAD: `f41abe6eb582e72d8253ef75c4519ce93c2fa405`;
- detached HEAD: no;
- staged changes: none;
- tracked modifications: none;
- local `main` and GitHub `main`: same commit;
- untracked entries: 106;
- `docs/ai/`: 8 untracked Project OS files;
- `SAKURAVA-CHATGPT-BOOT-PROMPT.md`: untracked;
- `manual-smoke/`: present and untracked.

This evidence is:

`PROVEN_AT_AUDIT_TIME`

It does not guarantee that the repository remains unchanged after the audit.

Before later implementation, Git closure, release work, package work, or recovery, recheck the Git state when the intervening actions could have changed it.

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
- Batch `42.1 — GitHub and Repository Health Triage`: active and preparing closure;
- Batch `42.2 — Translation Containment`: planned after Batch 42.1 closure;
- Batch `42.11 — Translation Release Completion`: planned after shared UI stabilization.

Batch `42.1` has completed its classification audit with no immediate security blocker proven.

Implementation remains unauthorized.

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

The Batch `42.1` read-only audit established:

### Git

- local branch: `main`;
- local HEAD: `f41abe6eb582e72d8253ef75c4519ce93c2fa405`;
- GitHub branch: `main`;
- GitHub latest commit: `f41abe6` — `merge add credits spreadsheet CRUD`;
- local and GitHub main matched at audit time;
- staged changes: none;
- tracked modifications: none;
- untracked entries: 106.

### Untracked Authority and Evidence

- `SAKURAVA-CHATGPT-BOOT-PROMPT.md`: untracked;
- `docs/ai/`: 8 untracked Project OS files;
- `manual-smoke/`: 97 untracked evidence entries.

The operator approved:

`PROJECT_OS_TRACKING_POLICY: TRACK_IN_REPOSITORY`

The Project OS authority files must be committed through a controlled explicit-path Git closure.

`manual-smoke/`, runtime databases, temporary exports, logs, and generated smoke artifacts remain local and untracked.

### GitHub Security and Governance

- Dependabot alerts: 7 open, 2 closed;
- severity distribution: 1 High, 3 Moderate, 3 Low;
- code scanning: disabled;
- secret scanning: disabled;
- classic branch protection: not configured;
- repository rulesets: none configured;
- a dynamic CodeQL run was created during evidence collection but failed at startup and produced no scanning result;
- no persistent code-scanning configuration was observed;
- no immediate security blocker was proven.

No source, dependency, package, or repository remediation was performed.

---

## 7. Last Completed Batch

### Batch 41.9 — Translation Containment and Architecture Baseline

Status:

`COMPLETED_AND_CLOSED`

Completion type:

`CORRECTIVE_TRANSLATION_REPAIR`

Recorded completed purpose:

- correct the Translation section changed by Codex outside approved scope;
- restore the approved Translation boundary;
- preserve English core and user-managed language contracts;
- preserve existing working Translation data and CSV support;
- prevent completed corrective work from being repeated as new roadmap work;
- consolidate unresolved Translation plans into Batch `42.2` and Batch `42.11`.

Closure basis:

`OPERATOR_CONFIRMED`

The historical repository evidence for Batch `41.9` has not been freshly re-verified during this documentation correction.

No new test, build, commit, merge, or push claim is added by this Project OS update.

### Previous Verified Feature Batch — Batch 41.8.5C

Batch `41.8.5C — Credits Spreadsheet CRUD` remains the previous feature batch with detailed recorded technical verification.

Recorded capability:

- Credits XLSX and CSV export;
- spreadsheet Preview;
- Add, Update, and Delete;
- relationship validation;
- duplicate Add warning;
- stale Preview protection;
- final-state capacity validation;
- safety backup;
- atomic Apply;
- rollback protection;
- restart persistence.

Recorded verification:

- focused frontend tests: 151 passed;
- Rust tests: 122 passed;
- production build: passed;
- export inspector regression: passed;
- formatting and diff checks: passed;
- disposable manual smoke: passed;
- restart persistence: passed;
- safety backup: verified;
- live AppData mutation: not observed.

These results apply only to the recorded Batch `41.8.5C` baseline.

Authoritative Credits contracts remain in:

`docs/ai/02-active-locks.md`

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

## 10. Current Batch Position

### Batch 42.1 — GitHub and Repository Health Triage

Status:

`CLOSED`

Closure result:

`COMPLETE_WITH_CLASSIFIED_FINDINGS`

Closure reference:

`THIS_DOCUMENTATION_COMMIT`

No immediate security blocker was proven. Project OS tracking was approved and completed through the documentation-only closure commit. Dependency remediation remains separate and implementation remains not approved.

Any future work that starts the Vite development server must wait for an approved targeted security-remediation stage.

### Batch 42.2 — Translation Containment

Status:

`PENDING_ACTIVATION`

Batch `42.2` is the next planned batch. It is not activated by this closure and may initially contain discussion and read-only Translation audit preparation only.

---

## 11. Current Unknowns

The following remain unverified or intentionally deferred:

- code-scanning results, because code scanning is disabled;
- secret-scanning results, because secret scanning is disabled;
- whether branch protection and repository rulesets should be introduced;
- exact remediation versions and compatibility impact for the seven Dependabot alerts;
- current Translation implementation;
- current managed mini-image implementation;
- current Catalog performance bottlenecks;
- current `.skv` package structure and compatibility;
- current Restore atomicity and rollback;
- current configurable-feature architecture;
- current application and interface icon implementation;
- current Windows installer configuration;
- current minimum supported Windows build.

Do not represent these items as proven until the applicable future audit or implementation batch is completed.

---

## 12. Current Blockers

Batch `42.1` closure remains blocked until:

- the approved Project OS authority files are updated with the final audit result;
- only the approved Project OS files are staged;
- `manual-smoke/` and other local artifacts are confirmed untracked;
- the staged diff is reviewed;
- a documentation-only commit is created and synchronized;
- the resulting Git baseline is recorded;
- Batch `42.1` is marked closed.

Application implementation remains blocked because:

- Batch `42.1` is classification and closure only;
- dependency remediation is not approved;
- Vite `7.3.3` remains affected by two current alerts;
- any future work that starts a Vite development server must wait for a dedicated approved security-remediation stage;
- Batch `42.2` implementation scope has not been approved.

Batch `42.2` read-only requirement and architecture discussion may begin only after Batch `42.1` closure.

---

## 13. Primary Risks

1. Project OS authority files may remain local-only if closure is not completed.
2. Broad Git staging could accidentally include `manual-smoke/`, runtime databases, exports, or logs.
3. Vite development-server work may expose the developer to the current `launch-editor` NTLMv2 alert until targeted remediation occurs.
4. Code scanning and secret scanning are disabled, so absence of alerts from those systems is not proof of repository safety.
5. Branch `main` has no classic protection and no repository ruleset.
6. Dependency remediation may be mixed into Translation or feature work.
7. Completed Batch 41.9 corrective work may be confused with unresolved Translation work in Batch 42.2 and Batch 42.11.
8. Later roadmap work may begin without recording the Batch 42.1 findings and baseline.

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

Prepare one controlled Codex `CLOSURE` prompt for:

`Batch 42.1 — Stage 2: Project OS Tracking and Git Closure`

The closure must:

- update only approved Project OS authority files;
- stage only explicit approved paths;
- exclude `manual-smoke/` and all runtime or generated artifacts;
- verify the staged diff;
- create one documentation-only commit;
- synchronize with GitHub safely;
- report the resulting baseline;
- avoid source, dependency, workflow, package, test, build, or remediation changes.

Do not activate Batch `42.2` until Batch `42.1` closure is proven.
