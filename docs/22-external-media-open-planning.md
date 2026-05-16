# 22 - External Media Open Planning

## 1. Purpose

External Media Open lets users open selected saved media files from detail pages using the default Windows or OS application.

This direction intentionally avoids building a full media player inside Sakurava. Sakurava should remain a local catalog app that can hand one explicit saved file path to the OS after the user chooses an action.

## 2. Current Scope

This batch is documentation/planning only.

Do not make implementation changes in this batch:

- No implementation.
- No UI changes.
- No Rust/Tauri changes.
- No backend/schema changes.
- No tests.
- No package changes.

The goal is to document safe external media open behavior before future implementation.

## 3. User Intent

Clarified user goal:

- Video Detail should have a `Play` button that opens the saved `mediaPath` with the default media player or default OS app.
- Image, cover, and thumbnail full-size viewing should use the simplest safe approach.
- `View in Folder` / `Reveal in Folder` is not a priority.
- Embedded video player behavior is not needed now.
- File manager and folder manager behavior is not wanted.
- File scanner behavior is not wanted.

Sakurava should not become a full media player, file manager, or folder manager.

## 4. Target Interfaces

Future intended surfaces:

### Video Detail

- `Play` button for `mediaPath`.
- Possibly `Open Cover` for `coverPath` if external image opening is selected.
- `Play` should be user-triggered only.

### Image Detail

- Full-size cover/image open for `coverPath`.
- Future gallery image viewing is separate and should not be mixed into this batch sequence unless planned.
- `folderPath` should not become a folder manager entry point in this phase.

### Performer Detail

- Full-size profile/cover image open for `coverPath`.
- Future thumbnail/profile image fields should follow the same safety boundary if saved fields are added later.

### Forms

- No external open behavior in forms for v1.
- Forms keep path selection and saving separate from opening media.

## 5. Relationship With Existing Media Status

Existing foundation:

- Batch 24.2 added `path_status_check`.
- Batch 24.2 added `checkPathStatus`.
- Batch 24.3 added read-only status display on detail pages.

Future external open actions should use the existing Media File Status foundation:

- `exists` -> action can be enabled.
- `notSet` -> action should be disabled or show a safe message.
- `missing` -> action should be disabled or show a safe message.
- `inaccessible` -> action should be disabled or show a safe message.
- `unknown` -> action should be disabled or show a safe message.

Detail pages must still render if status check fails. A status failure must not mutate records, crash the page, or trigger an open action.

## 6. External Video Open Plan

Future Video `Play` behavior:

- Uses the default OS app.
- Opens only the saved `mediaPath`.
- Does not decode video in Sakurava.
- Does not embed a video player in Sakurava in this phase.
- Does not autoplay.
- Does not handle codecs in Sakurava.
- Does not regenerate thumbnails.
- Does not inspect or scan the media file.
- Runs only after the user clicks `Play`.
- If the path is missing, not set, inaccessible, or unknown, show a safe message and do nothing.

The action should remain narrow: one explicit saved file path, one user click, handoff to the OS default app.

## 7. Image Full Size Plan

### Option A - Open Image Using Default OS Image Viewer

Pros:

- Simplest runtime implementation.
- No image viewer UI needed.
- Uses Windows Photos or the configured default app.
- Matches the external-open model used for video.

Cons:

- Leaves Sakurava window context.
- No in-app next/back.
- Less cohesive for quick cover/profile inspection.

### Option B - Simple In-App Image Preview Modal

Pros:

- Better UX for cover/profile preview.
- Can close without leaving the app.
- Suitable for cover and thumbnail images.
- Can reuse existing local asset handling if it remains safe.

Cons:

- Needs frontend modal UI.
- Local file access must remain safe.
- Gallery next/back should be planned separately.

### Recommended Direction

- For video, prefer external default OS app.
- For cover/profile/thumbnail full-size preview, prefer a simple in-app modal if existing asset handling supports it safely.
- For gallery next/back, create a separate Image Gallery planning batch later.

Do not mix image gallery navigation into the first external video `Play` implementation.

## 8. Runtime Boundary

Future command naming should follow the project snake_case convention. Candidate names:

- `open_media_path`
- `open_path_default`

Recommended direction:

- Use `open_media_path` if the command is file-only and intended for catalog media paths.
- Use `open_path_default` only if it is explicitly allowed to handle more than media files.

Future command should:

- Accept one explicit saved path.
- Trim and validate the path.
- Reject empty paths.
- Reject missing paths.
- Reject directories for file-only open unless a later batch explicitly allows folder open.
- Use safe platform APIs or Tauri APIs.
- Avoid shell string construction.
- Avoid arbitrary command execution.
- Not mutate files.
- Not mutate records.
- Not scan folders.
- Not reveal folders unless a later batch asks for it.

