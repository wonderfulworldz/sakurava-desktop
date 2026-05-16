# 25 - Image Gallery Planning

## 1. Purpose

Image Gallery should let an Image record display multiple explicitly saved local image paths without turning Sakurava into a folder scanner, file manager, import tool, or thumbnail generator.

The gallery direction is hybrid controlled input:

- users can manually select multiple image files;
- users can select one folder as a controlled convenience action;
- folder selection reads only direct files inside that selected folder;
- the saved gallery source is an explicit image path list, not a live folder scan.

This batch is documentation/planning only.

## 2. Product Decision

Image Gallery should use explicit saved paths as the source of truth.

Recommended decision:

- Store gallery images in a future field named `galleryImagePathsJson` or equivalent.
- Treat `galleryImagePathsJson` as the real Image Detail gallery source.
- Keep `folderPath` optional metadata/reference only.
- Do not live-scan `folderPath` when Image Detail opens.
- Do not scan folders automatically.
- Do not scan child folders/subfolders.
- Do not copy, import, move, rename, delete, or mutate user files.
- Do not generate thumbnails.
- Reuse the existing full-size preview modal later.
- Defer gallery next/back until the grid is stable.

## 3. Affected Interfaces

Future affected interfaces:

- Image create form.
- Image edit form.
- Image Detail.
- Native multi image picker.
- Native folder picker.
- Existing full-size preview modal, only as a later reuse point.
- Existing Media File Status behavior, only if reused for saved gallery paths.

Interfaces that must not change from this planning batch:

- Video Detail `Play`.
- Performer mini thumbnail storage/form/detail behavior.
- Category Management.
- Related pickers.
- Backup/Restore.
- Settings.
- Runtime database/schema.
- Tauri/Rust commands.

## 4. In Scope

Planning scope:

- Document the gallery source of truth.
- Document manual multi-image selection.
- Document controlled folder selection.
- Document direct-folder-only reading.
- Document that Image Detail must not live-scan `folderPath`.
- Document 1:1 square gallery thumbnails.
- Document load-more rendering.
- Document the future batch sequence.
- Document safety boundaries and acceptance criteria.

## 5. Out of Scope

Explicitly out of scope for this batch:

- Implementation.
- UI changes.
- Database schema changes.
- Tauri/Rust runtime changes.
- Tests.
- Package changes.
- Native picker implementation.
- Gallery grid implementation.
- Gallery next/back.
- Folder watcher behavior.
- Folder scanning on detail page load.
- Child folder scanning.
- Thumbnail generation.
- Image copy/import/export.
- File delete/move/rename/write operations.
- Video player or Video `Play` behavior changes.
- Performer mini thumbnail behavior changes.
- Category, related picker, Backup/Restore, or Settings changes.

## 6. Data Direction

Recommended future storage direction:

```ts
galleryImagePathsJson: string
```

The field should store a JSON array of local image path strings.

Future storage rules:

- Store explicit local image paths only.
- Preserve user-selected order where practical.
- Allow manually selected files and direct folder-read results to be merged through form UI.
- Trim string paths before storage.
- Ignore or remove empty path entries.
- Defensively parse missing or invalid JSON as an empty gallery list.
- Do not store blobs.
- Do not store generated thumbnails.
- Do not store imported copies.
- Do not replace existing `categoriesJson` behavior.
- Do not expose raw IDs/UUIDs in UI.
- Do not impose a hard limit on total stored image paths.

`folderPath` may remain useful as optional reference metadata, but it must not become the gallery source of truth.

## 7. Folder Selection Rules

Folder selection should be explicit and controlled.

Mandatory rules:

- Folder reading happens only after a direct user action.
- The user selects exactly one folder at a time.
- The app reads only direct files inside the selected folder.
- The app must not read child folders/subfolders.
- The app must not keep watching the folder.
- The app must not automatically rescan later.
- The app must not scan `folderPath` when Image Detail opens.
- The app must not mutate files in the selected folder.

Recommended future form behavior:

1. User clicks a folder selection action.
2. Native folder picker returns one selected folder.
3. Runtime lists only direct files in that folder.
4. UI filters to supported image file paths if needed.
5. UI shows the resulting candidate paths before save where practical.
6. Save writes the selected paths into `galleryImagePathsJson`.

The selected folder itself can be retained in `folderPath` only as optional reference metadata if the future implementation explicitly chooses to do so.

## 8. Gallery Display Rules

Image Detail gallery should render from the explicit saved path list only.

Display rules:

- Use `galleryImagePathsJson` or equivalent as the gallery source.
- Do not live-scan `folderPath`.
- Do not read child folders.
- Use 1:1 square gallery thumbnails.
- Preserve existing placeholder fallback behavior.
- Missing or inaccessible image paths must not crash Image Detail.
- Avoid exposing raw filesystem errors.
- Avoid exposing raw IDs/UUIDs.
- Keep gallery behavior separate from Video `Play`.
- Keep gallery behavior separate from Performer mini thumbnails.
- Reuse existing full-size preview modal later if safe.

