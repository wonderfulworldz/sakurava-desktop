# CURRENT_ROADMAP.md

## Completed Foundations
- Core architecture (Tauri + React + SQLite) – stable.
- Basic CRUD for Videos, Images, Performers.
- Managed Categories (local UI config) and `categoriesJson` storage.
- Settings page with Appearance, Dark Mode, Backup/Restore, CSV import/export.
- Language core & picker (English & Indonesian) – Batch 34.11.

## Current Active Batch (35.x)
- **Batch 35.x – Language System Polish & UI tweaks** (finalizing language picker UI, improving fallback handling, polishing Settings labels).
- Minor quality‑assurance tasks and smoke tests for recently merged batches.

## Near‑Term Priorities (next batches)
1. **Batch 36 – Related Performer & Video/Image Picker implementation**
   - Finalize picker UI, persist selections in JSON fields.
2. **Batch 37 – Media File Status & External Media Open enhancements**
   - Finish runtime implementation, add UI indicators.
3. **Batch 38 – Cover/Thumbnail Full‑Size Preview improvements**
   - Add viewer controls, performance optimizations.
4. **Batch 39 – Performer Mini Thumbnail storage & forms**
   - Complete storage schema, UI forms.

## Later Priorities (post‑MVP roadmap)
- Expand Settings with advanced data‑migration tools.
- Introduce optional CSV bulk‑edit UI.
- Implement optional plugin system for community extensions (future architecture batch).

## Documentation Guidance
- This roadmap supersedes all older batch lists; historic batch documents remain archived for reference only.
- Public reviewers should follow this roadmap for the current development direction.

---
*Keep this file updated as the roadmap evolves.*
