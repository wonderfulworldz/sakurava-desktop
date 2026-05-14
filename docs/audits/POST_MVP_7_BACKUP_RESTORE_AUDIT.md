\# Post-MVP 7 — Backup / Restore Audit



Date: 2026-05-13



\## Scope



Batch 7 implemented local database Backup / Restore for Sakurava.



Backup and Restore only handle the SQLite database file. They do not copy, move, delete, back up, or restore local media files.



\## Completed



\### Batch 7A — Backup Backend Foundation



\- Added `database\_backup` backend command.

\- Backup uses SQLite online backup via `rusqlite`.

\- Backup accepts an explicit destination path.

\- Backup only writes the active `sakurava.sqlite` database.

\- Backup rejects invalid destinations.



Tag:



\- `post-mvp-7a-backup-backend-foundation-v1`



\### Batch 7B — Backup UI



\- Added save-file dialog support.

\- Enabled `Backup Data` in desktop runtime.

\- Browser preview remains non-destructive.

\- Canceling backup destination selection does nothing.

\- Successful backup shows a success message.

\- Restore remained disabled in this sub-batch.



Tag:



\- `post-mvp-7b-backup-ui-v1`



\### Batch 7C — Restore Backend Foundation



\- Added `database\_restore` backend command.

\- Restore validates the selected SQLite file before replacing the active database.

\- Validation checks:

&#x20; - path is not empty

&#x20; - file exists

&#x20; - file is not a directory

&#x20; - file opens as SQLite

&#x20; - `PRAGMA quick\_check` passes

&#x20; - required tables exist:

&#x20;   - `videos`

&#x20;   - `images`

&#x20;   - `performers`

\- Creates a safety backup before restore:

&#x20; - `sakurava-before-restore-<timestamp>.sqlite`

\- Restores through SQLite restore API into the active runtime connection.

\- `restartRequired` is currently `false`.



Tag:



\- `post-mvp-7c-restore-backend-foundation-v1`



\### Batch 7D — Restore UI



\- Added open-file dialog support for `.sqlite`.

\- Enabled `Restore Data` in desktop runtime.

\- Browser preview remains non-destructive.

\- Restore requires confirmation before execution.

\- Confirmation explains:

&#x20; - current Sakurava database will be replaced

&#x20; - only records are restored

&#x20; - local media files are not restored or deleted

&#x20; - safety backup will be created first

\- Successful restore shows restored source path and safety backup path.

\- Backup UI remains working.



Tag:



\- `post-mvp-7d-restore-ui-v1`



\## Intentionally Not Changed



\- No media file backup.

\- No media file restore.

\- No cloud backup.

\- No scheduled backup.

\- No CSV/Excel import/export.

\- No file missing scanner.

\- No native media picker.

\- No database schema changes.

\- No asset scope changes.



\## Known Limitations



\- Backup/Restore handles records only. Saved media paths remain path strings.

\- Restored records may reference media files that do not exist on the current PC.

\- Success messages with long file paths may need UI polish later.



\## Verification



\- `cd src-tauri; cargo test`: passed

\- `npm.cmd run test`: passed

\- `npm.cmd run build`: passed

\- `npm.cmd run tauri build`: passed

\- Manual backup smoke test: passed

\- Manual restore smoke test: passed



\## Decision



Batch 7 is closed as local SQLite database Backup / Restore.



Import/export, media backup, scheduled backup, and file scanning are deferred.

