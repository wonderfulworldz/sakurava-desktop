# CURRENT_PRODUCT_PLAN.md

## Overview
Sakurava is a **local‑first, privacy‑first** Windows desktop application for managing **Videos**, **Images**, and **Performers**. All data is stored locally in an encrypted SQLite database; the app never syncs, uploads, or tracks usage.

## Core Architecture
- **Runtime:** Tauri (v2) with a Rust backend.
- **Frontend:** React, TypeScript, Tailwind CSS, Vite.
- **Database:** SQLite accessed via `rusqlite`.
- **Languages:** English UI with optional Indonesian language picker (Batch 34.11).

## Current Scope (pre‑release)
- Full CRUD for Videos, Images, Performers.
- Managed Categories (local UI config) used in form pickers.
- Record categories stored as `categoriesJson` text arrays.
- Related Performer, Video, and Image picker/storage/detail systems implemented through the completed post-MVP related-system batches.
- Form, Category Library, and Detail system finalization completed through Batches 35.2, 35.3, and 35.4.
- Global Gallery Preview and the separate Global Image Viewer flow finalized through Batch 35.5.
- Collection toolbar, table view, sorting, filter panel, active filter chips, and global catalog pagination finalized through Batch 35.6.
- Settings page with Appearance, Dark Mode, Backup/Restore, CSV import/export.
- No cloud services, telemetry, or external account integration.

## Known Deferred Before Full App Audit
- Save As implementation.
- Open Folder implementation.
- Performer Gender filter.
- Performer Body Type filter.

## Out‑of‑Scope (for now)
- Automatic media sync or cloud backup.
- Server‑side APIs or remote databases.
- Multi‑language UI beyond the built‑in English/Indonesian core strings.
- Advanced analytics or usage tracking.

## Data Safety Rules
- **Never commit** media files or active `sakurava.sqlite` database.
- **Never commit** secrets, API keys, or personal file‑system paths.
- All batch changes patch only `categoriesJson` or safe fields; no schema migrations without explicit batch approval.
- Backups are local‑only, safe, and do not include media.

## Packaging & Dummy Data
- Release builds contain an **empty** SQLite database; dummy data used in development is excluded via `.gitignore`.
- Media assets in `public/` are placeholder images for UI; they are not part of the production bundle.

## Relationship to Historical Docs
- This document supersedes older planning files for public reviewers.
- Historical Indonesian planning docs remain archived for reference only (see `docs/DOCUMENTATION_ARCHIVE_POLICY.md`).

---
*Keep this file updated as the product direction evolves.*
