# 24 - Performer Mini Thumbnail Storage/Form Planning

## 1. Purpose

Performer Mini Thumbnail Storage/Form should make the 4 mini thumbnails on Performer Detail functional by backing them with explicit saved local image paths.

The future feature should let users:

- save up to 4 Performer mini thumbnail image paths;
- edit those paths through Performer create/edit forms;
- display those saved paths as mini thumbnails on Performer Detail;
- later open each valid mini thumbnail in the existing full-size preview modal.

This must not turn Sakurava into a folder scanner, gallery manager, image manager, or file manager.

## 2. Current Scope

This batch is documentation/planning only.

Do not make implementation changes in this batch:

- No implementation.
- No UI changes.
- No Rust/Tauri changes.
- No backend/schema changes.
- No tests.
- No package changes.

The goal is to define storage, form, detail, and preview boundaries before implementation.

## 3. User Intent

The clarified user goal:

- Performer Detail should keep the main cover/profile image.
- Performer Detail should also support 4 functional mini thumbnails.
- Mini thumbnails should be clickable or full-size later.
- Mini thumbnails must not be fake or static UI-only placeholders.
- Mini thumbnails must be backed by explicit saved local image paths.
- The user does not want folder scanning.
- The user wants paths picked or saved through the normal Performer form flow.
- The user wants the easiest safe approach that preserves Sakurava as a local catalog app.

## 4. Current State Assumption

Current code inspection shows explicit persisted mini thumbnail paths do not exist yet.

Observed current state:

- `src/backend/types.ts`
  - `Performer` has `coverPath`.
  - `Performer` does not have mini thumbnail path fields.
- `src/backend/schema.ts`
  - `performers` table has `coverPath`.
  - `performers` table does not have mini thumbnail path columns.
- `src-tauri/src/database.rs`
  - Runtime SQLite schema has `coverPath`.
  - Runtime SQLite schema does not have mini thumbnail path columns.
- `src-tauri/src/commands.rs`
  - Performer create/update/read logic maps `coverPath`.
  - Performer create/update/read logic does not map mini thumbnail paths.
- `src/lib/performerIntegration.ts`
  - Performer detail and form mapping use `coverPath`.
  - `thumbnail1`, `thumbnail2`, `thumbnail3`, and `thumbnail4` are set to `Not saved in MVP` placeholders.
- `src/lib/detailData.ts`
  - Performer Detail `techItems` render 4 placeholder thumbnails.
  - The `techMessage` says thumbnail paths are not saved or rendered in MVP.

Implementation therefore requires a future storage/form/detail batch.

Rules for future implementation:

- Do not infer thumbnails from folders.
- Do not infer thumbnails from related Images.
- Do not reuse random Images automatically.
- Do not fake thumbnail data.
- Do not hardcode static paths.
- Do not scan folders to discover images.

## 5. Recommended Data Shape

### Option A - `performerThumbnailPathsJson`

Stores an ordered JSON array of up to 4 local image path strings.

Pros:

- Fits the existing app pattern of JSON text fields for ordered arrays and optional grouped data.
- Preserves thumbnail order naturally.
- Allows fewer than 4 thumbnails without dummy fields.
- Keeps the schema smaller than 4 separate columns.
- Can be extended later if the user explicitly approves more thumbnails.

Cons:

- Requires parsing and normalization.
- Requires defensive fallback for invalid JSON.
- Forms need mapping helpers to expose 4 visible fields.

### Option B - `thumbnail1Path`, `thumbnail2Path`, `thumbnail3Path`, `thumbnail4Path`

Stores each thumbnail path in a dedicated field.

Pros:

- Very explicit.
- Easy to bind directly to 4 form inputs.
- Easy to query individual fields.

Cons:

- More rigid.
- Adds 4 columns and 4 type fields.
- Makes future count changes more invasive.
- Requires dummy empty strings for unused slots.

### Recommendation

Recommend `performerThumbnailPathsJson` for the current codebase.

Reasoning:

