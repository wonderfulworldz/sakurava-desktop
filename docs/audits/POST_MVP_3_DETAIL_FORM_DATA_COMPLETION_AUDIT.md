\# Post-MVP 3 — Detail \& Form Data Completion Audit



Date: 2026-05-13



\## Scope



Batch 3 focused on completing and clarifying Detail and Form behavior using already persisted MVP fields.



No schema-backed expansion was added in this batch.



\## Completed



\### Batch 3A — Persisted Detail Field Completion



\- Added separated System Info on detail pages.

\- Displayed persisted system timestamps as:

&#x20; - Created in Sakurava

&#x20; - Last edited

\- Kept system metadata separate from main content metadata.

\- Avoided raw timestamp display.

\- Clarified placeholder/static-only sections where needed.



Tag:



\- `post-mvp-3a-system-detail-metadata-v1`



\### Batch 3B — Form UX Cleanup for Persisted Fields



\- Clarified manually saved path fields.

\- Marked disabled browse/file actions as planned.

\- Clarified that Video/Image tech or folder analysis data is not detected or saved in MVP.

\- Marked deferred Performer thumbnail, years-active, personal, and physical fields as planned/not saved.

\- Kept persisted Performer fields editable:

&#x20; - Birth Date

&#x20; - Filmography

&#x20; - Pictorials



Tag:



\- `post-mvp-3b-form-ux-cleanup-v1`



\## Intentionally Not Changed



\- No database schema changes.

\- No src-tauri/Rust changes.

\- No CRUD logic changes.

\- No delete flow.

\- No thumbnail rendering.

\- No native file picker.

\- No backup/restore.

\- No import/export.

\- No bulk tools.

\- No related picker.

\- No advanced categories.

\- No schema-backed Performer personal/physical fields.



\## Deferred Work



\### Performer profile expansion



Deferred fields that require schema-backed implementation:



\- Birthplace

\- Nationality

\- Astrological Sign

\- Blood Type

\- Height

\- Weight

\- Measurement

\- Cup Size

\- Years Active

\- Performer thumbnails



\### Media/tech detection



Deferred fields that require runtime scanning or media analysis:



\- Video resolution

\- Video file size

\- Codec

\- Bitrate

\- Frame rate

\- Image folder size

\- Detected image count

\- Main resolution

\- File types



\## Verification



\- `npm.cmd run test`: passed

\- `npm.cmd run build`: passed

\- Manual detail smoke test: passed

\- Manual form smoke test: passed



\## Decision



Batch 3 is closed as persisted-field completion and form UX clarification only.



Schema-backed Performer profile expansion is deferred to a separate future batch.

