# 26 - Image Gallery Storage/Form Planning

## 1. Purpose

Image Gallery Storage/Form Planning defines how future Image records should store gallery image paths and how Image create/edit forms should let users manage those paths before any implementation begins.

This batch is documentation/planning only.

Do not make implementation changes in this batch:

- No source code changes.
- No UI changes.
- No database schema changes.
- No Tauri/Rust runtime changes.
- No native picker implementation.
- No folder read implementation.
- No Image Detail gallery grid.
- No tests.
- No package changes.

## 2. Relationship to Batch 25.1

Batch 25.1 established the Image Gallery product direction:

- Image Gallery uses hybrid controlled input.
- Users may later select multiple image files manually.
- Users may later select one folder.
- Folder selection must read only direct files inside that folder.
- Child folders/subfolders must not be scanned.
- Image Detail must not live-scan `folderPath`.
- The gallery source of truth should be an explicit saved image path list.
- `folderPath` is optional metadata/reference only.
- Gallery thumbnails should use 1:1 square ratio.
- Large galleries should use load-more rendering later.

Batch 25.2 narrows that direction into storage and Image Create/Edit Form planning.

## 3. Product Decision

Recommended decision:

- Add a future Image field named `galleryImagePathsJson`.
- Store it as a JSON array string of explicit local image paths.
- Treat `galleryImagePathsJson` as the source of truth for Image Gallery.
- Keep `folderPath` optional metadata/reference only.
- Do not use `folderPath` as a live gallery source.
- Do not add relational gallery tables at this stage.
- Do not store image blobs.
- Do not copy/import image files into app storage.
- Do not generate thumbnails.
- Do not mutate user files.

This keeps Image Gallery aligned with Sakurava's current local-first, explicit-path-first catalog model.

## 4. Data Direction

Recommended future field:

```ts
galleryImagePathsJson: string
```

Recommended stored shape:

```json
[
  "C:\\Users\\Example\\Pictures\\image-1.jpg",
  "C:\\Users\\Example\\Pictures\\image-2.png"
]
```

Storage rules:

- Store a JSON array string.
- Store explicit local image path strings only.
- Store no blobs.
- Store no generated thumbnails.
- Store no imported/cached copies.
- Do not create a relational gallery table in this stage.
- Do not replace or change `categoriesJson`.
- Do not expose raw IDs/UUIDs in UI.
- Do not impose a hard limit on total stored image paths.
- Defensively parse invalid or missing `galleryImagePathsJson` as an empty array.

`folderPath` may remain on Image records as optional metadata/reference, but it must not be used for live gallery scans.

## 5. Form Behavior

Future Image Create/Edit forms should add a `Gallery Images` section.

Recommended form behavior:

- Prefer a structured list of path rows instead of raw JSON.
- Each row represents one local image path.
- User can add a path row manually.
- User can edit a path row manually.
- User can remove a path row.
- User can clear all gallery paths.
- Clearing all paths should preferably use a lightweight confirmation.
- Save should persist only cleaned explicit paths.

Recommended row behavior:

- Empty rows may exist while editing.
- Empty rows should not be saved.
- Duplicate rows may be entered temporarily.
- Duplicate paths should be removed during normalization before save.
- First occurrence order should be preserved after dedupe.
- Missing or inaccessible files should not block form render.
- Missing or inaccessible files should not crash save unless a later batch explicitly makes existence validation blocking.

Reorder behavior can be planned, but may be deferred if implementation risk is high. If implemented later, reorder should update only the order of entries in `galleryImagePathsJson`.

## 6. Validation and Normalization

Future normalization should convert form rows into a clean path list before save.

Required rules:

- Trim string paths.
- Remove empty paths.
- Deduplicate paths within one Image record.
- Preserve first occurrence order after dedupe.
- Accept missing or inaccessible files without crashing.
- Defensively parse invalid or missing `galleryImagePathsJson` as an empty array.
- Avoid exposing raw filesystem errors directly in UI.
- Avoid exposing raw IDs/UUIDs in UI.
- Do not change `categoriesJson` behavior.
- Do not alter unrelated Image fields during gallery-only updates.

Recommended helper shape:

```ts
type GalleryImagePathList = string[];
```

Recommended parser behavior:

- If stored value is missing, return `[]`.
- If stored value is invalid JSON, return `[]`.
- If stored value is valid JSON but not an array, return `[]`.
- Keep only string entries.
- Trim strings.
- Remove empty strings.
- Deduplicate.
- Preserve first occurrence order.

## 7. Save Behavior

Future save behavior should:

- Read path rows from the `Gallery Images` form section.
- Normalize the rows.
- Serialize the normalized list as `galleryImagePathsJson`.
- Preserve unrelated Image fields.
- Preserve `categoriesJson`.
- Preserve related picker fields.
- Avoid incomplete full-record updates for gallery-only changes when a narrower patch pattern exists.
- Never mutate user files.

Saving gallery paths must not:

- scan folders;
- scan child folders/subfolders;
- copy files;
- import files into app storage;
- move files;
- rename files;
- delete files;
- generate thumbnails;
- change Video `Play`;
- change Performer mini thumbnails;
- change categories, related pickers, Backup/Restore, or Settings.

## 8. Future Picker Compatibility

The form list should be the shared target for all future gallery input methods.

Manual path input:

- Adds or edits rows directly.

Future native multi image picker:

- Appends selected image paths into the same structured list.
- Does not copy/import selected files.
- Does not mutate selected files.
- Lets normalization handle dedupe before save.

Future folder picker:

- Lets the user select one folder.
- Reads only direct files inside that selected folder.
- Does not read child folders/subfolders.
- Appends direct-file image paths into the same structured list.
- Does not make `folderPath` the live gallery source.
- Does not automatically rescan later.

