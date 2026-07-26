# Sakurava Active Batch

## Batch Metadata

batch: 42.3
title: Catalog Performance and Media Audit
status: ACTIVE
phase: CONTROLLED_MEASUREMENT
current_stage: 42.3-2A-R3-R2 — Production-Equivalent Fixture and Startup Instrumentation Verification
current_stage_status: READY_PENDING_SEPARATE_APPROVAL
completed_stage_42_3_1: COMPLETE_REPORTED
stage_42_3_2_status: PERFORMANCE_BASELINE_PARTIAL_REPORTED
stage_42_3_2_result_review: PARTIAL_BASELINE_ACCEPTED
stage_42_3_2a_r1_status: COMPLETED_AND_CLOSED
stage_42_3_2a_r1_result: BUILD_STRATEGY_VALIDATED_WITH_REBUILD_REQUIRED
stage_42_3_2a_r2_status: PARTIAL_RESULT_ACCEPTED
stage_42_3_2a_r2_result_review: TARGETED_MEASUREMENT_PARTIAL_ACCEPTED
parent_stage_42_3_2a_status: INCOMPLETE
r3_attempt_status: STOPPED_WORKSPACE_LIMIT
r3_result_review: R3_PARTIAL_STATIC_RESULT_ACCEPTED
r3_r1_status: PARTIAL_RESULT_ACCEPTED
r3_r1_result_review: R3_R1_PARTIAL_ACCEPTED
next_stage_boundary: FINAL_BOUNDED_RETRY_RECOMMENDED_NOT_AUTHORIZED
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
recorded_repository_head: 2b0f994800281042ea92a8b93a8a55fb99a43659
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

## Accepted R3 Partial Static Result

R3 stopped safely when its external workspace reached 4,685,178,294 bytes
against a 3,500,000,000-byte hard limit. The retained evidence was 31,943
bytes. Static mapping proves that application status and recovery gates use
`classify_sakurava_ref_migration_state`; catalog page sizes 32, 64, 128, and
256 are accepted with default 32; and the mapped `database_prepare` chain ends
at schema initialization and Credit-type migration, outside application
reference-status validation. The fixture-generator contract, same-database
comparison, invalid Credit rows, internal phase timing, and instrumentation
runtime behavior remain UNKNOWN or NOT_MEASURABLE_IN_CURRENT_ENVIRONMENT.

No production defect, repair, optimization, or implementation is authorized.

R3-R1 retained evidence was 54,879 bytes; workspace peak was 135,642,641
bytes; the Cargo target was 131,758,144 bytes; and the standalone release
diagnostic build completed in 27.7 seconds. The S and A trace boundaries were
930 and 9,245 microseconds respectively, always classified as
`INSTRUMENTATION_VERIFICATION_ONLY`. Graphify remains completed external
advisory tooling with status `READY_WITH_DOCS_ONLY_DRIFT`; no Graphify file
changed.

## Accepted R3-R1 Partial Result

Title:

`Generator Contract Recovery and Bounded Instrumentation Build`

Result Review:

`R3_R1_PARTIAL_ACCEPTED`

Accepted evidence:

- bounded standalone Rust diagnostic build strategy succeeded;
- measurement and runtime-root gates rejected invalid roots;
- reconstructed S/A database comparison returned `Migrated` with unchanged
  hashes;
- S/A traces completed as `INSTRUMENTATION_VERIFICATION_ONLY`;
- exact R2 generator remained unavailable and the reconstruction was not
  equivalent;
- the historical R2 conflict remains unresolved.

No production defect, repair, optimization, or implementation is authorized.

## Proposed Stage 42.3-2A-R3-R2

Title:

`Production-Equivalent Fixture and Startup Instrumentation Verification`

Status:

`READY_PENDING_SEPARATE_APPROVAL`

This is the recommended final bounded retry, not authorization. It would require
a reproducible fixture contract, the actual production classifier against
byte-identical copies, and markers linked to the actual `prepare_database` path.
If that cannot complete safely, Batch 42.3 should proceed to partial audit
closure with explicit limitations.

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
