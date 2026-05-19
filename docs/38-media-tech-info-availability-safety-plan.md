# Media Tech Info and Availability Safety Plan

## Current Checkpoint

- Batch 32.2 - Categories Catalog/Collection V1 Implementation is complete.
- Tag exists: `post-mvp-32-2-categories-catalog-collection-v1`.
- Current batch: 33.1 - Media Tech Info + Availability Safety Plan.
- Batch 33.1 is docs-only.
- Next implementation batch: 33.2 - Video/Picture Form + Detail Tech Info Implementation.

## Purpose

This document defines the safe implementation boundary for Video and Image/Picture Tech Info, availability auto-set behavior, file access, storage, forms, detail pages, catalog compatibility, and verification before any implementation work starts.

The plan prepares these future batches:

- 33.2 - Video/Picture Form + Detail Tech Info Implementation.
- 33.3 - Performer Form + Detail Data Completion.
- 33.4 - Performer Related Detail Sections Implementation.

Batch 33.1 does not implement runtime behavior, UI behavior, schema changes, package changes, or tests.

## Scope

In scope for planning:

- Video Tech Info: Duration, Resolution, File Size, File Type.
- Picture/Image Tech Info: Image Count, Main Resolution, Total File Size, Main File Type.
- Availability auto-set semantics for Video and Image/Picture forms.
- Read-only runtime/Tauri command boundaries.
- SQLite/storage implications and migration questions.
- Form, detail, and catalog compatibility.
- Tests and smoke test plan for future implementation.

Out of implementation scope for 33.1:

- Source code changes.
- Tauri/Rust command changes.
- Database schema changes.
- Package installation.
- Runtime metadata detection.
- UI implementation.
- File scanning or file mutation.

## Definitions

- **Media path**: A saved explicit local path on a record, such as Video `mediaPath`, Image `galleryImagePathsJson` entries, Image `folderPath` reference, or cover/profile paths where applicable.
- **Availability**: The user-facing ownership/status value for whether a local media file or gallery path is owned and accessible.
- **Owned**: A valid saved media path exists and the target is accessible through a safe bounded check.
- **Missing**: A saved media path exists, but the target is missing or inaccessible when checked.
- **Not Owned**: No local media path is saved, so Sakurava should not imply a local copy exists.
- **Tech Info**: Data-backed metadata shown on forms/details and later used by catalog filters.
- **Read-only detection**: File existence or metadata reads that do not write, copy, move, rename, delete, mutate, scan broadly, watch, or index files.
- **Quality bucket**: A derived label such as SD, HD, FHD, 2K, 4K, or 8K based on saved resolution. Prefer deriving this from resolution rather than storing duplicate bucket data.

## Video Tech Info Plan

Future Video Tech Info should support:

- Duration auto-detected.
- Resolution auto-detected.
- File Size auto-detected.
- File Type auto-detected.

Source:

- The selected or saved Video `mediaPath`.
- Existing saved/manual values should remain safe and should not be overwritten before the user saves the form.

Safety rules:

- Detection must be read-only.
- Do not damage, move, copy, rename, delete, rewrite, or tag original files.
- Missing or inaccessible files must not crash the app.
- Manual path typing must remain possible.
- Detection should not run aggressively on every keystroke.
- Detail pages should display only safe values or neutral fallbacks.
- Raw JSON, IDs, UUIDs, and internal command payloads must not appear in normal UI.

Recommended V1 behavior:

- Use existing saved values first when present and valid.
- Use one explicit saved/selected file path as the detection target.
- Use a safe bounded path status check before deeper metadata reads.
- File size can come from Rust/Tauri standard metadata APIs.
- File type can start as a clearly extension-derived label if verified content type is not safely available.
- Duration and resolution should be deferred unless a safe detector exists without risky package/runtime changes. Do not add heavy media probing packages by default.
- If safe duration/resolution detection is unavailable in 33.2, preserve manual/saved values and document the limitation.

Catalog compatibility:

- Batch 32.1 already prepared Video catalog quality/resolution filtering through derived fields.
- 33.2 should connect saved resolution/quality-compatible values to those helpers when values are available.
- Do not treat limited current usefulness of the Quality filter as a 32.1 bug.

## Picture/Image Tech Info Plan

Future Picture/Image Tech Info should support:

- Image Count auto-detected from selected gallery images or a selected gallery path when explicitly requested.
- Main Resolution auto-detected.
- Total File Size auto-detected.
- Main File Type auto-detected.

Sources:

- Explicit saved `galleryImagePathsJson` paths.
- Newly selected gallery images from the form.
- `folderPath` only when the user explicitly chooses a bounded folder action; do not live-scan it on detail load.
- Cover path only if used as the main image source in a specific field.

Safety rules:

