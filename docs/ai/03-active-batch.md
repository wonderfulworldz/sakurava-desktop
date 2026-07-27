# Sakurava Active Batch

## Batch Metadata

batch: 42.4
title: Managed Mini Media Foundation
status: ACTIVE
phase: PROCESSOR_FOUNDATION_RECONCILED
current_administrative_stage: 42.4-6C — Managed Media Processor Foundation Result and Baseline Reconciliation
current_stage_status: COMPLETED_AND_CLOSED
next_technical_stage: 42.4-7 — Managed Media Journaled Publication and Recovery Foundation
next_stage_status: READY_PENDING_SEPARATE_APPROVAL
stage_42_4_5d_status: COMPLETED_AND_CLOSED
batch_42_3_status: PARTIAL_AUDIT_ACCEPTED_AND_CLOSED
implementation_allowed: false
audit_allowed: false
tests_and_builds_allowed: false
runtime_allowed: false
measurement_allowed: false
architecture_planning_allowed: false
database_allowed: false
backup_restore_allowed: false
package_allowed: false
dependency_allowed: false
ui_ux_allowed: false
live_appdata_allowed: false
manual_smoke_allowed: false

recorded_repository_baseline: a6a629dd39175a77ec6f96d62ac222a672a7640c
application_source_baseline: a6a629dd39175a77ec6f96d62ac222a672a7640c
prior_contract_schema_storage_foundation_baseline: e1772ea92dac3e59ed533173fb5ed4fbb5acfdc4

## Authority State

Batch `42.3` remains `PARTIAL_AUDIT_ACCEPTED_AND_CLOSED`. Its accepted R2
baseline and explicit limitations carry forward; no repair, optimization,
performance budget, or implementation was established. Deferred Import/Export
feedback remains outside Batch 42.4.

Batch `42.4` remains administratively active. Stage `42.4-1` completed as a
read-only audit with verdict `MANAGED_MINI_MEDIA_AUDIT_COMPLETE` and Result
Review `MANAGED_MINI_MEDIA_AUDIT_ACCEPTED_WITH_DECISION_GAPS`. Stage `42.4-2`
reconciles the accepted audit with the operator-approved canonical ratio and
standard-tier decisions. No source or runtime compliance is implied.

Stage `42.4-3 — Bounded Canonical Slot Runtime Measurement` is accepted as
`PARTIAL_RESULT_ACCEPTED_AND_CLOSED` with Result Review
`CANONICAL_SLOT_MEASUREMENT_PARTIAL_ACCEPTED_TIER_LADDER_REVISED_BY_OPERATOR`.
It executed 17 configurations and loaded 408 measurements across all four
families. Actual host DPR was `1.25`; DPR up to `2.0` was emulated. The host
capped actual `1600×900` and `1920×1080` windows, and the related-square helper
had no routed runtime call site. Active related content uses Standard `4:3`.
The evidence root remains local and untracked; live AppData, manual smoke, and
implementation were not used.

The following is a historical, superseded 42.4-3C measurement record. It is
retained for evidence continuity and does not override the accepted 42.4-4 and
42.4-5 foundation decisions below. Stage `42.4-3C — Measurement Result and
Standard Dimension Reconciliation` is
`COMPLETED_AND_CLOSED`. The approved names are `LANDSCAPE_16_9`,
`STANDARD_4_3`, `SQUARE_1_1`, and `PORTRAIT_4_5`. The exactly three standard
tiers are `THUMBNAIL`, `MEDIUM`, and `LARGE` with maximum boxes `320×320`,
`1280×1280`, and `1920×1920`. Standard and Square have no initial Large.
Source-size eligibility checks both dimensions after crop; no-upscale behavior
and `NATIVE_FALLBACK` as a non-tier state are required. Targeted/missing-only
regeneration, validation, last-valid preservation, safe replacement, protected
originals, and no startup-wide regeneration remain required.

