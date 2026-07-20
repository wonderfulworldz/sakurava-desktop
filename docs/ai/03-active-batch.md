# Sakurava Active Batch

## 1. Batch Metadata

batch: 42.1  
title: GitHub and Repository Health Triage  
status: CLOSED  
phase: COMPLETE  
current_stage: Stage 2 — Project OS Tracking and Git Closure  
current_mode: CLOSURE  
audit_status: COMPLETE_WITH_CLASSIFIED_FINDINGS  
audit_allowed: false  
implementation_status: NOT_STARTED  
implementation_allowed: false  
git_closure_allowed: COMPLETED  
closure_status: COMPLETED_BY_THIS_DOCUMENTATION_COMMIT  
next_batch: 42.2  
next_batch_title: Translation Containment  
next_batch_status: PENDING_ACTIVATION  
project_os_tracking_policy: TRACK_IN_REPOSITORY  
risk_level: MEDIUM  

starting_branch: main  
last_recorded_baseline: f41abe6eb582e72d8253ef75c4519ce93c2fa405  
recorded_git_state_verified: true  

legacy_batch_series: 41.x  
legacy_batch_series_status: CLOSED  
last_completed_batch: 41.9  
last_completed_batch_status: COMPLETED_AND_CLOSED  
last_completed_batch_type: CORRECTIVE_TRANSLATION_REPAIR  
previous_feature_batch: 41.8.5C  
previous_roadmap_batch: 42.0  
previous_roadmap_batch_status: COMPLETED  

approved_scope: DOCUMENTATION_AND_CONTROLLED_GIT_CLOSURE_ONLY  
master_roadmap: docs/ai/07-master-roadmap.md  
last_updated: 2026-07-20  

---

## 2. Purpose

This file records the active state of Batch 42.1.

Batch 42.1 prepares a controlled read-only review of GitHub and repository-health findings.

Its purpose is classification and roadmap placement, not remediation.

Batch 42.1 is not:

- a dependency-upgrade batch;
- a security-remediation batch;
- a repository-cleanup batch;
- a CI-rewrite batch;
- a Translation batch;
- a feature batch;
- a package or release batch.

Permanent workflow rules belong in:

`docs/ai/00-operating-contract.md`

Permanent product and safety contracts belong in:

`docs/ai/02-active-locks.md`

Recorded project state belongs in:

`docs/ai/01-current-state.md`

Recent continuity belongs in:

`docs/ai/04-session-ledger.md`

The approved roadmap belongs in:

`docs/ai/07-master-roadmap.md`

---

## 3. Batch-Series Context

The legacy Batch 41.x series is closed.

- Batch `41.8.5C — Credits Spreadsheet CRUD` is the previous completed feature batch.
- Batch `41.9 — Translation Containment and Architecture Baseline` completed the corrective repair of the Translation section changed by Codex outside approved scope.
- Batch `41.9` is recorded as `COMPLETED_AND_CLOSED`.
- Completed Batch `41.9` corrections remain historical and must not be reimplemented.
- Unresolved Translation audit and containment work is consolidated into Batch `42.2`.
- Release-facing Translation completion is consolidated into Batch `42.11`.
- Batch `42.2` and Batch `42.11` continue unresolved work; they do not duplicate the completed corrective work from Batch `41.9`.
- Batch `42.0` completed the Master Roadmap and Project OS baseline.
- Batch `42.1` is the first active technical-roadmap batch.

Closing Batch `41.9` confirms completion of its corrective scope only. It does not mark the future Batch `42.2` or Batch `42.11` scope as complete.

---

## 4. Current Objective

Complete Batch `42.1` through controlled documentation and Git closure.

The audit has finished with classified findings and no immediate security blocker proven.

The remaining objective is to preserve the approved Project OS authority in the repository without including application source or local evidence.

---

## 5. Completed Stages

### Stage 0 — Scope Definition

**Status:** COMPLETE  
**Mode:** DISCUSSION

The operator approved the read-only audit contract, evidence categories, sensitive-data rules, classification model, report format, and stop conditions.

### Stage 1 — Read-Only Audit and Evidence Reconciliation

**Status:** COMPLETE_WITH_CLASSIFIED_FINDINGS  
**Mode:** AUDIT ONLY