- Detection must be read-only.
- No image processing.
- No thumbnail cache or low-res regeneration in this batch family.
- No file copy, move, rename, delete, or write.
- Missing or inaccessible files/folders must not crash.
- Gallery/image count must be bounded and safe.
- Avoid expensive recursive scans unless explicitly planned and limited in a later batch.
- Do not scan child folders by default.
- Detail page should display only safe values or neutral fallbacks.

Recommended V1 behavior:

- Image Count should prefer the normalized explicit `galleryImagePathsJson` length.
- If the form has selected explicit image rows before save, count those rows after trim/remove-empty/dedupe normalization.
- For folder selection, reuse the existing direct-files-only rule from Image Gallery work: one explicit selected folder, direct supported image files only, no child folders.
- Main Resolution can come from the first valid explicit gallery image or cover/main image path only if safe image dimension detection exists.
- Total File Size can sum bounded explicit gallery image paths only after a clear limit is chosen; if the gallery is large, show partial/unavailable rather than freezing the UI.
- Main File Type can start as extension-derived if clearly labeled.

Catalog compatibility:

- Batch 32.1 already prepared Image catalog quality/resolution filtering through derived fields.
- 33.2 should connect saved main resolution/quality-compatible values to those helpers when values are available.
- After 33.2, Image catalog Quality filters should become useful for records with valid saved resolution metadata.

## Availability Auto-Set Plan

Target values:

- `Owned`
- `Not Owned`
- `Missing`

Video Form:

- Base availability on the Media Video path.
- `Owned` = saved/selected video path exists and is accessible.
- `Missing` = saved/selected video path is present but missing or inaccessible.
- `Not Owned` = no video media path is saved.

Picture/Image Form:

- Base availability on explicit media/image/gallery paths.
- `Owned` = at least one saved/selected explicit image path exists and is accessible, or a chosen supported gallery source is accessible.
- `Missing` = one or more saved explicit media paths exist but none can be accessed, or the primary saved path is inaccessible.
- `Not Owned` = no local image/gallery path is saved.

Manual override policy:

- Recommended V1: availability is automatic from the saved/selected path state and is not freely overridden in the same form section.
- If an existing availability field must remain editable for compatibility, show the auto-derived recommendation separately and only write the final value on save.
- Do not create confusing state changes while a user is typing.
- Do not write availability to SQLite until the user saves the form.

Trigger policy:

- Prefer detection on path selection, blur, explicit `Detect` or `Refresh` action, and save-time validation.
- Avoid checking on every keystroke.
- Browser preview should show a safe fallback such as `Available in desktop runtime` or `Not checked`.

Failure policy:

- Command failure should not crash the form.
- In ambiguous runtime failures, prefer preserving the current value or showing `Missing`/`Unknown` guidance rather than overwriting unexpectedly.
- Do not clear paths automatically when a file is missing.

## Runtime/Tauri Command Boundary

Implementation should use existing commands if available:

- Existing path status commands should remain the first choice for existence/accessibility checks.
- Browser-safe fallback should return `unknown` or `notChecked`, not fake filesystem status.

New read-only commands may be added in 33.2 if existing commands are insufficient:

- `media_metadata_probe` or a similarly narrow command for one explicit file path.
- `image_metadata_probe` for one explicit image path.
- `gallery_metadata_probe` only if bounded to explicit saved/selected direct image paths and a clear maximum.

Command rules:

- Read-only only.
- No file delete.
- No file move.
- No file rename.
- No file copy.
- No metadata mutation.
- No external network access.
- No scraping.
- No shell string construction from untrusted paths.
- No recursive scan.
- No watcher.
- No broad drive/folder indexing.
- No package additions unless clearly justified and approved.

Preferred implementation approach:

- Use Rust/Tauri standard filesystem metadata APIs for existence and file size.
- Use extension parsing for initial file type only if the UI clearly treats it as extension-derived.
- For video duration/resolution, use existing stored/manual values if no safe detector exists.
- Defer deep video probing if it requires a risky package, broad runtime dependency, codec handling, or platform-specific binary.
- Document tradeoffs clearly in 33.2 if duration/resolution remain manual or unavailable.

## SQLite/Storage Plan

Potential Video fields:

- `durationMinutes`
- `resolution`
- `fileSizeBytes`
- `fileType`
- `qualityBucket` only if there is a strong reason; prefer derived-only quality from `resolution`.

Potential Image fields:

- `imageCount`
- `mainResolution`
- `totalFileSizeBytes`
- `mainFileType`
- `qualityBucket` only if there is a strong reason; prefer derived-only quality from `mainResolution`.

Availability:

- Reuse the existing availability/status field if one already exists in the current model.
- Avoid duplicate availability fields.
- Keep old records safe: missing or invalid metadata should parse as `null`/unavailable and remain unmatched by specific filters.

Schema guidance:

