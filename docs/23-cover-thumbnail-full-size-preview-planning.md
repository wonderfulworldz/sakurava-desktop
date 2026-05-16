# 23 - Cover/Thumbnail Full Size Preview Planning

## 1. Purpose

Cover/Thumbnail Full Size Preview should let users click visible cover and thumbnail images on detail pages to view them larger.

The feature should make saved images more useful and enjoyable to inspect without turning Sakurava into a full image manager, folder manager, gallery browser, or folder scanner. It should stay local-only, explicit-path-only, and safe.

## 2. Current Scope

This batch is documentation/planning only.

Do not make implementation changes in this batch:

- No implementation.
- No UI changes.
- No Rust/Tauri changes.
- No backend/schema changes.
- No tests.
- No package changes.

The goal is to define safe preview boundaries before any future implementation begins.

## 3. User Intent

Clarified user goal:

- User wants simple full-size image viewing from detail pages.
- User wants Video Detail cover preview.
- User wants Image/Picture Detail cover preview.
- User wants Performer Detail cover/profile preview.
- User wants Performer Detail 4 mini thumbnails to become functional too, but only through a safe staged plan.
- User does not require a custom complex image manager.
- User does not require Windows folder browsing.
- User does not require folder scanner behavior.
- User wants the easiest safe approach that preserves Sakurava as a local catalog app.

## 4. Target Interfaces

### Primary Scope

Future intended surfaces:

- Video Detail:
  - `coverPath` image can be clicked for larger preview.
- Image/Picture Detail:
  - `coverPath` image can be clicked for larger preview.
- Performer Detail:
  - `coverPath` / profile image can be clicked for larger preview.

These surfaces already map to explicit saved record fields in current code.

### Conditional Planned Scope

Performer Detail:

- 4 mini thumbnails can be clicked for larger preview only if each thumbnail is backed by an explicit saved image path.
- If these thumbnails are placeholder-only or not persisted, do not implement them in the first preview implementation.
- Plan a separate storage/form/detail batch for Performer mini thumbnail paths if needed.

Current code inspection shows:

- Performer records currently persist `coverPath`.
- Performer records do not currently persist 4 mini thumbnail image paths.
- Performer form data includes planned `thumbnail1`, `thumbnail2`, `thumbnail3`, and `thumbnail4` placeholders.
- Performer Detail currently renders 4 mini thumbnails from placeholder `techItems`, not saved image paths.

Therefore, Performer mini thumbnail full-size preview must be deferred until explicit saved thumbnail paths exist.

### Out of Scope

- Collection page thumbnails.
- Form page image preview.
- Image folder gallery from `folderPath`.
- Gallery next/back.
- Folder scanning.
- Thumbnail generation or regeneration.

## 5. Performer 4 Mini Thumbnail Plan

The user wants the 4 Performer mini thumbnails to become functional, but they must not be fake/static UI-only elements.

Safety requirements:

- Each mini thumbnail should be backed by an explicit saved local image path.
- Do not infer mini thumbnails by scanning folders.
- Do not reuse random related Images automatically.
- Do not auto-fill from performer name, title, search, or scraped data.
- Do not add mini thumbnail preview to implementation until data storage and form editing behavior are clear.

Recommended future data approach:

- Add explicit persisted paths for up to 4 Performer mini thumbnails in a separate planning/storage batch if they do not already exist.

Possible future field direction:

- `performerThumbnailPathsJson`
- or `thumbnail1Path`, `thumbnail2Path`, `thumbnail3Path`, `thumbnail4Path`

This planning batch does not choose the final storage shape. The final shape should be decided only after reviewing schema, form UX, migration risk, and whether a JSON array or fixed fields better fits Sakurava's post-MVP direction.

Recommended staged plan for mini thumbnails:

