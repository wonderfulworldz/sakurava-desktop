# Sakurava Active Batch

## Batch Metadata

batch: 42.4
title: Managed Mini Media Foundation
status: ACTIVE
phase: AUDIT_FIRST
current_administrative_stage: 42.4-0 — Batch Activation and Managed Mini Media Product Boundary Reconciliation
current_stage_status: COMPLETED_AND_CLOSED
next_technical_stage: 42.4-1 — Managed Mini Media Slot, Profile, and Lifecycle Audit
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

Batch `42.4` is administratively active and audit-first. Stage `42.4-0` only
reconciled Project OS and recorded the approved product boundary. It did not
inspect source, audit runtime behavior, or authorize implementation.

Stage `42.4-1` is pending separate approval and, when approved, is `AUDIT ONLY`.
It must not be treated as implementation approval.

## Approved Product Boundary

Decision ID:

`FIXED_EXISTING_SLOT_RATIOS_WITH_CONTEXT_SPECIFIC_MULTI_SIZE_MINI_MEDIA`

Existing slot ratios, shapes, layout allocation, and visual hierarchy remain
protected. Managed mini media follows the slot rather than a universal ratio.
Slots with materially equivalent aspect ratio, crop or contain behavior,
rendered-size range, visual purpose, and scaling requirements may share a profile
family; unique areas retain distinct families.

Each family may have multiple pixel-size variants. Rendering selects the
smallest sufficient variant for the current rendered requirement and display
scaling. Exact dimensions, variant count, format, encoding quality, crop anchor,
focal-point metadata, naming, storage path, database representation, and all
generation parameters remain `UNKNOWN` pending audit and later approval.

Managed mini media preserves source aspect ratio and existing crop/contain
behavior. Stretching, distortion, changing a slot ratio, independent
proportion-breaking scaling, and unnecessary enlargement of a smaller source
are not allowed.

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
and startup must not regenerate all mini media automatically.

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

## Change Boundary

This stage changes Project OS documentation only. No source, tests, builds,
runtime, database, schema, migration, dependencies, packages, Graphify,
Backup/Restore implementation, UI/UX, live data, operator data, or
`manual-smoke/` is authorized to change.