Picker results should be mergeable with manually entered rows before save.

## 9. In Scope

Planning scope:

- Gallery storage direction.
- Image Create/Edit Form gallery section behavior.
- Path row add/edit/remove/clear behavior.
- Validation and normalization rules.
- Save behavior boundaries.
- Future picker compatibility.
- Future implementation acceptance criteria.
- Minimal status, roadmap, index, and handoff references.

## 10. Out of Scope

Explicitly out of scope:

- Source code changes.
- UI implementation.
- Database schema changes.
- Tauri/Rust runtime changes.
- Native multi image picker implementation.
- Folder picker implementation.
- Folder read/list implementation.
- Image Detail gallery grid.
- Gallery full-size preview next/back.
- Gallery load-more implementation.
- Video `Play` behavior changes.
- Performer mini thumbnail behavior changes.
- Category changes.
- Related picker changes.
- Backup/Restore changes.
- Settings changes.
- Package changes.
- Tests, unless docs tooling is introduced later.

## 11. Risks and Mitigations

### Risk: users edit raw JSON incorrectly

Mitigation:

- Use structured path rows in the form.
- Keep raw JSON out of normal UI.
- Parse invalid stored JSON defensively as an empty array.

### Risk: duplicate or empty paths create noisy galleries

Mitigation:

- Trim paths.
- Remove empty entries.
- Deduplicate within one Image record.
- Preserve first occurrence order after dedupe.

### Risk: `folderPath` becomes a hidden scanner

Mitigation:

- Keep `folderPath` optional metadata/reference only.
- Use `galleryImagePathsJson` as the source of truth.
- Forbid live folder scan on Image Detail.
- Forbid child folder/subfolder scans.

### Risk: file mutation or import behavior creeps in

Mitigation:

- Store path strings only.
- Do not copy/import/move/rename/delete files.
- Do not generate thumbnails.
- Do not store blobs.

### Risk: unrelated Image fields are lost during gallery save

Mitigation:

- Preserve unrelated fields.
- Preserve `categoriesJson`.
- Prefer narrow update/patch behavior where the implementation has that pattern.

## 12. Future Batch Sequence

Recommended sequence:

1. Batch 25.2 - Image Gallery Storage/Form Planning.
2. Batch 25.3 - Image Gallery Storage/Form Implementation.
3. Batch 25.4 - Native Multi Image Picker and Folder Picker Planning/Implementation.
4. Batch 25.5 - Image Detail Gallery Grid.
5. Batch 25.6 - Gallery Full-size Viewer with Next/Back.

Batch boundaries:

- Do not combine storage/form planning with implementation.
- Do not combine storage/form implementation with picker implementation unless explicitly approved.
- Do not implement Image Detail gallery grid before storage/form behavior exists.
- Do not add gallery next/back before the grid is stable.
- Do not change Video `Play`, Performer thumbnails, categories, related pickers, Backup/Restore, or Settings as part of Image Gallery work.

## 13. Acceptance Criteria

This planning batch is complete when:

- Docs clearly state Batch 25.2 is planning only.
- Docs clearly state `galleryImagePathsJson` is the recommended future field.
- Docs clearly state `galleryImagePathsJson` stores a JSON array string of explicit local image paths.
- Docs clearly state `folderPath` is not the live gallery source.
- Docs clearly define Image Create/Edit `Gallery Images` form behavior.
- Docs clearly define add/edit/remove/clear path behavior.
- Docs clearly define trim/remove-empty/dedupe behavior.
- Docs clearly state first occurrence order is preserved after dedupe.
- Docs clearly state invalid or missing JSON falls back to an empty array.
- Docs clearly state no file mutation, no copy/import, and no thumbnail generation.
- Docs clearly state no source/runtime/database files change in this batch.
- Docs do not claim Image Gallery is implemented.
- Git diff only shows documentation changes.

## 14. Agent Notes

Future agents:

- Do not implement from this planning batch.
- Do not claim Image Gallery is implemented from this documentation.
- Use `galleryImagePathsJson` as the recommended storage field unless a later approved batch changes it.
- Store a JSON array string of explicit local image paths.
- Do not use `folderPath` as the live gallery source.
- Do not add relational gallery tables at this stage.
- Keep form UI as structured path rows, not raw JSON.
- Normalize paths before save: trim, remove empty, dedupe, preserve first occurrence order.
- Preserve `categoriesJson` and unrelated Image fields.
- Do not copy, import, move, rename, delete, write files, generate thumbnails, or mutate user files.
- Keep native picker, folder read, Image Detail grid, and gallery next/back in later batches.

## 15. Related Documents

- [docs/25-image-gallery-planning.md](25-image-gallery-planning.md) - Image Gallery product planning baseline.
- [docs/21-media-file-status-open-file-planning.md](21-media-file-status-open-file-planning.md) - Media File Status / Open File planning baseline.
- [docs/23-cover-thumbnail-full-size-preview-planning.md](23-cover-thumbnail-full-size-preview-planning.md) - Cover/Thumbnail Full Size Preview planning.
- [docs/24-performer-mini-thumbnail-storage-form-planning.md](24-performer-mini-thumbnail-storage-form-planning.md) - Performer Mini Thumbnail Storage/Form planning.
- [docs/11-prd-alignment-and-development-plan.md](11-prd-alignment-and-development-plan.md) - Current post-MVP standard.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.
- [docs/WORKFLOW_GIT.md](WORKFLOW_GIT.md) - Git and verification workflow.

## 16. Checkpoint

This documentation batch establishes the Image Gallery Storage/Form planning baseline.

Checkpoint tag:

```text
post-mvp-25-2-image-gallery-storage-form-planning-v1
```
