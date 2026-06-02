# Sakurava PRD Documentation Pack

## Status

This document serves as the documentation package index for the **Sakurava** project after the **Visual UI Mockup v1** was approved as the design baseline.

The purpose of this package is to lock the product direction prior to coding, ensuring that development does not mix planning, UI, backend, database, integration, testing, and deployment into a single task.

---

## Core Principles

Sakurava must be developed in sequential phases:

1. Planning Only
2. PRD Only
3. UI Wireframe Only
4. Visual UI Mockup Image
5. Frontend Static Only
6. Backend Only
7. Integration Only
8. Testing Only
9. Deployment Only

---

## Source of Truth

Document reference hierarchy:

1. `01-clean-planning.md` — Initial scope and decisions.
2. `02-mvp-prd.md` — Main PRD for the MVP.
3. `03-ui-wireframe.md` — Page structure matching Visual Mockup v1.
4. `03a-mvp-form-specification.md` — Form fields, types, input statuses, and save rules.
5. `04-visual-design-guide.md` — Visual style and Mockup v1 baseline.
6. `05-frontend-static-task-plan.md` — Implementation order for frontend static layout.
7. `06-backend-task-plan.md` — Plan for the backend only.
8. `07-integration-task-plan.md` — Plan for integration only.
9. `08-testing-and-release-checklist.md` — Manual testing and release checklist.
10. `PROJECT_STATUS.md` — Current post-MVP status summary.
11. `ROADMAP_LOCKED.md` — Locked post-MVP roadmap order.
12. `10-category-management-safety.md` — Safe boundaries for Category Management.
13. `11-prd-alignment-and-development-plan.md` — How to read the MVP PRD alongside current post-MVP standards.
14. `12-backup-restore-ux-safety.md` — UX safety rules for Backup and Restore.
15. `13-settings-persistence-planning.md` — Safe plan for Settings persistence.
16. `14-category-management-dedicated-page-planning.md` — Planning for a dedicated Category Management page.
17. `15-form-category-picker-lockdown-planning.md` — Plan to lock the form category picker to Managed Categories.
18. `16-categories-sidebar-page-planning.md` — Planning for the Categories sidebar page (designed for browsing/discovery, not management).
19. `17-related-performer-picker-structure-planning.md` — Planning the Related Performer picker structure.
20. `18-related-performer-storage-planning.md` — Safe storage structure for Related Performers before picker implementation.
21. `19-related-video-image-picker-structure-planning.md` — Planning the Related Video/Image picker structure.
22. `20-related-video-image-storage-planning.md` — Safe storage structure for Related Videos/Images before picker implementation.
23. `21-media-file-status-open-file-planning.md` — Safety plan for local media path status and desktop open/reveal actions.
24. `22-external-media-open-planning.md` — Safety plan for launching external media in default OS applications.
25. `23-cover-thumbnail-full-size-preview-planning.md` — Safe preview plan for full-size covers and thumbnails.
26. `24-performer-mini-thumbnail-storage-form-planning.md` — Safe storage/form plan for 4 mini performer thumbnails.
27. `25-image-gallery-planning.md` — Safety plan for the Image Gallery using explicit image path lists.
28. `26-image-gallery-storage-form-planning.md` — Safe storage/form plan for the Image Gallery path list.
29. `27-image-gallery-qa-safety-review.md` — QA and safety review for the Image Gallery after viewer controls.
30. `28-ui-ux-v1-audit-prioritization-plan.md` — UI/UX V1 audit and roadmap prioritization after Image Gallery completion.
31. `29-catalog-toolbar-v1-planning.md` — Planning the Catalog Toolbar V1 for Videos, Images, and Performers before implementation.
32. `30-detail-page-v1-layout-planning.md` — Layout plan for Video Detail, Image Detail, and Performer Detail.
33. `31-functional-spider-chart-rating-planning.md` — Planning the spider chart rating visualization.
34. `32-tech-info-media-status-planning.md` — Plan for Tech Info and Media path status integration.
35. `33-form-field-ux-v1-planning.md` — Plan for Form Field UX V1 enhancements.
36. `34-settings-page-v1-information-architecture.md` — Information architecture planning for Settings Page V1.
37. `35-category-management-v1-audit-and-planning.md` — Audit and plan for Category Management V1 (Batch 30.1).
38. `36-category-management-data-model-safety-plan.md` — Data model safety plan for Category Management V1 (Batch 30.2).
39. `37-v1-smoke-test-gap-audit-efficient-roadmap.md` — Smoke test gap audit and efficient roadmap planning for Batches 31.1 through 36.3.
40. `38-media-tech-info-availability-safety-plan.md` — Safe plan for Media Tech Info and Availability (Batch 33.1).
41. `39-settings-functional-redesign-data-operations-plan.md` — Plan for Settings functional redesign and data operations (Batch 34.1).
42. `40-import-export-bulk-data-plan.md` — Plan for bulk data import/export (CSV/XLSX for Videos, Images, and Performers).