- Sakurava already uses JSON text fields for arrays such as `aliasesJson` and category/related record data.
- The thumbnails are an ordered optional list, which maps cleanly to JSON.
- The future form can still present 4 explicit inputs by mapping the JSON array to fixed form slots.
- This avoids adding 4 rigid columns for a small ordered media-path list.

Future storage rules:

- Store up to 4 paths.
- Preserve order.
- Store paths as plain local path strings.
- Trim strings before storage.
- Treat empty entries as absence.
- Do not store invalid dummy strings such as `Not saved in MVP`.
- Do not store image blobs.
- Do not copy files into app storage.
- Do not generate thumbnails.
- Do not scan folders.

## 6. Validation Rules

Future validation should:

- Accept at most 4 paths.
- Trim each string.
- Normalize empty strings to empty slots or remove them from the stored JSON array.
- Preserve user-defined order.
- Dedupe within one Performer if that can be done without surprising the user.
- Treat invalid JSON as an empty thumbnail list in UI parsing.
- Avoid crashing detail pages or forms when JSON is missing, malformed, or from an older database.
- Show placeholder/status for missing files instead of crashing.
- Not validate file existence as a hard save blocker unless the user explicitly approves that behavior.
- Use existing Media File Status runtime later to check saved paths on detail pages.

Recommended helper shape:

```ts
type PerformerThumbnailPathList = string[];
```

Normalization should enforce:

- array only;
- string entries only;
- trimmed strings;
- maximum length of 4;
- safe empty fallback.

## 7. Performer Form Plan

Future form behavior:

- Add 4 mini thumbnail path fields to Performer create/edit.
- Each field should be optional.
- Each field should represent one ordered slot.
- Support the native file picker if the current path picker pattern can be reused safely.
- Manual path typing may remain if current forms support it.
- No folder picker for these fields.
- No folder scanner.
- No auto-fill from performer name, title, folders, search, or related records.
- Saving a Performer must preserve unrelated fields.
- Clearing a field should remove that thumbnail path or leave an empty slot, based on the finalized JSON normalization rule.

Recommended form slot labels:

- `Thumbnail 1 Path`.
- `Thumbnail 2 Path`.
- `Thumbnail 3 Path`.
- `Thumbnail 4 Path`.

The form can map these slots to and from `performerThumbnailPathsJson` internally.

## 8. Performer Detail Plan

Future detail behavior:

- Display up to 4 mini thumbnails beside or under the main Performer cover/profile image.
- Each mini thumbnail should use its saved explicit path.
- Empty or missing path should preserve the placeholder thumbnail.
- Missing or inaccessible files should not crash the page.
- Clicking a valid mini thumbnail should open full-size preview using the modal from Batch 24.8 if safe.
- No next/back gallery in this batch sequence unless a later batch explicitly approves cycling only through explicit saved thumbnails.
- Do not scan `folderPath` or any folder to populate thumbnails.
- Do not show raw paths unless existing UI already shows them in a path/status area.
- Do not show raw IDs.

Recommended detail labels:

- `Performer Thumbnail 1`.
- `Performer Thumbnail 2`.
- `Performer Thumbnail 3`.
- `Performer Thumbnail 4`.

## 9. Relationship With Existing Features

Existing foundation:

- Batch 24.8 supports full-size preview for explicit `coverPath` detail images.
- Future mini thumbnail preview can reuse the Batch 24.8 modal behavior.
- Media File Status can be reused later to show status for each saved thumbnail path if needed.
- Native file picker behavior can be reused if current form path picker patterns support it.

Feature boundaries:

- Video `Play` behavior must not change.
- Image Detail gallery behavior must remain separate.
- Categories must not change.
- Related pickers must not change.
- Backup/Restore behavior must not change unless a later explicit batch handles schema/data compatibility.

## 10. Safety Rules

Mandatory rules:

- No folder scanning.
- No recursive image loading.
- No fake/static thumbnail data.
- No automatic import or copy.
- No image blob storage.
- No delete file operation.
- No move file operation.
- No rename file operation.
- No write file operation.
- No schema/backend changes in this planning batch.
- No record mutation except future explicit Performer save behavior.
- No category behavior changes.
- No related picker behavior changes.
- No Video `Play` behavior changes.
- No hidden filesystem mutation.
- No scraping.
- No network behavior.

## 11. Testing Plan

Future implementation should test:

- Create Performer saves mini thumbnail paths.
- Edit Performer preserves mini thumbnail paths.
- Edit Performer can clear a mini thumbnail path.
- Invalid JSON defaults safely if using `performerThumbnailPathsJson`.
- Maximum of 4 paths is enforced.
- Empty entries are normalized safely.
- Detail displays explicit saved mini thumbnails.
- Detail shows placeholder for missing or empty mini thumbnail paths.
- Mini thumbnail opens full-size preview when a safe asset source exists.
- Missing mini thumbnail image does not crash detail page.
- No folder scanning occurs.
- No unrelated field mutation occurs.
- Video `Play` still works.
- Category behavior is unchanged.
- Related picker behavior is unchanged.

## 12. Non-Goals / Deferred

Explicitly deferred:

- Implementation in this batch.
- Image gallery from `folderPath`.
- Gallery next/back.
- Folder scanning.
- Thumbnail generation.
- Thumbnail regeneration.
- Copying files into app storage.
- Image import/export.
- Automatic Performer image scraping.
- Advanced image management.
- Broad UI polish.
- Backup/Restore compatibility changes unless explicitly planned.
- Relation picker changes.
- Category behavior changes.

## 13. Future Batch Sequence

Recommended sequence:

1. Batch 24.9 - Performer Mini Thumbnail Storage/Form Planning.
2. Batch 24.10 - Performer Mini Thumbnail Storage Implementation.
3. Batch 24.11 - Performer Form Mini Thumbnail Fields.
4. Batch 24.12 - Performer Detail Mini Thumbnail Display and Preview.
5. Batch 25.1 - Image Gallery Planning.
6. Batch 25.2 - Image Gallery Viewer Implementation.

Batch 24.10 and Batch 24.11 may be combined only if all of these are true:

- The diff remains small.
- Tests cover storage and form behavior.
- Migration behavior is clear.
- Detail thumbnail display is not mixed in.
- Preview behavior is not mixed in.
- Category, related picker, Video `Play`, and gallery behavior do not change.

Do not combine storage, form, detail preview, and gallery work into one batch.

## 14. Agent Notes

Future agents:

- Do not implement from this planning batch.
- Do not fake the 4 mini thumbnails.
- Do not scan folders to find them.
- Do not infer thumbnails from related Images.
- Do not mix storage, form, detail preview, and gallery into one batch.
- Keep future implementation staged and testable.
- Preserve existing app behavior.
- Preserve existing cover/profile preview behavior from Batch 24.8.
- Preserve existing Media File Status behavior.
- Preserve Video `Play` behavior.
- Use explicit saved local image paths only.
- Push back if an implementation tries to invent thumbnail data or scan folders.

## 15. Related Documents

- [docs/21-media-file-status-open-file-planning.md](21-media-file-status-open-file-planning.md) - Media File Status / Open File planning baseline.
- [docs/22-external-media-open-planning.md](22-external-media-open-planning.md) - External media open planning.
- [docs/23-cover-thumbnail-full-size-preview-planning.md](23-cover-thumbnail-full-size-preview-planning.md) - Cover/Thumbnail Full Size Preview planning.
- [docs/11-prd-alignment-and-development-plan.md](11-prd-alignment-and-development-plan.md) - Current post-MVP standard.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.
- [docs/WORKFLOW_GIT.md](WORKFLOW_GIT.md) - Git and verification workflow.

## 16. Checkpoint

This documentation batch establishes the Performer Mini Thumbnail Storage/Form planning baseline.

Checkpoint tag:

```text
post-mvp-24-9-performer-mini-thumbnail-storage-form-planning-v1
```
