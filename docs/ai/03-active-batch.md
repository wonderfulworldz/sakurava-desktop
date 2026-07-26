# Sakurava Active Batch

## Batch Metadata

batch: 42.3
title: Catalog Performance and Media Audit
status: ACTIVE
phase: CONTROLLED_MEASUREMENT
current_stage: 42.3-2A-R3 — Fixture Validation Contract and Startup Instrumentation Completion
current_stage_status: READY_PENDING_SEPARATE_APPROVAL
completed_stage_42_3_1: COMPLETE_REPORTED
stage_42_3_2_status: PERFORMANCE_BASELINE_PARTIAL_REPORTED
stage_42_3_2_result_review: PARTIAL_BASELINE_ACCEPTED
stage_42_3_2a_r1_status: COMPLETED_AND_CLOSED
stage_42_3_2a_r1_result: BUILD_STRATEGY_VALIDATED_WITH_REBUILD_REQUIRED
stage_42_3_2a_r2_status: PARTIAL_RESULT_ACCEPTED
stage_42_3_2a_r2_result_review: TARGETED_MEASUREMENT_PARTIAL_ACCEPTED
parent_stage_42_3_2a_status: INCOMPLETE
audit_allowed: false
measurement_allowed: false
tests_and_builds_allowed: false
runtime_allowed: false
implementation_allowed: false
schema_index_allowed: false
cache_allowed: false
pagination_allowed: false
virtualization_allowed: false
managed_media_allowed: false
backup_restore_allowed: false
package_allowed: false
dependency_allowed: false
import_export_allowed: false
translation_allowed: false
ui_ux_allowed: false
live_appdata_allowed: false
risk: HIGH
starting_branch: main
recorded_repository_head: a7e33dc8400af486759e7a96bb960a51c9a6bc52
application_source_baseline: 2ed304740ab809bf910d59b200065303c8eb0df5

## Accepted R1 Result

R1 is `COMPLETED_AND_CLOSED` with verdict
`BUILD_STRATEGY_VALIDATED_WITH_REBUILD_REQUIRED`. The shared detached clone,
locked dependency reuse, offline Cargo cache, external compiler workspace, and
exact cleanup boundary were validated as reported by Codex. Future measurement
must rebuild reproducibly; compiler output and runtime data remain outside
retained `manual-smoke/` evidence.

## Accepted R2 Partial Result

R2 Result Review is `TARGETED_MEASUREMENT_PARTIAL_ACCEPTED`.

Measured evidence includes:

- S: 32 Works; M: 256 Works; A: 1,000 Works;
- `database_prepare` medians of approximately 1.0 s, 8.6 s, and 35.5 s;
- at least five successful cold and warm observations per dataset;
- database preparation as the dominant measured scaling boundary;
- page-size-256 controls rejected for Videos, Images, and Performers;
- 142 frontend `image_error` events, including 46 in the A interaction pass;
- external workspace peak of 1,891,699,735 bytes and retained evidence of
  3,963,889 bytes.

The fixture generator reported `Migrated` with no issues, while the
application reference-status path reported invalid Credit references. The
contract conflict remains `UNKNOWN` and is not a production-defect finding.
Internal startup phases remain unknown. Detail, gallery, complete image timing,
phase memory, repeated missing-source, and metadata-preservation evidence remain
incomplete. No memory leak was proven.

## Proposed Stage 42.3-2A-R3

Title:

`Fixture Validation Contract and Startup Instrumentation Completion`

Status:

`READY_PENDING_SEPARATE_APPROVAL`

Proposed boundary only:

- map fixture-generator validation against application reference validation;
- map the actual supported page-size control contract;
- add measurement-only phase markers inside the current `database_prepare`
  path;
- run focused disposable instrumentation-integrity verification;
- defer broad performance reruns until fixture validity is established;
- do not measure Detail or gallery until validation contracts agree.

R3 is not approved by this document. No technical permission is granted.

## Supported and Unsupported Conclusions

Supported conclusions are limited to the measured startup scaling, valid
external build-workspace separation, repeated missing-source events with usable
Home/collection routes, and the explicit measurement gaps above.

Current evidence does not authorize backend pagination, virtualization, schema or
index changes, a general cache, broad memoization, search debounce, asynchronous
decode changes, final media profiles, managed mini images, UI redesign, Backup or
Restore changes, package or dependency work, migration, or implementation.

## Batch Boundaries

- Batch 42.4: managed mini-image foundation;
- Batch 42.5: performance implementation after measurement and approval;
- Batch 42.6/42.7: Backup and Restore boundaries;
- Batch 42.10: separately approved UI polish;
- deferred Import/Export feedback remains outside Batch 42.3.

## Protected Contracts

- LOCK-UI-001
- LOCK-UI-002
- LOCK-UI-003
- LOCK-TRANSLATION-001
- LOCK-MEDIA-001
- LOCK-BACKUP-001
- LOCK-CREDITS-001
- LOCK-CREDITS-002
- LOCK-CREDITS-003
- LOCK-CREDITS-004
- LOCK-IMPORTEXPORT-001
- LOCK-IMPORTEXPORT-002
- LOCK-REF-001
- LOCK-DATA-001
- LOCK-PACKAGE-001
- LOCK-DEPENDENCY-001
- LOCK-EVIDENCE-001
- LOCK-PROJECTOS-001
