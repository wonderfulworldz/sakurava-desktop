# Sakurava Active Batch

## Batch Metadata

batch: 42.3A
title: Catalog Reference Integrity and Deletion Recovery
status: AUDIT_COMPLETE_FIX_REQUIRED
phase: CORRECTIVE_INTEGRITY
current_stage: 42.3A-2 — Dependency-Safe Catalog Deletion Fix
current_mode: READY_PENDING_SEPARATE_APPROVAL
audit_status: COMPLETE_REPORTED
implementation_allowed: false
tests_and_builds_allowed: false
runtime_allowed: false
live_appdata_allowed: false
existing_catalog_repair_allowed: false
dependency_remediation_allowed: false
risk: HIGH
starting_branch: main
starting_baseline: c5ca5c1289b7c621283e05171da2a92386dd994e
batch_42_3_status: SUSPENDED
blocker: catalog deletion can create invalid surviving references

## Audit Closure

Batch `42.3A-1 — Catalog Reference Integrity and Deletion Failure Audit` is
`COMPLETE_REPORTED` with verdict `ROOT_CAUSE_CONFIRMED_FIX_REQUIRED`.

Primary classification: `DELETE_RELATIONSHIP_CASCADE_DEFECT`
Secondary classification: `LIST_DETAIL_QUERY_DIVERGENCE`
Data-risk classification: `POTENTIAL_HIDDEN_ORPHANS`
Operator evidence: `OBSERVED_BY_OPERATOR`
Code and architecture findings: `REPORTED_BY_CODEX_STATIC_AUDIT`

The audit used no live AppData, operator database, Backup package, runtime,
tests, builds, Import, Export, Delete, Save, Retry Validation, Backup, or
Restore. No application or Project OS behavior was changed by the audit.

Accepted findings:

- ordinary parent deletion lacks dependency-safe transactional cleanup;
- surviving Credits and inbound JSON relationships may become dangling;
- Detail loading is validation-gated while collection lists are not;
- recovery errors can appear as misleading not-found states;
- spreadsheet deletion has stronger dependency checks, cleanup planning,
  transactionality, safety backup, final validation, and rollback;
- Restore replaces the database with a prior valid snapshot and is not the
  corrective implementation.

## Proposed 42.3A-2 Scope — Not Approved

The following are candidates only and do not authorize implementation:

In Scope candidates:

- transactional dependency-safe deletion for Video, Image, and Performer;
- Credit and inbound JSON relationship handling;
- final reference validation before commit;
- rollback on failure;
- accurate structured dependency and recovery errors;
- rejection of unsuccessful Credit deletion results;
- focused Rust and frontend regression tests;
- disposable verification and restart verification when later approved.

Separately gated:

- diagnosis or repair of an already invalid operator catalog;
- live AppData access or a read-only database copy;
- repair preview, safety backup, and atomic repair.

Out of Scope:

- performance optimization;
- media-profile implementation;
- broad Backup/Restore hardening;
- package-format changes;
- dependency changes;
- schema migration unless later evidence requires it;
- UI redesign or broad database refactoring;
- silent orphan deletion or silent reference rebuilding.

## Protected Contracts and Boundaries

Applicable contracts remain:

- `LOCK-UI-001`
- `LOCK-CREDITS-001`
- `LOCK-CREDITS-002`
- `LOCK-CREDITS-003`
- `LOCK-CREDITS-004`
- `LOCK-IMPORTEXPORT-001`
- `LOCK-IMPORTEXPORT-002`
- `LOCK-REF-001`
- `LOCK-DATA-001`
- `LOCK-BACKUP-001`
- `LOCK-PACKAGE-001`
- `LOCK-DEPENDENCY-001`
- `LOCK-EVIDENCE-001`
- `LOCK-PROJECTOS-001`

No new Active Lock is required. Existing Credits, reference identity,
spreadsheet atomicity, live-data, Backup/package, evidence, and Project OS
contracts remain in force.

Batch `42.3 — Catalog Performance and Media Audit` remains in the roadmap but
is `SUSPENDED_PENDING_42_3A`. Batch `42.5` retains Catalog performance
implementation scope. Batches `42.6` and `42.7` retain Backup/Restore
hardening scope.

## Next Action

Refresh Project ChatGPT files after this documentation closure, then conduct
Result Review before separately approving or rejecting `42.3A-2`. Existing-
catalog diagnosis or repair requires its own approved recovery stage.
