# Sakurava Active Batch

## Batch Metadata

batch: 42.4
title: Managed Mini Media Foundation
status: ACTIVE
phase: DOCUMENTATION_ONLY_RECONCILIATION
current_administrative_stage: 42.4-2 — Canonical Ratio and Standard Variant Decision Reconciliation
current_stage_status: COMPLETED_AND_CLOSED
next_technical_stage: 42.4-3 — Bounded Canonical Slot Runtime Measurement
next_stage_status: READY_PENDING_SEPARATE_APPROVAL
batch_42_3_status: PARTIAL_AUDIT_ACCEPTED_AND_CLOSED
implementation_allowed: false
audit_allowed: false
tests_and_builds_allowed: false
runtime_allowed: false
measurement_allowed: false
database_allowed: false
backup_restore_allowed: false
package_allowed: false
dependency_allowed: false
ui_ux_allowed: false
live_appdata_allowed: false
manual_smoke_allowed: false

recorded_repository_baseline: 853e677fb16b85a836a6ef8f62640a8efde37ed9
application_source_baseline: 2ed304740ab809bf910d59b200065303c8eb0df5

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

Stage `42.4-3 — Bounded Canonical Slot Runtime Measurement` is the next proposed
stage and is `READY_PENDING_SEPARATE_APPROVAL` in `MEASUREMENT ONLY` mode. It
must not correct ratios, generate media, change storage, or authorize
implementation.

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

Approved active managed-media families are exactly `WIDE_16_9`,
`MINI_CARD_4_3`, `SQUARE_1_1`, and `PERFORMER_PORTRAIT_4_5`. `5:3`, `11:14`,
and dormant unrouted Category `3:2` are not approved profile families. Full
cards and mini/lite cards remain separate contexts. The initial foundation has
at most three standard logical tiers: `SMALL`, `MEDIUM`, and `LARGE`; families
may use fewer tiers, but arbitrary per-page sizes and extra tiers require
separate approval. Exact dimensions and architecture remain pending.

Managed mini media preserves source aspect ratio and existing crop/contain
behavior. Stretching, distortion, changing a slot ratio, independent
proportion-breaking scaling, and unnecessary enlargement of a smaller source
are not allowed. Generation is bounded to relevant source changes or targeted
regeneration, uses isolated staging and validation before replacement, preserves
last-valid output, and must not regenerate the whole catalog at startup.

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

No smoke test runs in this documentation stage. A visual/profile smoke gate is
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

## Next Proposed Stage

`42.4-3 — Bounded Canonical Slot Runtime Measurement`

Status: `READY_PENDING_SEPARATE_APPROVAL`

When separately approved, this stage is `MEASUREMENT ONLY`. It may measure
logical and physical rendered envelopes for the four approved ratio families,
representative window sizes, UI scale 90/100/110, and measurable approved
Windows display-scaling cases. It may determine whether a family needs one,
two, or three standard tiers and provide evidence for exact dimensions. It
must not correct ratios, generate media, select format or quality, implement
storage, change database/package behavior, or use live AppData.

## Change Boundary

This stage changes Project OS documentation only. No source, tests, builds,
runtime, database, schema, migration, dependencies, packages, Graphify,
Backup/Restore implementation, UI/UX, live data, operator data, or
`manual-smoke/` is authorized to change.