1. Plan Performer mini thumbnail data/storage if missing.
2. Implement Performer form fields for 4 mini thumbnail paths if missing.
3. Display the 4 mini thumbnails on Performer Detail from saved paths.
4. Add full-size preview for those thumbnails.

## 6. Preview Behavior Options

### Option A - Open Image With Default OS Image Viewer

Pros:

- Simplest native behavior.
- Uses Windows Photos or the configured default app.
- No in-app modal required.
- Similar to external Video `Play` handoff.

Cons:

- Leaves Sakurava context.
- No consistent UI.
- No easy next/back later.
- Less integrated for quick cover/profile inspection.

### Option B - Simple In-App Modal

Pros:

- Better user experience.
- User stays inside Sakurava.
- Good for cover/profile/mini thumbnail inspection.
- Can reuse currently rendered/allowed local asset source if safe.
- Keeps the behavior distinct from OS file management.

Cons:

- Needs frontend modal UI.
- Must handle missing/inaccessible images safely.
- Must not become gallery/folder scanning behavior.

### Recommended Direction

- Use a simple in-app modal for cover/profile/thumbnail preview if existing local asset display already supports the image safely.
- Keep external OS image open as fallback or later option only if modal access is not safe.
- Do not add next/back until Image Gallery is planned separately.
- Do not use `folderPath` scanning for Image Detail.

## 7. Relationship With Existing Media Status

Existing foundation:

- Batch 24.2 added `path_status_check`.
- Batch 24.2 added `checkPathStatus`.
- Batch 24.3 added detail page Media File Status display.
- Batch 24.5 added external media open runtime.
- Batch 24.6 added Video Detail `Play` for `mediaPath`.

Preview should use Media File Status rules where practical:

- If `coverPath` status is `exists`, preview can be enabled.
- If a future Performer mini thumbnail path exists and status is `exists`, preview can be enabled.
- If status is `notSet`, `missing`, `inaccessible`, or `unknown`, preview should be disabled or preserve placeholder behavior.
- Detail page must still render if status check fails.
- Existing placeholder behavior must remain.
- Missing image should never crash the detail page.

Browser preview should remain safe. If local asset conversion or desktop runtime is unavailable, the app should preserve placeholder/fallback behavior and not expose raw filesystem errors.

## 8. Modal UX Plan

Future modal behavior:

- User clicks a visible cover/thumbnail image.
- App opens a modal overlay with a larger image.
- Modal includes a close button.
- Escape key and backdrop close can be supported if easy and safe.
- Modal shows a short title/label, for example:
  - `Video Cover`
  - `Image Cover`
  - `Performer Cover`
  - `Performer Thumbnail 1`
  - `Performer Thumbnail 2`
  - `Performer Thumbnail 3`
  - `Performer Thumbnail 4`

Modal boundaries:

- No edit controls.
- No delete controls.
- No move/rename/write controls.
- No filesystem management.
- No path editing.
- No next/back in this batch unless cycling through explicitly saved Performer mini thumbnails is separately approved.
- No folder scan.
- No raw path exposure beyond paths already shown in the app.

## 9. Safety Rules

Mandatory rules:

- No folder scanning.
- No recursive image loading.
- No image gallery next/back in this batch.
- No file mutation.
- No delete/move/rename/write operations.
- No schema/database changes in the preview implementation unless a later explicit storage batch approves it.
- No record mutation from preview.
- No external upload/network.
- No scraping.
- Preserve placeholder fallback.
- Do not expose raw IDs.
- Do not change Video `Play` behavior.
- Do not change category behavior.
- Do not change related picker behavior.
- Do not change Backup/Restore behavior.

## 10. Entity-Specific Plan

### Video Detail

- Allow cover image preview only.
- Use `coverPath`, not `mediaPath`, for image preview.
- Do not change Video `Play` button behavior.
- Do not add video preview or embedded player.

### Image/Picture Detail

- Allow cover image preview only.
- Do not scan `folderPath`.
- Do not build gallery yet.
- Gallery from `folderPath` is deferred to Image Gallery planning.