The command should return a concise typed result or a safe error that the frontend can present without raw OS dumps.

## 9. Safety Rules

Mandatory rules:

- No delete operations.
- No move operations.
- No rename operations.
- No write operations.
- No recursive scanning.
- No arbitrary command execution.
- No shell string construction from untrusted paths.
- No autoplay.
- No embedded video player in this phase.
- No reveal in folder in this phase.
- No broad file manager behavior.
- No database/schema changes.
- No record mutation.
- No category behavior changes.
- No related picker behavior changes.
- No Backup/Restore behavior changes.

## 10. UX Rules

Future UX rules:

- Use `Play` as the Video Detail button label for `mediaPath`.
- Disable `Play` unless status is `exists`.
- Use safe tooltip/message text for `missing`, `notSet`, `inaccessible`, and `unknown`.
- Do not add open buttons to forms.
- Keep UI compact.
- Do not add broad UI polish.
- Do not show raw stack traces or noisy platform errors.
- Do not expose new raw internal IDs.

Recommended status copy:

- `notSet`: `No video path saved.`
- `missing`: `Saved file was not found.`
- `inaccessible`: `Saved file cannot be accessed.`
- `unknown`: `File status is not available.`
- Browser preview: `Available in desktop runtime.`

## 11. Testing Plan

Future implementation should test:

- Open command rejects empty path.
- Open command rejects missing path.
- Open command accepts existing file path.
- Open command rejects directories if command is file-only.
- Frontend wrapper handles unavailable runtime safely.
- Video Detail `Play` button is disabled when status is `missing`.
- Video Detail `Play` button is disabled when status is `notSet`.
- Video Detail `Play` button is disabled when status is `inaccessible`.
- Video Detail `Play` button is disabled when status is `unknown`.
- Video Detail `Play` button calls runtime when status is `exists`.
- No reveal-folder behavior is added accidentally.
- No file scanner behavior is added accidentally.
- No record mutation occurs.
- No category behavior changes.
- No related picker behavior changes.

## 12. Non-Goals / Deferred

Explicitly deferred:

- Implementation in this batch.
- `Reveal in Folder` / `View in Folder`.
- `Open Folder`.
- `Copy Path` unless later requested.
- Embedded video player.
- Media player controls.
- Image gallery next/back.
- Folder scanning.
- File missing scanner.
- Thumbnail regeneration.
- Import/export.
- Backup/Restore changes.
- Relation picker changes.
- Category behavior changes.
- Broad UI polish.

## 13. Future Batch Sequence

Recommended sequence:

1. Batch 24.4 - External Media Open Planning.
2. Batch 24.5 - External Media Open Runtime Implementation.
3. Batch 24.6 - Video Detail Play Button.
4. Batch 24.7 - Cover/Thumbnail Full Size Preview Planning or Small Implementation.
5. Batch 25.1 - Image Gallery Planning.
6. Batch 25.2 - Image Gallery Viewer Implementation.

Batch boundaries:

- Batch 24.5 and Batch 24.6 should not be merged unless explicitly approved.
- Batch 24.5 should implement runtime only.
- Batch 24.6 should add Video Detail `Play` only.
- Batch 24.7 may combine light planning and implementation only if limited to cover/profile full-size preview and does not scan folders.
- Batch 25.1 and Batch 25.2 should handle gallery next/back separately.

## 14. Agent Notes

Future agents:

- Do not implement from this planning batch.
- Do not revive `Reveal in Folder` unless the user explicitly asks.
- Do not build an embedded video player.
- Keep this separate from Image Gallery.
- Keep this separate from file scanner.
- Preserve existing Media File Status behavior.
- Preserve existing app behavior.
- Use existing status values to control action availability.
- Keep forms out of v1 external open behavior.
- Keep Video `Play` external and user-triggered.

## 15. Related Documents

- [docs/21-media-file-status-open-file-planning.md](21-media-file-status-open-file-planning.md) - Media File Status / Open File planning baseline.
- [docs/11-prd-alignment-and-development-plan.md](11-prd-alignment-and-development-plan.md) - Current post-MVP standard.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.
- [docs/WORKFLOW_GIT.md](WORKFLOW_GIT.md) - Git and verification workflow.

## 16. Checkpoint

This documentation batch establishes the External Media Open planning baseline.

Checkpoint tag:

```text
post-mvp-24-4-external-media-open-planning-v1
```
