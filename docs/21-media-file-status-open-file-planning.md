# 21 - Media File Status / Open File Planning

## 1. Purpose

Media File Status / Open File should help users understand whether saved local file and folder paths still exist, and later allow safe desktop actions for opening or revealing those paths through Tauri.

The feature is about existing local paths already saved in Sakurava records. It should remain local-only and private-first. It must not introduce scraping, importing, cloud behavior, telemetry, media playback, broad file indexing, or automatic file mutation.

## 2. Current Scope

This batch is documentation/planning only.

Do not make implementation changes in this batch:

- No implementation.
- No UI changes.
- No Rust/Tauri changes.
- No backend/schema changes.
- No tests.
- No package changes.

The goal is to define safe boundaries before any future runtime or detail page implementation begins.

## 3. Target Path Types

Planned path surfaces:

- Video `coverPath`.
- Video `mediaPath`.
- Image `coverPath`.
- Image `folderPath`.
- Performer `coverPath`.
- Existing thumbnail/profile paths if future record shapes expose them.
- Configured media roots where relevant for local asset access and status context.

Current code context shows persisted record paths for Videos, Images, and Performers:

- Videos store `coverPath` and `mediaPath`.
- Images store `coverPath` and `folderPath`.
- Performers store `coverPath`.
- Current Performer thumbnail/profile surfaces are planned or placeholder-only unless a later batch adds saved fields.
- Current media roots are Settings-managed local asset scope configuration, not record paths.

This feature is about saved local paths. It is not about scraping, importing, media playback, thumbnail regeneration, or automatic library scanning.

## 4. Desired Status Behavior

Planned status values:

- `Not Set`: The path is empty or whitespace.
- `Exists`: The path exists and can be identified as a file or folder.
- `Missing`: The path is syntactically usable but does not exist.
- `Inaccessible`: The path exists or appears valid but cannot be accessed because of permission, drive, or OS restrictions.
- `Unknown / Not Checked`: The app is running in browser preview, the desktop runtime is unavailable, or the command could not safely determine status.

Behavior rules:

- Browser preview cannot check local files directly.
- Desktop/Tauri runtime can check local file existence safely through explicit commands.
- Status checks must not block detail pages from loading.
- Missing files should show a safe warning state and must not crash the page.
- Status checks should be best-effort and scoped to individual saved paths.
- Status results should not mutate records.
- Invalid or unsupported paths should fall back to `Unknown / Not Checked` or `Inaccessible` with safe messaging.

## 5. Desired Open / Reveal Behavior

Future actions:

- `Open File` for saved file paths.
- `Reveal in Folder` for saved file paths.
- `Open Folder` for saved folder paths.
- `Copy Path` if useful and low-risk.

Rules:

- Open only user-saved local paths.
- Never delete, move, rename, edit, rewrite, or modify files.
- Never auto-scan whole drives.
- Never auto-play media unless a later media player batch explicitly approves it.
- Always handle missing and inaccessible paths safely.
- Do not trigger open/reveal from page load.
- Do not run open/reveal for empty paths.
- Do not infer paths from titles, codes, categories, notes, or related records.

## 6. Runtime Boundary

Future Tauri command names should follow project convention and be finalized before implementation. Candidate names:

- `check_path_status(path)`
- `open_path(path)`
- `reveal_path(path)`

Equivalent snake_case Tauri command names may be preferable:

- `path_status_check`
- `path_open`
- `path_reveal`

Future commands should:

- Validate empty paths.
- Trim path input.
- Reject unsafe, unsupported, or nonexistent paths with clear errors.
- Avoid exposing noisy raw system errors directly to the UI.
- Return safe typed results to the frontend.
- Work on Windows first.
- Use platform APIs or Tauri-safe APIs rather than shell string construction.
- Avoid command execution through interpolated strings.
- Avoid mutating record data.

Conceptual status result type:

```ts
type PathStatusKind =
  | "notSet"
  | "exists"
  | "missing"
  | "inaccessible"
  | "unknown";

type PathKind = "file" | "folder" | "unknown";

type PathStatusResult = {
  path: string;
  status: PathStatusKind;
  kind: PathKind;
  message?: string;
};
```

The exact TypeScript and Rust shapes must be finalized in a future implementation batch.

## 7. Security and Safety Rules

Mandatory rules:

- No destructive file operations.
- No recursive scanning.
- No arbitrary command execution.
- No shell string construction from untrusted paths.
- No network access.
- No scraping.
- No hidden file mutation.
- No automatic media playback.
- No broad file indexing.
- Preserve privacy/local-only behavior.
- Do not modify catalog records during status checks.
- Do not change Backup/Restore behavior.
- Do not change category behavior.
- Do not change related picker behavior.

## 8. UX Plan

Planned safe UI surfaces:

- Detail page status badges near relevant path fields.
- Optional compact buttons:
  - `Open`.
  - `Reveal`.
  - `Copy Path`.
- Disabled buttons when path is not set.
- Missing state warning near the affected path.
- Browser preview fallback text:
  - `Available in desktop runtime`
- Compact, non-invasive layout.

Status display should not dominate detail pages. It should help users diagnose missing paths without turning the detail page into a file manager.

## 9. Entity-Specific Plan

### Video Detail