### Performer Detail

- Allow cover/profile preview from `coverPath`.
- Support 4 mini thumbnail preview only when explicit saved thumbnail paths exist.
- If 4 mini thumbnail path storage does not exist, treat it as a future storage/form/detail requirement.
- Do not hardcode fake mini thumbnails.
- Do not scan folders to find mini thumbnails.

## 11. Testing Plan

Future implementation should test:

- Video Detail cover can open preview.
- Image Detail cover can open preview.
- Performer Detail cover can open preview.
- Performer mini thumbnail can open preview when explicit saved path exists.
- Performer mini thumbnail placeholder does not open preview when no saved path exists.
- Modal closes safely.
- Escape key closes modal if implemented.
- Backdrop closes modal if implemented.
- Missing image preserves placeholder and does not crash.
- No preview button/action appears for missing path if unsafe.
- No `folderPath` scanning.
- No gallery next/back.
- No record mutation.
- Video `Play` button still works.
- No category behavior changes.
- No related picker behavior changes.

## 12. Non-Goals / Deferred

Explicitly deferred:

- Implementation in this batch.
- Image gallery.
- Gallery next/back.
- `folderPath` scanning.
- Thumbnail generation.
- Thumbnail regeneration.
- Image import/export.
- Video player.
- Video preview.
- Open/reveal folder.
- File missing scanner.
- Broad UI polish.
- Performer mini thumbnail storage implementation if missing.
- Performer form mini thumbnail editing if missing.

## 13. Future Batch Sequence

Recommended sequence:

1. Batch 24.7 - Cover/Thumbnail Full Size Preview Planning.
2. Batch 24.8 - Cover/Thumbnail Full Size Preview Implementation for existing explicit paths only.
3. Batch 24.9 - Performer Mini Thumbnail Storage/Form Planning, only if 4 mini thumbnail paths are not currently persisted.
4. Batch 24.10 - Performer Mini Thumbnail Storage/Form Implementation, only if needed.
5. Batch 25.1 - Image Gallery Planning.
6. Batch 25.2 - Image Gallery Viewer Implementation.

Batch boundaries:

- Batch 24.8 should be limited to explicit existing cover/thumbnail paths.
- If Performer 4 mini thumbnails do not have persisted paths, they must not be forced into Batch 24.8.
- Batch 25.1 is where `folderPath` gallery and next/back should be discussed.
- Do not combine 24.8 with gallery scanning.
- Do not mix thumbnail storage schema changes into preview modal implementation.

## 14. Agent Notes

Future agents:

- Do not implement from this planning batch.
- Do not build gallery from `folderPath` yet.
- Do not change Video `Play` behavior.
- Do not revive `Reveal in Folder` unless the user explicitly asks.
- Keep this separate from Image Gallery.
- Keep Performer 4 mini thumbnails functional in the plan, but do not fake them.
- Preserve existing Media File Status behavior.
- Preserve existing app behavior.
- Push back if an implementation tries to scan folders or invent thumbnail data.
- Treat the current Performer 4 mini thumbnails as placeholder-only until explicit saved paths exist.

## 15. Related Documents

- [docs/21-media-file-status-open-file-planning.md](21-media-file-status-open-file-planning.md) - Media File Status / Open File planning baseline.
- [docs/22-external-media-open-planning.md](22-external-media-open-planning.md) - External media open planning.
- [docs/11-prd-alignment-and-development-plan.md](11-prd-alignment-and-development-plan.md) - Current post-MVP standard.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.
- [docs/WORKFLOW_GIT.md](WORKFLOW_GIT.md) - Git and verification workflow.

## 16. Checkpoint

This documentation batch establishes the Cover/Thumbnail Full Size Preview planning baseline.

Checkpoint tag:

```text
post-mvp-24-7-cover-thumbnail-full-size-preview-planning-v1
```