Verified at audit time:

- local branch `main`;
- local HEAD `f41abe6eb582e72d8253ef75c4519ce93c2fa405`;
- GitHub `main` at the same commit;
- no staged or tracked changes;
- 106 untracked entries;
- 7 open Dependabot alerts;
- code scanning disabled;
- secret scanning disabled;
- classic branch protection absent;
- repository rulesets absent;
- no immediate security blocker proven.

A dynamic CodeQL run was created during evidence collection, failed at startup, and produced no scanning results. No persistent code-scanning configuration or repository-file mutation was observed.

---

## 6. Current Stage

### Stage 2 — Project OS Tracking and Git Closure

**Status:** SCOPE_APPROVED_PROMPT_PENDING  
**Mode:** CLOSURE  
**Audit Allowed:** No  
**Implementation Allowed:** No  
**Git Closure Allowed:** Not yet

### Purpose

Record the final Batch `42.1` result, track Project OS authority files, create one documentation-only commit, verify synchronization, and close the batch.

### Approved Tracking Policy

Track:

- `SAKURAVA-CHATGPT-BOOT-PROMPT.md`;
- `docs/ai/00-operating-contract.md`;
- `docs/ai/01-current-state.md`;
- `docs/ai/02-active-locks.md`;
- `docs/ai/03-active-batch.md`;
- `docs/ai/04-session-ledger.md`;
- `docs/ai/05-model-routing.md`;
- `docs/ai/06-feedback-log.md`;
- `docs/ai/07-master-roadmap.md`.

Keep local and untracked:

- `manual-smoke/`;
- runtime databases;
- temporary exports;
- logs;
- generated smoke artifacts;
- build output;
- dependency directories.

---

## 7. Final Audit Findings

### Repository State

- local and GitHub `main` matched at `f41abe6eb582e72d8253ef75c4519ce93c2fa405`;
- tracked worktree was clean;
- 106 untracked entries existed;
- Project OS authority files were untracked;
- `manual-smoke/` remained untracked local evidence.

### Dependabot

Seven open alerts were classified:

1. Vite `server.fs.deny` bypass — High — current configured workflow is localhost-only; remediation belongs to Batch `42.13`.
2. Vite/`launch-editor` NTLMv2 disclosure — Moderate — development-machine risk may exist while the Vite server is running and the developer visits attacker-controlled content; targeted remediation is required before any future Vite dev-server work.
3. `uuid` buffer bounds — Moderate — affected API not currently used; non-blocking Batch `42.13` item.
4. `serde_with` `KeyValueMap` panic — Moderate — no current data path identified; review before packaging or release.
5. `@babel/core` arbitrary file read — Low — build tooling; non-blocking Batch `42.13` item.
6. React Router CSRF — Low — affected data-router/document-request APIs not currently used.
7. `esbuild` arbitrary file read — Low — no directly started network-exposed esbuild server; non-blocking Batch `42.13` item.

### GitHub Security and Governance

- Dependabot: enabled;
- code scanning: disabled;
- secret scanning: disabled;
- security policy: enabled;
- security advisories: enabled;
- private vulnerability reporting: enabled;
- classic branch protection: not configured;
- repository rulesets: none configured.

### Release and Repository Inputs

- application version remains `0.0.0`; assign to Batch `42.14`;
- branch protection, scanning setup, workflow governance, and optional `manual-smoke/` ignore strategy remain future repository/security decisions;
- no remediation occurred during Batch `42.1`.

---

## 8. Roadmap Placement

### Before Any Future Vite Dev-Server Work

A dedicated approved dependency/security remediation stage must address the Vite `7.3.3` alerts before work that starts the Vite development server.

This remediation must remain separate from Translation and feature implementation.

### Batch 42.12 — Repository Professionalization

Candidate inputs:

- repository hygiene policy;
- optional `manual-smoke/` ignore strategy;
- documentation organization after Project OS tracking;
- branch and workflow governance classification.

### Batch 42.13 — Dependency and Security Remediation

Assigned inputs:

- Vite alerts;
- `uuid`;
- `serde_with`;
- `@babel/core`;
- `esbuild`;
- code-scanning and secret-scanning decisions;
- dependency compatibility and focused verification.