Stage `42.4-4 — Managed Media Architecture and Implementation Plan` is
`COMPLETED_AND_ACCEPTED`. Stage `42.4-5 — Managed Media Contract, Schema, and
Protected Storage Foundation` is `COMPLETED_AND_ACCEPTED`, and Stage `42.4-5C`
is `COMPLETED_AND_CLOSED`. The implementation baseline is
`e1772ea92dac3e59ed533173fb5ed4fbb5acfdc4`.

The accepted foundation consists of the shared role/profile contract, Rust and
TypeScript validation, additive transactional tables
`managed_media_items`, `managed_media_variants`, and
`managed_media_operations`, protected `<app_data_dir>/managed-media/v1/`
paths, and deterministic identity wrappers. It is inert and non-operational:
there is no processor, generation, publication, recovery, frontend descriptor,
ratio correction, UI, Translation, or Backup integration.

Stage `42.4-6 — Managed Media Processor Dependency and Decode/Encode
Foundation` is `COMPLETED_AND_ACCEPTED`; administrative Stage `42.4-6C`
is `COMPLETED_AND_CLOSED`. The accepted application/source baseline is
`a6a629dd39175a77ec6f96d62ac222a672a7640c`, with prior contract/schema/
storage foundation baseline `e1772ea92dac3e59ed533173fb5ed4fbb5acfdc4`.

The pure Rust processor provides bounded streaming SHA-256, JPEG/PNG/GIF
first-frame/static-WebP decoding, EXIF orientation normalization, centered
canonical crop, no-upscale eligibility, `NATIVE_FALLBACK`, Lanczos3 resize,
JPEG/PNG encoding, and reopen validation. Current inputs are JPEG, PNG, GIF
first frame, and static WebP; animated WebP, AVIF, HEIC, TIFF, BMP, SVG, and
unsupported embedded profiles fail closed. Limits and JPEG quality are
`INFERRED_INITIAL_DEFAULT_PENDING_VERIFICATION`, not product budgets.
Synthetic PSNR and timing are regression evidence only; memory is
`NOT_MEASURABLE_IN_CURRENT_ENVIRONMENT`.

The processor remains inert: no Tauri command, database access, managed-root
write, queue, publication, recovery, CRUD hook, frontend integration,
Backup/Restore integration, or visible UI exists. The next technical stage is
`42.4-7 — Managed Media Journaled Publication and Recovery Foundation`,
status `READY_PENDING_SEPARATE_APPROVAL`; all technical permissions remain
false.

## Accepted Verification and Limitations

`REPORTED_BY_CODEX`: processor tests 14 passed, fingerprint tests 4 passed,
focused GIF test 1 passed, full Rust suite 164 passed with 0 failures,
`cargo check`, final `cargo fmt --check`, `git diff --check`, and staged diff
check passed. Synthetic JPEG PSNR was 43.494 dB against a 30 dB test guard;
synthetic PNG preserved processed pixels and alpha exactly. Synthetic timing
probes were 6,031 ms for a sequential in-memory batch of 20, 22,776 ms for
opaque 4000x3000 processing, and 32,414 ms for alpha 3000x4000 processing.
These are environment-specific measurements, not product budgets or
operational concurrency proof. Production quality, catalog compatibility,
throughput, concurrency, lifecycle, and publication remain unknown.

## Approved Product Boundary

Prior decision ID:

`FIXED_EXISTING_SLOT_RATIOS_WITH_CONTEXT_SPECIFIC_MULTI_SIZE_MINI_MEDIA`

Reconciled decision ID:

`CANONICAL_RATIOS_WITH_LIMITED_STANDARD_VARIANTS_AND_SAFE_REGENERATION`

Existing slot ratios, shapes, layout allocation, and visual hierarchy remain
protected. Managed mini media follows the slot rather than a universal ratio.
Slots with materially equivalent aspect ratio, crop or contain behavior,
rendered-size range, visual purpose, and scaling requirements may share a profile
family; unique areas retain distinct families.

