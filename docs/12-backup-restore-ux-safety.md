# 12 - Backup/Restore UX Safety Review

## 1. Purpose

Backup and Restore are data-risk operations. They directly affect the user's persisted catalog data. This document defines safe UX rules for Backup/Restore before any future implementation work continues.

This batch is a documentation/planning batch only. It reviews and documents expected UX safety rules. No implementation, UI changes, Tauri/backend changes, or schema changes are permitted in this batch.

## 2. Current Scope

This batch only reviews and documents expected UX safety rules:

- Do not implement Backup/Restore behavior.
- Do not change existing Backup/Restore runtime behavior.
- Do not change schema.
- Do not change backend/Rust/Tauri files.
- Do not add UI polish unless required for safety/usability.
- Do not add tests (tests are part of implementation batches).

The goal is to define a safe plan for Backup/Restore UX that a future implementation agent can follow.

## 3. Current Implementation Context

Based on the existing Backup/Restore audit (`docs/audits/POST_MVP_7_BACKUP_RESTORE_AUDIT.md`):

- **Backup**: Uses SQLite online backup via `rusqlite`. Accepts an explicit destination path. Only writes the active `sakurava.sqlite` database.
- **Restore**: Validates the selected SQLite file before replacing the active database. Creates a safety backup before restore (`sakurava-before-restore-<timestamp>.sqlite`).
- **Scope**: Backup/Restore only handles the SQLite database file. They do not copy, move, delete, back up, or restore local media files.

This safety review builds on top of the existing implementation to define the UX expectations.

### 3.1 Batch 41.7 Decision Amendment

The database-only behavior above is the legacy compatibility baseline, not the
final Batch 41.7 target:

- Normal backup must use
  `%APPDATA%\app.sakurava.desktop\backups`; the user does not select a normal
  backup destination.
- The UI provides Manual Backup and Open Backup Folder.
- Automatic backup is limited to while Sakurava is running, with at most one
  catch-up backup at the next app start when a schedule was missed.
- Frequency and automatic-backup rotation are selectable.
- A backup may contain an optional note.
- Automatic rotation never deletes manual backups.
- The target package contains `manifest.json`, `sakurava.sqlite`, optional note
  metadata, and only explicitly allowlisted durable app-managed assets whose
  ownership has been defined.
- Original/full media, user media roots, and disposable caches are excluded.
- Restore must follow:
  `select -> validate -> preview -> safety package -> confirm -> apply -> result`.

The physical package format remains an implementation decision gate: approve
either a directory package v1 without a new dependency or a single archive
package with explicit dependency approval. No document or UI may present the
format as implemented before that approval.

## 4. Backup Safety Rules

The following rules apply to the Backup feature:

### 4.1 Data Integrity

- **Backup must never mutate existing data.** Backup is a read-only operation that generates a copy.
- **Backup must generate a clear backup artifact.** The final target is a
  versioned Sakurava package containing a valid SQLite backup and manifest.
- **Backup failure must not affect the current database.** A failed backup should not leave the app in a broken state.

### 4.2 File Naming

- **Backup package name should be recognizable and timestamped.** Its exact
  suffix depends on the approved physical package format.
- Raw `.sqlite` or `.bak` files remain legacy compatibility inputs only under
  the separately approved compatibility policy.

### 4.3 User Feedback

- **Backup result must show success/failure clearly.** Do not leave the user guessing whether the backup succeeded.
- Show the backup package path on success and provide Open Backup Folder.
- On failure, show a clear error message and do not leave partial files.

### 4.4 Media Scope Clarity

- **Backup must not imply that external media files are included.**
- Original video files, original full image files, and user media roots are
  never package contents.
- `thumbnail-cache`, `preview-cache`, and `generated-cache` are disposable and
  excluded.
- Referenced media paths remain database metadata; referenced files are not
  copied.

## 5. Restore Safety Rules

The following rules apply to the Restore feature:

### 5.1 Destructive Operation Warning

- **Restore is destructive.** It replaces the current database with the backup data.
- **Restore must require explicit confirmation before replacing current data.** One-click restore is not acceptable.
- **Restore should never run from a single accidental click.** Require:
  select -> validate -> preview -> safety package -> confirm -> apply -> result.