### Batch 42.14 — Windows Identity and Packaging

Assigned input:

- replace the pre-release version `0.0.0` through an approved release-version decision.

### Batch 42.2 — Translation Containment

Read-only scope definition and architecture audit may begin after Batch `42.1` closes.

Translation implementation, tests, builds, or dev-server execution remain unauthorized and must not begin before the required security-remediation decision.

---

## 9. Primary Applicable Locks

Directly applicable:

- `LOCK-SECURITY-001`;
- `LOCK-DEPENDENCY-001`;
- `LOCK-EVIDENCE-001`;
- `LOCK-PACKAGE-001`;
- `LOCK-DATA-001`;
- `LOCK-PROJECTOS-001`.

All other Active Locks remain protected regression boundaries.

---

## 10. Closure Scope

Approved documentation work:

- record the final audit result in Project OS;
- record the Project OS tracking decision;
- update the current stage to closure;
- prepare a documentation-only commit.

Not yet authorized until a controlled closure prompt is approved:

- staging;
- commit;
- remote synchronization;
- branch changes.

Never authorized by this batch:

- application-source modification;
- dependency changes;
- workflow configuration changes;
- GitHub security-setting changes;
- repository cleanup;
- tests or builds;
- Translation work;
- package or release changes.

---

## 11. Required Closure Verification

Before commit:

- verify branch and HEAD;
- verify tracked changes;
- verify all untracked entries;
- stage only the explicit Project OS paths;
- confirm `manual-smoke/` is not staged;
- confirm runtime databases, exports, logs, build output, and dependency directories are not staged;
- inspect the staged diff;
- confirm no application source, dependency, workflow, or package file is staged.

After commit and synchronization:

- record the commit SHA;
- verify local and GitHub main synchronization;
- verify tracked worktree state;
- verify protected local evidence remains untracked;
- update Current State and Session Ledger if the final SHA differs from the pre-closure record.

---

## 12. Definition of Done for Batch 42.1

Batch `42.1` may close only when:

- final findings are recorded;
- Project OS tracking policy is recorded;
- approved authority files are tracked;
- no application source or dependency file is included;
- no local evidence is staged;
- the documentation-only commit is verified;
- local and GitHub main synchronization is verified;
- the final baseline is recorded;
- Current State is updated;
- Active Batch is closed or replaced by the next approved batch;
- Session Ledger is updated.

Tests, builds, and manual smoke are not required for this documentation-only closure.

---

## 13. Current Decisions

### Approved

- Batch `42.1` audit findings are accepted.
- No immediate security blocker is proven.
- Project OS authority files must be tracked in the repository.
- `manual-smoke/` and other local evidence remain untracked.
- Dependency remediation remains separate.
- Batch `42.2` may begin with discussion and read-only audit only after Batch `42.1` closure.
- Future Vite dev-server work must wait for targeted security remediation.
- Implementation permission remains false.

### Not Yet Approved

- the exact Codex closure prompt;
- Git staging or commit execution;
- dependency remediation;
- code-scanning or secret-scanning enablement;
- branch protection or ruleset changes;
- repository cleanup;
- Batch `42.2` activation.

---

## 14. Closure Record

Batch `42.1` is closed by the documentation-only commit represented by:

`THIS_DOCUMENTATION_COMMIT`

The final audit status is `COMPLETE_WITH_CLASSIFIED_FINDINGS`.

No immediate security blocker was proven. The seven Dependabot alerts remain classified, with dependency remediation assigned separately to Batch `42.13`.

Batch `42.2` is the next planned batch with status `PENDING_ACTIVATION`.

Batch `42.2` is not activated by this record. Translation inspection, implementation, tests, builds, and Vite dev-server execution remain prohibited until separately approved. Future work that starts the Vite development server must wait for an approved targeted security-remediation stage.

Implementation remains blocked.

---

## 15. Active Feedback

None recorded.

Refer to:

`docs/ai/06-feedback-log.md`

when active unresolved feedback exists.

---

## 16. Next Recommended Action

Operator review and explicit activation decision for:

`Batch 42.2 — Translation Containment`

Required future mode:

`DISCUSSION` or an explicitly approved later stage

Batch `42.2` must not begin until the operator explicitly activates it.