- 33.1 adds no schema migration.
- 33.2 must inspect current Video and Image models before deciding whether a migration is needed.
- If fields already exist, reuse them.
- If fields do not exist, 33.2 should either plan a small explicit migration or keep values display-only/manual depending on implementation risk.
- Do not silently add duplicate fields with overlapping meaning.
- Use numeric storage for file sizes in bytes if persisted.
- Use numeric storage for duration minutes if persisted.
- Use simple string storage for resolution and file type if persisted.
- Derive quality bucket from resolution in helpers rather than storing duplicate bucket values.

Old record behavior:

- Empty strings, invalid numbers, invalid resolution strings, and missing fields should not crash.
- Old records without metadata should show neutral fallbacks.
- Specific filters should not match invalid/missing metadata unless the filter is `All`.

## UI/Form Behavior Plan

Recommended form flow:

1. User selects or types a media path.
2. App waits for path selection, blur, explicit detect/refresh, or save-time validation.
3. App checks path status safely.
4. App shows detected Tech Info preview.
5. User saves.
6. Saved values appear in Detail.
7. Saved values support catalog filters where applicable.

Rules:

- Manual path typing remains possible.
- Detection should not run on every keystroke.
- Detection preview should be clearly separate from persisted values until save.
- Save should preserve unrelated fields, `categoriesJson`, related JSON, `galleryImagePathsJson`, and `ratingJson`.
- Missing files should not prevent opening the form.
- Missing files should not delete saved paths.
- Do not expose raw filesystem errors directly.
- Do not expose raw JSON/IDs/UUIDs.

Best V1 recommendation:

- Add an explicit lightweight `Detect` or `Refresh` action near Tech Info if auto-on-blur feels too surprising.
- Also perform save-time validation to set availability consistently.
- Keep any detection result best-effort and user-visible before save.

## Detail Display Plan

Video Detail should display:

- Duration.
- Resolution.
- File Size.
- File Type.
- Availability/status display.

Image Detail should display:

- Image Count.
- Main Resolution.
- Total File Size.
- Main File Type.
- Availability/status display.

Display rules:

- No raw path in normal metadata.
- Raw/manual path can remain only in an existing file/path status section if that is the current pattern.
- Missing metadata should show a neutral fallback such as `Not available` or `Not detected yet`.
- Invalid metadata should not crash.
- File size should be formatted for humans while preserving raw byte storage internally if persisted.
- Resolution should be displayed as a safe string such as `1920 x 1080`.
- File type should not claim verified content type unless actually verified.

## Catalog Filter Compatibility

- Batch 32.1 already prepared Resolution/Quality filtering through derived fields.
- 33.2 should connect saved Video `resolution` and Image `mainResolution` values to the existing derived quality helpers.
- Quality buckets should remain predictable:
  - SD
  - HD
  - FHD
  - 2K
  - 4K
  - 8K
- Missing/invalid resolution should return `null` for that record only.
- After 33.2, Video/Image catalog Quality filters should become useful for records with valid saved metadata.
- Do not treat current limited usefulness of Resolution/Quality filters as a 32.1 bug.

## Risk Table

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Metadata detection mutates user files | Data loss or user trust failure | Commands must be read-only and forbid copy/move/rename/delete/write operations. |
| Detection runs on every keystroke | Slow forms and confusing status churn | Trigger on picker selection, blur, explicit detect/refresh, or save-time validation. |
| Missing file crashes form/detail | Broken CRUD workflow | Treat missing/inaccessible files as safe statuses and render neutral fallbacks. |
| Video probing requires risky dependency | Package/runtime bloat or fragile behavior | Use stored/manual values first; defer deep probing unless explicitly approved. |
| Folder path becomes hidden scanner | Performance and privacy risk | Use explicit gallery paths; only direct-files-only folder reads after user action. |
| Large gallery total size freezes UI | Poor performance | Bound gallery metadata checks and report partial/unavailable results if needed. |
| Availability overwrites user intent unexpectedly | Confusing data changes | Do not write before save; show derived preview and keep V1 automatic semantics simple. |
| Duplicate schema fields are added | Long-term model confusion | Inspect current models first and reuse existing fields. |
| Quality bucket stored redundantly | Drift between resolution and bucket | Derive quality from resolution whenever possible. |
| Raw paths or errors leak into normal UI | Privacy/UX issue | Use user-facing labels and keep raw paths only in existing path/status surfaces. |

## Implementation Sequence Recommendation for 33.2

Recommended 33.2 order:

1. Inspect current Video and Image models, form configs, detail configs, and collection mapping.
2. Identify existing availability, duration, resolution, file size, file type, image count, gallery, and path fields.
3. Decide whether existing fields are sufficient or a small explicit migration is required.
4. Add or reuse safe parsers/formatters for duration, resolution, file size, file type, and image count.
5. Add read-only runtime wrappers only if existing commands are insufficient.
6. Implement Video form detection preview and save behavior.
7. Implement Image form detection preview and save behavior.
8. Implement Video Detail safe display.
9. Implement Image Detail safe display.
10. Connect saved resolution/mainResolution to Batch 32.1 catalog quality helpers.
11. Add focused tests.
12. Run smoke tests with existing, missing, and empty paths.

Do not combine 33.2 with Performer data completion or related detail sections unless the user explicitly changes the batch.

## Tests and Smoke Test Plan

Future automated tests:

- Unit tests for path status mapping.
- Unit tests for metadata parsing helpers.
- Unit tests for quality bucket derivation from resolution.
- Unit tests for safe file size formatting.
- Runtime command tests for read-only metadata if commands are added.
- Form tests for availability behavior.
- Form tests that detection preview does not save before explicit save.
- Detail tests for safe display of present, missing, and invalid metadata.
- Regression tests for no raw JSON, ID, or UUID in normal UI.
- Catalog filter tests after saved resolution/mainResolution fields become available.

Manual smoke test:

1. Add/edit Video with an existing media file path.
2. Add/edit Video with a missing path.
3. Add/edit Video with no path.
4. Confirm Video availability states: Owned, Missing, Not Owned.
5. Confirm Video Detail Tech Info and neutral fallbacks.
6. Add/edit Image/Gallery with existing explicit image paths.
7. Add/edit Image/Gallery with missing paths.
8. Add/edit Image/Gallery with no paths.
9. Confirm Image availability states: Owned, Missing, Not Owned.
10. Confirm Image Detail Tech Info and neutral fallbacks.
11. Restart app and confirm persisted values remain.
12. Confirm Video/Image catalog quality filters remain safe and become useful when saved resolution exists.
13. Confirm no destructive file operation occurs.
14. Confirm no raw JSON/ID/UUID appears in normal UI.

Recommended verification for 33.2:

```powershell
npm.cmd run test
npm.cmd run build
Push-Location src-tauri; cargo test; Pop-Location
npm.cmd run tauri dev
```

## Explicit Out of Scope for 33.1

- Implementation code.
- Auto-detection runtime code.
- Schema migration.
- Package installation.
- Thumbnail cache.
- Low-res regeneration.
- Backup/Restore.
- Import/Export.
- Settings redesign.
- Dark Mode.
- Language system.
- Scraping.
- Media player.
- File copy.
- File move.
- File rename.
- File delete.
- File mutation.
- Recursive scanning.
- Watchers/live sync.
- Category Visibility.
- Performer related detail implementation.

## Agent Continuation Rules

Future agents:

- Read this document before Batch 33.2.
- Keep 33.1 docs-only.
- Do not implement 33.2 inside 33.1.
- Keep detection read-only and bounded.
- Reuse existing path status/runtime commands where safe.
- Inspect current models before adding fields.
- Prefer deriving quality from resolution.
- Do not add packages or schema migrations without explicit batch approval.
- Preserve `categoriesJson`, `galleryImagePathsJson`, related JSON, and `ratingJson`.
- Do not expose raw JSON, IDs, UUIDs, or raw internal command data.
- Do not mutate, copy, move, rename, delete, or generate media files.
- Keep next batch as 33.2 - Video/Picture Form + Detail Tech Info Implementation unless the user explicitly changes the roadmap.

## Checkpoint

Expected checkpoint tag after merge:

```text
post-mvp-33-1-media-tech-info-availability-safety-plan-v1
```

## 33.2 Implementation Note

Batch 33.2 implemented the planned Video/Image-only V1 behavior with a read-only `media_metadata_probe` command for one explicit path at a time. The implementation persists Video `resolution`, `fileSizeBytes`, and `fileType`, and Image `mainResolution`, `totalFileSizeBytes`, and `mainFileType`, while reusing existing `durationMinutes`, `imageCount`, and `availability`.

Detection is explicit through a small Detect action and also runs at save time. It reads file existence, file size, extension-derived type, and basic image dimensions for supported image files. It does not add video duration/resolution probing, package dependencies, recursive scanning, file mutation, thumbnail/cache generation, or hidden database writes before save.

## 33.2.1 Implementation Note

Batch 33.2.1 adds true Video Duration and Video Resolution detection for normal Windows-readable video files through Windows Shell media properties. The detector remains read-only, checks one explicit file path at a time, does not shell out to `ffmpeg`/`ffprobe`, and does not copy, move, rename, delete, rewrite, tag, index, or scan media files.

Windows Shell may not expose media properties for every container, codec, corrupt file, or inaccessible path. In those cases the app keeps the 33.2 honest fallback behavior: Duration and Resolution show "Not detected yet", while File Size, File Type, and Availability continue to use the existing safe path metadata behavior.