### 5.2 Pre-Restore Safety

- **Restore must preserve a recovery path.** A safety package covering every
  component that apply may replace is required before confirmation.
- The existing database-only
  `sakurava-before-restore-<timestamp>.sqlite` behavior is the foundation, not
  sufficient coverage for a package that restores additional durable assets.
- Show the user where the safety package is stored.

### 5.3 Validation

- **Restore must validate the selected package through a read-only operation
  before preview and confirmation.**
  - File exists.
  - File is readable.
  - File is a valid SQLite database.
  - Required tables exist (`videos`, `images`, `performers`).
  - `PRAGMA quick_check` passes.
- **Restore should reject invalid or unreadable backup packages.** Show a clear error message and do not proceed.

### 5.4 Failure Handling

- **Restore failure must not leave the app in a partially restored state.** If restore fails, the app should still have access to the current data.
- If a safety package was created, ensure it is preserved on failure.
- Show a clear error message with the failure reason and next steps.

### 5.5 User Feedback

- **Restore should show what package is being restored.** Display its name and path.
- **Restore should clearly explain whether media files are included or not.** This must be explicit in the confirmation dialog.
- On success, show the restored source path and the safety-package path.
- On failure, show the error and the safety-package location.

### 5.6 Post-Restore

- If the app requires a restart to reload the restored database, prompt the user to restart.
- The current implementation sets `restartRequired: false` but this should be re-evaluated if schema changes occur in the future.

## 6. Required Restore UX Flow

The required flow for safe Restore:

1. **Select backup package**.
2. **Validate read-only**: Validate package version, manifest, contents, SQLite integrity, and required schema without mutation.
3. **Show restore preview/summary**: Display record counts, included durable assets, excluded media scope, note, and compatibility warnings.
4. **Create pre-restore safety package**: Cover every component that apply may replace.
5. **Warn about replacement risk**.
6. **State media scope**: Original/full media files and user media roots are not included.
7. **Require explicit confirmation after successful preview and safety-package creation**.
8. **Apply restore**.
9. **Show result**: Report source, safety-package path, restored components, and rollback/failure status.
10. **Prompt restart if needed**.

## 7. Backup File Validation

Document the expected validation checks for Backup packages:

- **Package exists**: The selected package must exist on disk.
- **Package is readable**: The app must be able to read the package.
- **Expected package type/version**: Match the approved physical package and
  manifest version.
- **Expected metadata**: Validate trusted manifest metadata and package kind.
- **Expected database/content structure**: Required tables must exist (`videos`, `images`, `performers`).
- **PRAGMA quick_check passes**: Run SQLite integrity check.
- **Reject unknown/corrupt files safely**: Show clear error message, do not crash.

## 8. Media and Local Asset Scope

### 8.1 Scope Separation

- **Database backup and media backup are different concerns.** Sakurava's current backup only covers SQLite/database data.
- **The backup must not claim to back up actual media files.** The UI and documentation must be explicit about this limitation.
- **Local paths may become missing after restore.** If a user moves their media folders, the restored records will still reference the old paths. This is expected behavior.

### 8.2 Durable App-Managed Asset Boundary

- A package may include only durable assets under an explicit app-owned
  allowlist.
- Never recursively package app data or user media roots.
- Disposable caches are excluded even though they are under app data.
- If ownership or rollback behavior is ambiguous, stop before implementation.

### 8.3 Automatic Backup and Rotation

- No OS scheduler, Windows Task Scheduler, background service, or always-on
  tray process.
- Automatic backup runs only while Sakurava is open.
- A missed schedule creates at most one catch-up backup on next start.
- Backup, restore, import, and relevant database mutations require concurrency
  coordination.
- Rotation runs only after a successful automatic backup.
- Rotation inspects only the default backup folder, uses trusted manifest
  metadata, deletes only automatic backups, never deletes manual backups, and
  refuses paths outside the backup folder.

## 9. User-Facing Warnings

Recommended warning language for UI:

### 9.1 Before Restore

```
Warning: This will replace your current database with the backup.
Your current records will be lost.

This backup contains the Sakurava database and any explicitly listed durable
app-managed assets shown in the preview.

Original videos, original full images, user media roots, and disposable caches
are not included.

A safety package of the current components will be created before confirmation.
```

