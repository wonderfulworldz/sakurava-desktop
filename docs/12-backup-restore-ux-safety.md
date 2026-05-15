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

## 4. Backup Safety Rules

The following rules apply to the Backup feature:

### 4.1 Data Integrity

- **Backup must never mutate existing data.** Backup is a read-only operation that generates a copy.
- **Backup must generate a clear backup artifact.** The output must be a valid SQLite database file.
- **Backup failure must not affect the current database.** A failed backup should not leave the app in a broken state.

### 4.2 File Naming

- **Backup file name should be recognizable and timestamped.** Recommended pattern: `sakurava-backup-YYYY-MM-DD-HHmmss.sqlite`
- The file extension should be `.sqlite` or `.bak` to indicate it is a database backup.

### 4.3 User Feedback

- **Backup result must show success/failure clearly.** Do not leave the user guessing whether the backup succeeded.
- Show the backup file path on success so the user knows where the backup was saved.
- On failure, show a clear error message and do not leave partial files.

### 4.4 Media Scope Clarity

- **Backup must not imply that external media files are included unless explicitly supported.**
- If media files are not included (as is currently the case), the UI and confirmation dialogs must clearly state this.
- Use clear language: "This backup includes only your database records. Media files (videos, images) are not included."

## 5. Restore Safety Rules

The following rules apply to the Restore feature:

### 5.1 Destructive Operation Warning

- **Restore is destructive.** It replaces the current database with the backup data.
- **Restore must require explicit confirmation before replacing current data.** One-click restore is not acceptable.
- **Restore should never run from a single accidental click.** Require at least: select file -> validate -> preview -> confirm -> execute.

### 5.2 Pre-Restore Safety

- **Restore should preserve a recovery path when feasible.** Creating a pre-restore safety backup before applying restore is recommended.
- The existing implementation already creates `sakurava-before-restore-<timestamp>.sqlite` before restore. This is the correct pattern.
- Show the user where the safety backup is stored in case they need to revert.

### 5.3 Validation

- **Restore should validate the selected backup file before applying.**
  - File exists.
  - File is readable.
  - File is a valid SQLite database.
  - Required tables exist (`videos`, `images`, `performers`).
  - `PRAGMA quick_check` passes.
- **Restore should reject invalid or unreadable backup files.** Show a clear error message and do not proceed.

### 5.4 Failure Handling

- **Restore failure must not leave the app in a partially restored state.** If restore fails, the app should still have access to the current data.
- If a safety backup was created, ensure it is preserved on failure.
- Show a clear error message with the failure reason and next steps.

### 5.5 User Feedback

- **Restore should show what file is being restored.** Display the file name and path.
- **Restore should clearly explain whether media files are included or not.** This must be explicit in the confirmation dialog.
- On success, show the restored source path and the safety backup path.
- On failure, show the error and the safety backup location.

### 5.6 Post-Restore

- If the app requires a restart to reload the restored database, prompt the user to restart.
- The current implementation sets `restartRequired: false` but this should be re-evaluated if schema changes occur in the future.

## 6. Required Restore UX Flow

The required flow for safe Restore:

1. **Select backup file**: User clicks "Restore Data" and uses file picker to select a `.sqlite` or `.bak` file.
2. **Validate file**: The app validates the selected file (exists, readable, valid SQLite, required tables, quick_check passes).
3. **Show restore preview/summary**: Display what will be restored (record counts by type: videos, images, performers).
4. **Warn about replacement risk**: Explicitly state that the current database will be replaced.
5. **State media scope**: Clearly state that media files (videos, images) are NOT included in the restore.
6. **Create pre-restore safety backup**: Automatically create a safety backup before applying restore.
7. **Require explicit confirmation**: The user must click a "Confirm Restore" button (not just "OK" on a dialog).
8. **Apply restore**: Execute the restore operation.
9. **Show result**: Display success or failure. On success, show the restored file path and safety backup path.
10. **Prompt restart if needed**: If the app requires a restart, prompt the user.

## 7. Backup File Validation

Document the expected validation checks for Backup files:

- **File exists**: The selected file must exist on disk.
- **File is readable**: The app must be able to read the file.
- **Expected file type/extension**: `.sqlite` or `.bak` preferred.
- **Expected metadata/version if available**: Check SQLite header for valid database.
- **Expected database/content structure**: Required tables must exist (`videos`, `images`, `performers`).
- **PRAGMA quick_check passes**: Run SQLite integrity check.
- **Reject unknown/corrupt files safely**: Show clear error message, do not crash.

## 8. Media and Local Asset Scope

### 8.1 Scope Separation

- **Database backup and media backup are different concerns.** Sakurava's current backup only covers SQLite/database data.
- **The backup must not claim to back up actual media files.** The UI and documentation must be explicit about this limitation.
- **Local paths may become missing after restore.** If a user moves their media folders, the restored records will still reference the old paths. This is expected behavior.

### 8.2 Future Media Backup

- **Future media-root backup/export should be treated as a separate batch.** Do not mix media file backup with database backup in this roadmap item.
- If media backup is added in the future, it should be a separate feature with its own safety review document.

## 9. User-Facing Warnings

Recommended warning language for UI:

### 9.1 Before Restore

```
Warning: This will replace your current database with the backup.
Your current records will be lost.

This backup contains only database records. Media files (videos, images) are not included.

A safety backup of your current data will be created before restore.
```

### 9.2 Invalid Backup File

```
The selected file is not a valid Sakurava backup.
Please select a valid SQLite database file.

Error: [specific error message]
```

### 9.3 Restore Success

```
Restore completed successfully.

Restored from: [file path]
Safety backup: [file path]

Note: Media files were not restored. Check that your media paths are correct.
```

### 9.4 Restore Failure

```
Restore failed.

Error: [specific error message]

Your current data has been preserved.
Safety backup location: [file path]

Please try again or use the safety backup to restore.
```

### 9.5 Media Files Not Included

```
This backup includes only your database records.
Media files (videos, images) are not included.

To back up media files, you would need to separately copy your media folders.
```

## 10. Non-Goals / Deferred

The following are explicitly deferred and should not be introduced in Backup/Restore batches:

- Full media folder backup
- Cloud backup
- Scheduled backup
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
- [ ] Has validation of backup file before applying
- [ ] Has failure handling that preserves current data
- [ ] Has test plan covering success and failure scenarios
- [ ] Preserves current data on failure
- [ ] Documents whether media files are included (must be clear in UI)
- [ ] Does not modify unrelated features
- [ ] Does not change schema without explicit approval
- [ ] Follows the Restore UX Flow in Section 6

## 12. Agent Notes

Future agents implementing Backup/Restore features:

- **Do not implement Backup/Restore from this batch.** This batch is documentation only.
- **Do not change schema/backend/Tauri code in this batch.** The current backup/restore implementation is already in place from Batch 7.
- **Do not assume backup includes media files.** The current implementation only covers the SQLite database.
- **Do not make restore a one-click destructive action.** Require the full flow in Section 6.
- **Do not add UI polish unless required for safety/usability.** UI polish is not a default roadmap item.
- **Keep future implementation in a separate batch.** If new Backup/Restore features are needed, create a new batch.
- **Refer to the existing audit** (`docs/audits/POST_MVP_7_BACKUP_RESTORE_AUDIT.md`) for the current implementation details.
- **Always include clear messaging about media file scope** in any new Backup/Restore UI.

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