---

## Current Post-MVP Reading Order

New agents resuming the project should read in this sequence:

1. `../AGENTS.md`
2. `PROJECT_STATUS.md`
3. `ROADMAP_LOCKED.md`
4. `11-prd-alignment-and-development-plan.md`
5. `10-category-management-safety.md`
6. `12-backup-restore-ux-safety.md`
7. `13-settings-persistence-planning.md`
8. `14-category-management-dedicated-page-planning.md`
9. `15-form-category-picker-lockdown-planning.md`
10. `16-categories-sidebar-page-planning.md`
11. `17-related-performer-picker-structure-planning.md`
12. `18-related-performer-storage-planning.md`
13. `19-related-video-image-picker-structure-planning.md`
14. `20-related-video-image-storage-planning.md`
15. `21-media-file-status-open-file-planning.md`
16. `22-external-media-open-planning.md`
17. `23-cover-thumbnail-full-size-preview-planning.md`
18. `24-performer-mini-thumbnail-storage-form-planning.md`
19. `25-image-gallery-planning.md`
20. `26-image-gallery-storage-form-planning.md`
21. `27-image-gallery-qa-safety-review.md`
22. `28-ui-ux-v1-audit-prioritization-plan.md`
23. `29-catalog-toolbar-v1-planning.md`
24. `30-detail-page-v1-layout-planning.md`
25. `31-functional-spider-chart-rating-planning.md`
26. `32-tech-info-media-status-planning.md`
27. `33-form-field-ux-v1-planning.md`
28. `34-settings-page-v1-information-architecture.md`
29. `35-category-management-v1-audit-and-planning.md`
30. `36-category-management-data-model-safety-plan.md`
31. `37-v1-smoke-test-gap-audit-efficient-roadmap.md`
32. `38-media-tech-info-availability-safety-plan.md`
33. `39-settings-functional-redesign-data-operations-plan.md`
34. `40-import-export-bulk-data-plan.md`
35. `AGENT_CODE_HANDOFF.md`
36. `WORKFLOW_GIT.md`

*Note: `02-mvp-prd.md` remains the baseline MVP spec, but is not the sole source for the current project status.*

---

## Approved Visual Mockup v1

Visual Mockup v1 has been approved as the baseline layout and style for the frontend static view.

Pages included in the visual baseline:
- App Shell
- Home
- Videos
- Video Detail
- Video Edit
- Images
- Image Detail
- Image Edit
- Performers
- Performer Detail
- Performer Edit
- Settings

---

## Post-Visual Mockup v1 Decisions

- Minor text changes are permitted.
- The Performers search placeholder is locked to `Search performers...`.
- The Images collection count must use `24 images` instead of `24 videos`.
- The video rating term is locked as `Rewatch`.
- Related Content is a read-only placeholder.
- Tech Info is a read-only placeholder.
- The Browse button is disabled.
- Advanced Performer fields can be shown visually, but are inactive/placeholders for the MVP.
- Frontend Static Only must not use SQLite.
- Frontend Static Only must not use Tauri invokes.
- Frontend Static Only must not use the native file picker.
- Frontend Static Only must not use the relation picker.

---

## Folder Structure

All documentation is stored in:
```text
sakurava-desktop/docs/
```

Layout:
```text
sakurava-desktop/
└─ docs/
   ├─ 00-readme-index.md
   ├─ 01-clean-planning.md
   ├─ 02-mvp-prd.md
   ├─ 03-ui-wireframe.md
   ├─ 03a-mvp-form-specification.md
   ├─ 04-visual-design-guide.md
   ├─ 05-frontend-static-task-plan.md
   ├─ 06-backend-task-plan.md
   ├─ 07-integration-task-plan.md
   └─ 08-testing-and-release-checklist.md
```

---

## Pre-Coding Rules

Do not begin code execution until the following documents are reviewed:
- `02-mvp-prd.md`
- `03-ui-wireframe.md`
- `03a-mvp-form-specification.md`
- `04-visual-design-guide.md`
- `05-frontend-static-task-plan.md`

---

## Codex Coding Rules

Codex/Agents are used strictly for implementation-oriented tasks:
- Frontend Static Only
- Backend Only
- Integration Only
- Testing Only
- Deployment Only

*PRD and planning updates must be drafted/reviewed in design discussions, not direct agent execution.*

## Public Documentation

- [PUBLIC_DOCS.md](docs/PUBLIC_DOCS.md) – Recommended landing page for external readers (English‑first).
- [DOCUMENTATION_ARCHIVE_POLICY.md](docs/DOCUMENTATION_ARCHIVE_POLICY.md) – Policy for handling historical Indonesian planning docs (archival only).

**Note:** Public‑facing documentation is English‑first. Older planning documents remain in Indonesian to preserve locked design context.