### 9.2 Invalid Backup File

```
The selected package is not a valid Sakurava backup.
Please select a compatible Sakurava backup package.

Error: [specific error message]
```

### 9.3 Restore Success

```
Restore completed successfully.

Restored from: [file path]
Safety package: [package path]

Note: Media files were not restored. Check that your media paths are correct.
```

### 9.4 Restore Failure

```
Restore failed.

Error: [specific error message]

Your current data has been preserved.
Safety package location: [package path]

Please try again or use the safety package to restore.
```

### 9.5 Media Files Not Included

```
This backup includes the Sakurava database and the durable app-managed assets
listed in its manifest.

Original videos, original full images, user media roots, and disposable caches
are not included.

To back up media files, you would need to separately copy your media folders.
```

## 10. Non-Goals / Deferred

The following are explicitly deferred and should not be introduced in Backup/Restore batches:

- Full media folder backup
- Cloud backup
- OS-scheduled or background-service backup
- Encrypted backup
- Import/export category mapping (CSV/Excel)
- Cross-device sync
- Advanced restore merge (partial restore, merge instead of replace)
- UI polish (unless required for safety or usability)
- Implementation work (this is a planning batch)

## 11. Future Implementation Checklist

When a future implementation batch begins for Backup/Restore, verify:

- [ ] Has preview/summary showing record counts
- [ ] Has confirmation step requiring explicit user action
- [ ] Has read-only validation of the backup package before preview
- [ ] Has failure handling that preserves current data
- [ ] Has test plan covering success and failure scenarios
- [ ] Preserves current data on failure
- [ ] Documents whether media files are included (must be clear in UI)
- [ ] Does not modify unrelated features
- [ ] Does not change schema without explicit approval
- [ ] Follows the Restore UX Flow in Section 6
- [ ] Uses the app-owned default backup folder for normal backup
- [ ] Distinguishes manual and automatic packages through trusted metadata
- [ ] Never rotates manual packages
- [ ] Excludes original media, user media roots, and disposable caches
- [ ] Coordinates backup/restore/import/database mutation concurrency

## 12. Agent Notes

Future agents implementing Backup/Restore features:

- **Do not implement Backup/Restore from this batch.** This batch is documentation only.
- **Do not change schema/backend/Tauri code in this batch.** The current backup/restore implementation is already in place from Batch 7.
- **Do not assume backup includes media files.** The revised package may include
  only explicitly allowlisted durable app-managed assets; external media is
  always excluded.
- **Do not make restore a one-click destructive action.** Require the full flow in Section 6.
- **Do not add UI polish unless required for safety/usability.** UI polish is not a default roadmap item.
- **Keep future implementation in a separate batch.** If new Backup/Restore features are needed, create a new batch.
- **Refer to the existing audit** (`docs/audits/POST_MVP_7_BACKUP_RESTORE_AUDIT.md`) for the current implementation details.
- **Always include clear messaging about media file scope** in any new Backup/Restore UI.

## 12.1 Batch 41.7 Implementation Sequence

```text
41.7.0 Audit + Decision Amendment
41.7.1 Runtime package foundation
41.7.2 Restore validation and preview
41.7.3 Package restore safety
41.7.4 Settings UI and manual backup
41.7.5 App-open automatic backup
```

Implementation must stop when the package format is unapproved, the durable
asset allowlist is undefined, an archive dependency lacks approval, preview
cannot run read-only, the safety package cannot cover restored components,
rotation cannot distinguish manual from automatic packages, deletion can
escape the default folder, automatic backup requires an OS scheduler/service,
restore can overlap backup/import/database mutation, or raw SQLite
compatibility policy is undefined.

## 13. Related Documents

- [docs/audits/POST_MVP_7_BACKUP_RESTORE_AUDIT.md](audits/POST_MVP_7_BACKUP_RESTORE_AUDIT.md) - Existing Backup/Restore implementation audit
- [docs/09-runtime-command-boundary.md](09-runtime-command-boundary.md) - Runtime command definitions
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order

## 14. Checkpoint

This documentation batch establishes the Backup/Restore UX safety baseline.

Checkpoint tag:

```text
post-mvp-18-1-backup-restore-ux-safety-v1
```
