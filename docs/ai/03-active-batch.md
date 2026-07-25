# Sakurava Active Batch

## Batch Metadata

batch: 42.3
title: Catalog Performance and Media Audit
status: ACTIVE
phase: CONTROLLED_MEASUREMENT
current_stage: 42.3-2A — Targeted Measurement Completion and Startup Breakdown
current_mode: PERFORMANCE_BASELINE_PARTIAL_REPORTED
audit_allowed: false
measurement_allowed: false
implementation_allowed: false
tests_and_builds_allowed: false
runtime_allowed: false
live_appdata_allowed: false
dependency_remediation_allowed: false
risk: HIGH
starting_branch: main
recorded_repository_baseline: 2ed304740ab809bf910d59b200065303c8eb0df5
codex_capacity_status: PAUSED_WEEKLY_LIMIT_EXHAUSTED
project_os_update_mode: MANUAL_HANDOFF_WITH_LEDGER_ARCHIVE_PENDING_REPOSITORY_COMMIT
result_review: PARTIAL_BASELINE_ACCEPTED
optimization_permission: false
measurement_permission: false
implementation_permission: false

## Completed Stage 42.3-1 — Static Architecture Audit

Status:

`COMPLETE_REPORTED`

Verdict:

`STATIC_ARCHITECTURE_AUDIT_COMPLETE_MEASUREMENT_REQUIRED`

Recorded findings:

- Catalog cards and table thumbnails use original external images rather than a reduced representation;
- complete entity tables are loaded before frontend pagination;
- search, filtering, and sorting run in React over the loaded collection;
- Detail pages use fixed command waterfalls and may load complete peer collections;
- no managed mini-image generation system was found;
- actual timing, memory, query plans, rendered dimensions, image decode cost, and scrolling behavior required controlled measurement.

No implementation occurred.

## Completed Stage 42.3-2 — Controlled Disposable Performance Measurement

Status:

`PERFORMANCE_BASELINE_PARTIAL_REPORTED`

Evidence class:

`REPORTED_BY_CODEX`

Primary repository baseline is recorded as:

`2ed304740ab809bf910d59b200065303c8eb0df5`

Disposable evidence root:

`manual-smoke/42.3-2-performance-measurement-20260722/`

Recorded fixture sizes:

- Dataset S: 32 Works, 16 Performers, 64 Credits;
- Dataset M: 256 Works, 128 Performers, 1,024 Credits;
- Dataset A: 1,000 Works, 320 Performers, 4,000 Credits.

Dominant measured result:

- database preparation/reference initialization scaled from about 1.0 second at Dataset S to about 34.1 seconds at Dataset A;
- process-to-Home usable scaled from about 2.0 seconds to about 35.2 seconds;
- direct representative SQL statements remained below about 1 millisecond median at Dataset A;
- collection frontend transformations remained low at the measured scale;
- page-size-32 scrolling showed no measured frame interval above 16.7 ms;
- rapid search caused repeated pipeline execution and supports later debounce evaluation;
- original source images reached a measured source-to-render area ratio up to about 248.5×;
- Dataset A aggregate working set was reported around 436–449 MiB without proof of a memory leak.

Measurement gaps:

- true page-size-256 behavior;
- Video, Image, and Performer Detail waterfalls;
- Image gallery behavior;
- exact realistic image request/decode timing;
- phase-specific memory;
- repeated missing-source request behavior;
- fixture or harness identity conflict that caused Detail resolution to return recovery-required;
- final fresh remote query was not completed after execution quota exhaustion.

No optimization, managed-media system, schema/index change, cache change, UI/UX change, dependency change, or product implementation occurred.

## Current Proposed Stage — 42.3-2A

Title:

`Targeted Measurement Completion and Startup Breakdown`

Status:

`READY_PENDING_SEPARATE_APPROVAL`

Required focus:

- break down database preparation/reference initialization cost;
- resolve the disposable fixture or measurement-harness Detail identity conflict without hidden repair;
- measure valid Video, Image, and Performer Detail waterfalls;
- measure actual page size 256;
- measure gallery behavior and realistic photographic image request/decode cost;
- capture phase-specific process memory;
- complete missing-source repeated-request evidence;
- use a new disposable evidence root with an explicit byte limit;
- finish fresh primary and remote Git verification.

This stage is not approved by this document and remains pending separate approval.

The current action is a documentation-only reconciliation of the accepted
partial baseline. No technical execution is authorized. The expected
documentation scope is exactly:

- `docs/ai/01-current-state.md`;
- `docs/ai/03-active-batch.md`;
- `docs/ai/04-session-ledger.md`;
- `docs/ai/07-master-roadmap.md`;
- `docs/ai/archive/session-ledger-2026.md`.

## Batch Boundaries

Potential later work remains separated:

- Batch 42.4: managed mini-image generation, profiles, safe replacement, and retained fallback assets;
- Batch 42.5: startup/database/query/render performance changes supported by measurement;
- Batch 42.6/42.7: managed-media Backup and Restore compatibility;
- Batch 42.10: separately approved visible UI polish only when supported;
- future Import/Export feedback remains outside Batch 42.3.

No final performance budget, media profile, mini-image dimensions, database migration, or optimization implementation is approved.

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