Approved active managed-media families are exactly `LANDSCAPE_16_9`,
`STANDARD_4_3`, `SQUARE_1_1`, and `PORTRAIT_4_5`. `5:3`, `11:14`, dormant
unrouted Category `3:2`, and the unrouted related-square helper are not
approved profile families. Full cards use Landscape `16:9`; active mini/lite
and related cards use Standard `4:3`. The initial foundation has exactly three
tiers: `THUMBNAIL`, `MEDIUM`, and `LARGE`; arbitrary per-page sizes and extra
tiers require separate approval. Approved dimensions and family ceilings are
recorded in `LOCK-MEDIA-001`; architecture and schema foundation work are
accepted and implemented inertly.

Managed mini media preserves source aspect ratio and existing crop/contain
behavior. Stretching, distortion, changing a slot ratio, independent
proportion-breaking scaling, and source upscaling are not allowed. Generation
and regeneration are bounded by source-size eligibility, relevant source
changes, missing/invalid/outdated outputs, or targeted selection; they use
isolated staging and validation before replacement, preserve last-valid output,
and must not regenerate the whole catalog at startup. A source below Thumbnail
may use `NATIVE_FALLBACK`, which is not a tier.

Coverage includes applicable catalog media for covers, gallery images, Performer
visuals, Category visuals, Glossary visuals, Video posters or representative
frames, and other catalog-media areas identified by the audit. UI assets,
Translation assets, development screenshots, manual-smoke evidence, full
external originals, and temporary decode cache are excluded.

## Audit Scope When Separately Approved

Stage `42.4-1` may inspect existing media-bearing slots, current aspect ratios,
CSS/layout/object-fit behavior, responsive rendered ranges, Windows display
scaling, media source types, gallery/Category/Glossary behavior, current storage
and references, candidate profile families and minimum variants, lifecycle,
fallback, regeneration, Backup boundary interactions, and verification needs.

It must not perform implementation, schema or migration work, package work,
generation-library selection, or runtime changes.

## Protected Lifecycle and Backup Boundary

Managed mini media remains a catalog asset, not disposable cache. Source media
remains externally referenced; mini media remains useful when the source is
unavailable; failed regeneration preserves the last valid output; replacement
occurs only after validating new output; generic Clear Cache must not remove it;
and startup must not regenerate all mini media automatically. The full viewer
uses the original first and the largest valid managed representation only as a
missing-source fallback.

Managed mini media is intended for `.skv` Backup and Restore, while actual
package implementation remains assigned to Batches `42.6` and `42.7`. Batch 42.4
does not implement Backup/Restore.

## Smoke-Test Timing

No smoke test runs in this documentation closure. A visual/profile smoke gate is
required only after rendering/profile selection is implemented and automated
verification passes. It must check protected slot ratios, Video/Image covers,
Performer, gallery, Category, Glossary, variant selection, sharpness,
crop/contain behavior, no distortion, layout stability, and workflow stability.

A lifecycle/fallback smoke gate is required only after generation,
regeneration, persistence, and missing-source behavior are implemented and
automated verification passes. It must check available and missing originals,
fallback visibility, failed and successful regeneration, restart persistence,
and absence of uncontrolled startup mass regeneration.

Backup/Restore smoke remains assigned to Batches `42.6` and `42.7`.

## Next Technical Stage

`42.4-7 — Managed Media Journaled Publication and Recovery Foundation`

Status: `READY_PENDING_SEPARATE_APPROVAL`

Stage 42.4-6 is completed and accepted, and Stage 42.4-6C is closed. The
processor foundation is inert and does not perform generation, publication,
recovery, CRUD integration, frontend integration, cleanup, or Backup/Restore
work. Any 42.4-7 work remains separately gated and must use disposable roots
and databases without live AppData, operator media, or manual smoke.

## Change Boundary

This stage changes Project OS documentation only. No source, tests, builds,
runtime, database, schema, migration, dependencies, packages, Graphify,
Backup/Restore implementation, UI/UX, live data, operator data, or
`manual-smoke/` is authorized to change.