- Show status for `coverPath`.
- Show status for `mediaPath`.
- Allow `Open` and `Reveal` for `mediaPath` if safe and available.
- Allow `Reveal` or `Open` for `coverPath` if safe and available.
- Missing `mediaPath` should not prevent record detail from loading.
- Missing `coverPath` should preserve the existing placeholder behavior.

### Image Detail

- Show status for `coverPath`.
- Show status for `folderPath`.
- Allow `Open Folder` and `Reveal` for `folderPath` if safe and available.
- Allow `Reveal` or `Open` for `coverPath` if safe and available.
- Missing `folderPath` should not prevent record detail from loading.
- Missing `coverPath` should preserve the existing placeholder behavior.

### Performer Detail

- Show status for `coverPath`.
- Include optional image/profile path status only if future saved fields exist.
- Missing `coverPath` should preserve the existing placeholder behavior.

### Forms

- Do not add open/reveal behavior to forms in v1 unless explicitly needed.
- Forms can keep native picker behavior separate.
- Browse/select behavior remains separate from open/reveal behavior.
- Saving paths remains an explicit form save action.

## 10. Error Handling

Planned mapping:

- Path not set -> `Not Set`.
- Path missing -> `Missing`.
- Permission denied -> `Inaccessible`.
- Unsupported path -> `Unknown` or `Inaccessible`.
- Command failure -> safe message.
- Browser preview -> `Unknown / Not Checked` with `Available in desktop runtime`.

UI rules:

- Do not show stack traces.
- Do not show raw OS error dumps.
- Do not expose internal command payloads.
- Do not crash on invalid path strings.
- Do not block detail rendering because status check failed.
- Use concise, user-facing messages.

## 11. Testing Plan

Future implementation should test:

- Empty path status.
- Existing file status.
- Missing file status.
- Existing folder status.
- Permission or inaccessible path behavior where feasible.
- `reveal` and `open` command reject missing paths.
- `reveal` and `open` command reject empty paths.
- Frontend renders desktop runtime status.
- Browser preview fallback.
- Missing state warning.
- Disabled buttons when path is not set.
- No destructive operation.
- No unrelated record mutation.
- No category behavior changes.
- No Backup/Restore behavior changes.

## 12. Non-Goals / Deferred

Explicitly deferred:

- Implementation in this batch.
- Media player.
- Video playback.
- Image preview modal.
- Thumbnail regeneration.
- File missing scanner.
- Bulk scanner.
- Import/export.
- Backup/Restore changes.
- Relation picker changes.
- Category behavior changes.
- Broad UI polish.
- Automatic folder crawling.
- Automatic file repair.
- Automatic path relinking.

## 13. Future Batch Sequence

Recommended sequence:

1. Batch 24.1 - Media File Status / Open File Planning.
2. Batch 24.2 - Media File Status Runtime Implementation.
3. Batch 24.3 - Detail Page Status Display.
4. Batch 24.4 - Open / Reveal Actions.
5. Batch 24.5 - Smoke Validation and Safety Review.

This sequence keeps runtime command behavior separate from UI display and separates status checking from open/reveal actions. If the implementation is very small, Batch 24.2 and Batch 24.3 may be combined only with explicit user approval.

## 14. Future Implementation Checklist

For future implementation:

- [ ] Command names finalized.
- [ ] Path status result type finalized.
- [ ] Windows behavior checked.
- [ ] Runtime status command implemented safely.
- [ ] Open/reveal command behavior reviewed separately.
- [ ] UI placement approved.
- [ ] Browser preview fallback planned.
- [ ] Tests planned.
- [ ] Smoke test plan prepared.
- [ ] No destructive file behavior.
- [ ] No recursive scanning.
- [ ] No shell string construction from untrusted paths.
- [ ] No automatic media playback.
- [ ] No record mutation from status checks.
- [ ] No Backup/Restore behavior changes.
- [ ] No category behavior changes.
- [ ] No related picker behavior changes.

## 15. Agent Notes

Future agents:

- Do not implement from this planning batch.
- Keep this separate from media player/open preview behavior.
- Keep this separate from file missing scanner.
- Keep this separate from backup/restore.
- Keep this separate from related picker work.
- Preserve existing app behavior.
- Preserve existing placeholder behavior for missing cover images.
- Treat browser preview and desktop runtime as different capability levels.
- Keep forms separate from detail page open/reveal behavior unless a later batch explicitly changes that.
- Do not change schema for Media File Status / Open File v1 unless the user explicitly approves a separate storage batch.

## 16. Related Documents

- [docs/11-prd-alignment-and-development-plan.md](11-prd-alignment-and-development-plan.md) - Current post-MVP standard.
- [docs/12-backup-restore-ux-safety.md](12-backup-restore-ux-safety.md) - Backup/Restore safety boundary.
- [docs/13-settings-persistence-planning.md](13-settings-persistence-planning.md) - Settings persistence and media/path separation.
- [docs/20-related-video-image-storage-planning.md](20-related-video-image-storage-planning.md) - Related Video/Image storage planning.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.
- [docs/WORKFLOW_GIT.md](WORKFLOW_GIT.md) - Git and verification workflow.

## 17. Checkpoint

This documentation batch establishes the Media File Status / Open File planning baseline.

Checkpoint tag:

```text
post-mvp-24-1-media-file-status-open-file-planning-v1
```