Thumbnail rendering should be a display concern only. The app must not generate thumbnail files.

## 9. Load More Strategy

There should be no hard limit on total stored image paths, but the UI should avoid rendering all gallery images at once.

Recommended load-more strategy:

- Initial visible images: `24`.
- Each load-more action: `+24`.
- Keep the remaining count understandable in UI if shown.
- Preserve stable thumbnail sizing so loading more does not shift existing items unexpectedly.
- Do not introduce virtualization unless later needed for very large galleries.

This keeps the implementation simple while preventing Image Detail from trying to render a very large path list in one pass.

## 10. Risks and Mitigations

### Risk: accidental folder scanner behavior

Mitigation:

- Folder reading must require explicit user action.
- Folder reading must be direct files only.
- Image Detail must not scan `folderPath`.
- No watchers or automatic refresh.

### Risk: slow detail pages from large galleries

Mitigation:

- Use load-more rendering.
- Start with 24 visible images.
- Add 24 per user action.

### Risk: user expects folder changes to appear automatically

Mitigation:

- Store an explicit path list and treat it as the source of truth.
- Future UI copy can make folder selection a one-time add action, not a synced folder.

### Risk: file mutation concerns

Mitigation:

- No copy/import/move/rename/delete/write operations.
- Store only local path strings.
- Preserve Media File Status behavior for missing/inaccessible paths.

### Risk: scope creep into a full gallery viewer

Mitigation:

- Build storage/form first.
- Build the grid after storage is stable.
- Add full-size next/back only in a later batch.

## 11. Future Batch Sequence

Recommended sequence:

1. Batch 25.1 - Image Gallery Planning.
2. Batch 25.2 - Image Gallery Storage/Form Planning.
3. Batch 25.3 - Image Gallery Storage/Form Implementation.
4. Batch 25.4 - Native Multi Image Picker and Folder Picker Planning/Implementation.
5. Batch 25.5 - Image Detail Gallery Grid.
6. Batch 25.6 - Gallery Full-size Viewer with Next/Back.

Batch boundaries:

- Do not combine planning with implementation.
- Do not combine storage/schema work with gallery next/back.
- Do not implement folder picker behavior before direct-folder-only rules are clear.
- Do not add gallery next/back before the grid is stable.
- Do not change Video `Play`, Performer thumbnails, categories, related pickers, Backup/Restore, or Settings as part of Image Gallery work.

## 12. Acceptance Criteria

This planning batch is complete when:

- Docs clearly state the Image Gallery plan.
- Docs clearly recommend an explicit saved image path list as the source of truth.
- Docs clearly allow manual multi-image selection.
- Docs clearly allow controlled one-folder selection.
- Docs clearly forbid live folder scan on Image Detail.
- Docs clearly forbid child folder/subfolder scan.
- Docs clearly specify 1:1 square gallery thumbnails.
- Docs clearly specify load-more rendering.
- Docs clearly recommend 24 initial visible images and +24 per load more.
- Docs clearly state this batch is planning only.
- Docs clearly state no app source code should change.
- Docs clearly state no database schema should change.
- Docs clearly state no Tauri/Rust runtime code should change.

## 13. Agent Notes

Future agents:

- Do not implement from this planning batch.
- Do not scan folders automatically.
- Do not scan child folders.
- Do not make `folderPath` the Image Detail gallery source.
- Do not live-scan `folderPath` when opening Image Detail.
- Use explicit saved local image paths only.
- Preserve placeholder fallback behavior.
- Preserve existing Media File Status behavior.
- Preserve existing full-size preview modal behavior.
- Preserve Video `Play` behavior.
- Preserve Performer mini thumbnail behavior.
- Keep categories, related pickers, Backup/Restore, and Settings out of this work.
- Push back if an implementation tries to copy, import, move, rename, delete, generate, or mutate user files.

## 14. Related Documents

- [docs/21-media-file-status-open-file-planning.md](21-media-file-status-open-file-planning.md) - Media File Status / Open File planning baseline.
- [docs/22-external-media-open-planning.md](22-external-media-open-planning.md) - External media open planning.
- [docs/23-cover-thumbnail-full-size-preview-planning.md](23-cover-thumbnail-full-size-preview-planning.md) - Cover/Thumbnail Full Size Preview planning.
- [docs/24-performer-mini-thumbnail-storage-form-planning.md](24-performer-mini-thumbnail-storage-form-planning.md) - Performer Mini Thumbnail Storage/Form planning.
- [docs/11-prd-alignment-and-development-plan.md](11-prd-alignment-and-development-plan.md) - Current post-MVP standard.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.
- [docs/WORKFLOW_GIT.md](WORKFLOW_GIT.md) - Git and verification workflow.

## 15. Checkpoint

This documentation batch establishes the Image Gallery planning baseline.

Checkpoint tag:

```text
post-mvp-25-1-image-gallery-planning-v1
```
