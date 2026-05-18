# Agent Code Handoff

Use this document when continuing Sakurava with VSCode Agent Code or Codex.

Use these docs as compressed project memory. Do not reconstruct the full historical workflow unless the user explicitly asks for it.

## First Prompt For Agent Code

```text
You are working on the Sakurava desktop app.

Read AGENTS.md first, then docs/PROJECT_STATUS.md, docs/ROADMAP_LOCKED.md, docs/11-prd-alignment-and-development-plan.md, docs/10-category-management-safety.md, docs/12-backup-restore-ux-safety.md, docs/13-settings-persistence-planning.md, docs/14-category-management-dedicated-page-planning.md, docs/15-form-category-picker-lockdown-planning.md, docs/16-categories-sidebar-page-planning.md, docs/17-related-performer-picker-structure-planning.md, docs/18-related-performer-storage-planning.md, docs/19-related-video-image-picker-structure-planning.md, docs/20-related-video-image-storage-planning.md, docs/21-media-file-status-open-file-planning.md, docs/22-external-media-open-planning.md, docs/23-cover-thumbnail-full-size-preview-planning.md, docs/24-performer-mini-thumbnail-storage-form-planning.md, docs/25-image-gallery-planning.md, docs/26-image-gallery-storage-form-planning.md, docs/27-image-gallery-qa-safety-review.md, docs/28-ui-ux-v1-audit-prioritization-plan.md, docs/29-catalog-toolbar-v1-planning.md, docs/30-detail-page-v1-layout-planning.md, docs/31-functional-spider-chart-rating-planning.md, docs/32-tech-info-media-status-planning.md, docs/WORKFLOW_GIT.md, and docs/AGENT_CODE_HANDOFF.md.

Follow the locked terminology, no auto-commit rule, category safety rules, Backup/Restore safety rules, Settings persistence planning rules, Category Management dedicated page planning rules, Form Category Picker Lockdown planning rules, Categories Sidebar Page planning rules, Related Performer Picker Structure planning rules, Related Performer Storage planning rules, Related Video/Image Picker Structure planning rules, Related Video/Image Storage planning rules, Media File Status / Open File planning rules, External Media Open planning rules, Performer Mini Thumbnail Storage/Form planning rules, Image Gallery planning rules, and Image Gallery Storage/Form planning rules. Keep the batch scoped. Do not change application code, tests, schema, backend/Rust/Tauri, UI, or category behavior unless this specific batch asks for it.

Category Management implementation is complete through Batch 16.3. Category Management safety documentation is complete through Batch 17.1 if already merged. For Category Management dedicated page work, read docs/14-category-management-dedicated-page-planning.md before planning or implementation. For Form Category Picker Lockdown work, read docs/15-form-category-picker-lockdown-planning.md before implementation. For Categories Sidebar Page work, read docs/16-categories-sidebar-page-planning.md before implementation. For Related Performer Picker Structure work, read docs/17-related-performer-picker-structure-planning.md before implementation. For Related Performer Storage work, read docs/18-related-performer-storage-planning.md before implementation. For Related Video/Image Picker Structure work, read docs/19-related-video-image-picker-structure-planning.md before implementation. For Related Video/Image Storage work, read docs/20-related-video-image-storage-planning.md before implementation. For Media File Status / Open File work, read docs/21-media-file-status-open-file-planning.md before implementation. For External Media Open work, read docs/22-external-media-open-planning.md before implementation. For Cover/Thumbnail Full Size Preview work, read docs/23-cover-thumbnail-full-size-preview-planning.md before implementation. For Performer Mini Thumbnail Storage/Form work, read docs/24-performer-mini-thumbnail-storage-form-planning.md before implementation. For Image Gallery work, read docs/25-image-gallery-planning.md before planning or implementation. For Image Gallery Storage/Form work, read docs/26-image-gallery-storage-form-planning.md before implementation. For Backup/Restore work, read docs/12-backup-restore-ux-safety.md before planning or implementation. For Settings persistence work, read docs/13-settings-persistence-planning.md before planning or implementation. UI polish is not a default roadmap item.

Before editing, check git status. After editing, report files changed, verification run, risks, and follow-up. Do not commit without user approval.
```

## Files To Read First

Read these before planning or editing:

- `AGENTS.md`
- `docs/PROJECT_STATUS.md`
- `docs/ROADMAP_LOCKED.md`
- `docs/11-prd-alignment-and-development-plan.md`
- `docs/10-category-management-safety.md`
- `docs/12-backup-restore-ux-safety.md`
- `docs/13-settings-persistence-planning.md`
- `docs/14-category-management-dedicated-page-planning.md`
- `docs/15-form-category-picker-lockdown-planning.md`
- `docs/16-categories-sidebar-page-planning.md`
- `docs/17-related-performer-picker-structure-planning.md`
- `docs/18-related-performer-storage-planning.md`
- `docs/19-related-video-image-picker-structure-planning.md`
- `docs/20-related-video-image-storage-planning.md`
- `docs/21-media-file-status-open-file-planning.md`
- `docs/22-external-media-open-planning.md`
- `docs/23-cover-thumbnail-full-size-preview-planning.md`
- `docs/24-performer-mini-thumbnail-storage-form-planning.md`
- `docs/25-image-gallery-planning.md`
- `docs/26-image-gallery-storage-form-planning.md`
- `docs/27-image-gallery-qa-safety-review.md`
- `docs/28-ui-ux-v1-audit-prioritization-plan.md`
- `docs/29-catalog-toolbar-v1-planning.md`
- `docs/30-detail-page-v1-layout-planning.md`
- `docs/31-functional-spider-chart-rating-planning.md`
- `docs/32-tech-info-media-status-planning.md`
- `docs/WORKFLOW_GIT.md`
- `docs/AGENT_CODE_HANDOFF.md`
- `package.json`

For category-related work, also inspect:

- `src/lib/managedCategories.ts`
- `src/lib/categoryAudit.ts`
- `src/lib/categoryRenamePreview.ts`
- `src/lib/categoryRenameApply.ts`
- `src/pages/SettingsPage.tsx`
- `src/App.test.tsx`

## Critical Warnings

- Do not commit without user approval.
- Do not rename locked terms.
- Do not replace `categoriesJson` with category IDs, UUIDs, `categoryIds`, relation tables, or parent/child categories.
- Do not mutate records from Managed Category operations.
- Do not mutate Managed Categories from Record Category operations.
- Do not perform mass record category changes without preview and confirmation.
- Record category operations must patch only `categoriesJson`.
- Preserve unrelated record fields.
- Keep UI polish out of the default plan unless requested or blocking usability.
- Keep documentation-only batches documentation-only.
- Treat future Category Management dedicated page work as separate from the Categories sidebar browsing/catalog page.
- Treat future form category lockdown as a Managed Categories-only picker direction, not free-text creation.
- For Form Category Picker Lockdown implementation, preserve `categoriesJson` and do not mutate Managed Categories from forms.
- For Categories Sidebar Page implementation, keep it browsing/discovery only and do not add management or destructive operations.
- For Related Performer Picker Structure implementation, do not auto-create Performers, do not mutate Performer records from Video/Image forms, and do not invent storage before inspecting current record shapes.
- For Related Performer Storage implementation, prefer the planned JSON field direction unless the user explicitly approves a relational schema batch.
- For Related Video/Image Picker Structure implementation, do not auto-create related Video/Image records, do not mutate target records from the current form, and do not invent storage before storage planning.
- For Related Video/Image Storage implementation, prefer the planned `relatedImagesJson` and `relatedVideosJson` JSON field direction unless the user explicitly approves a relational schema batch.
- Leave related pickers and Media Play for future phases after category page decisions.
- Do not make restore a one-click destructive action - follow the Restore UX Flow in `docs/12-backup-restore-ux-safety.md`.
- Backup/Restore must clearly state that media files are not included in the backup.
- Do not implement Settings persistence without reading `docs/13-settings-persistence-planning.md`.
- Keep low-risk UI preferences separate from data-risk Settings.
- Settings persistence must not mutate catalog records, category behavior, Backup/Restore behavior, or media behavior unless a later batch explicitly asks.
- For UI/UX V1 Settings work, remove the embedded Manage Category / Category Management panel from Settings and replace it with a simple menu item plus one clear link/button to the dedicated Category Management page. Full Category Management CRUD, parent category, description, thumbnail, table, pagination, and selected category detail belong outside Settings.
- Read `docs/14-category-management-dedicated-page-planning.md` before Category Management dedicated page work.
- Do not mix Category Management dedicated page work with the future Categories Sidebar Page.
- Do not mix Category Management dedicated page work with Form Category Picker Lockdown.
- Read `docs/16-categories-sidebar-page-planning.md` before Categories Sidebar Page work.
- Do not mix Categories Sidebar Page work with Category Management or Form Category Picker Lockdown.
- Read `docs/17-related-performer-picker-structure-planning.md` before Related Performer Picker Structure work.
- Do not mix Related Performer Picker Structure work with Related Video/Image Picker or media behavior.
- Read `docs/18-related-performer-storage-planning.md` before Related Performer Storage work.
- Do not implement Related Performer Picker persistence before storage has been approved.
- Read `docs/19-related-video-image-picker-structure-planning.md` before Related Video/Image Picker work.
- Do not implement Related Video/Image Picker persistence before storage planning and storage implementation have been approved.
- Read `docs/20-related-video-image-storage-planning.md` before Related Video/Image Storage work.
- Do not add Related Video/Image relation tables unless the user explicitly approves a relational schema batch.
- Read `docs/21-media-file-status-open-file-planning.md` before Media File Status / Open File work.
- Do not implement media file status, open/reveal actions, media playback, file scanners, or broad file indexing from a planning batch.
- Media File Status / Open File must not delete, move, rename, modify, auto-play, or recursively scan local files.
- Read `docs/22-external-media-open-planning.md` before External Media Open work.
- Do not build an embedded video player, file manager, folder manager, file scanner, or Reveal in Folder behavior unless the user explicitly asks.
- External Media Open should use the default OS app for Video `Play` and should rely on existing Media File Status before enabling actions.
- Read `docs/23-cover-thumbnail-full-size-preview-planning.md` before Cover/Thumbnail Full Size Preview work.
- Do not build gallery from `folderPath`, scan folders, or invent Performer mini thumbnail data.
- Performer mini thumbnails must be backed by explicit saved paths before becoming functional.
- Read `docs/24-performer-mini-thumbnail-storage-form-planning.md` before Performer mini thumbnail storage/form work.
- Do not fake Performer mini thumbnails, scan folders to find them, or mix storage, form, detail preview, and gallery into one batch.
- Read `docs/25-image-gallery-planning.md` before Image Gallery work.
- Image Gallery should use an explicit saved image path list such as `galleryImagePathsJson` as the future source of truth.
- Do not live-scan `folderPath` when opening Image Detail.
- Do not scan child folders/subfolders for Image Gallery.
- Folder reading for Image Gallery must happen only after explicit user action and direct files only.
- Image Gallery thumbnails should be 1:1 square and the grid should use load-more rendering. After Batch 27.8, Image Detail uses 16 initial images and +16 per Load More to approximate two visible desktop rows.
- Do not copy, import, move, rename, delete, generate thumbnails, or otherwise mutate user files for Image Gallery.
- Read `docs/26-image-gallery-storage-form-planning.md` before Image Gallery Storage/Form work.
- Image Gallery Storage/Form uses `galleryImagePathsJson` as a JSON array string of explicit local image paths after Batch 25.3.
- Image Create/Edit forms use structured `Gallery Images` path rows, not raw JSON.
- Gallery path normalization should trim, remove empty paths, dedupe within one Image record, and preserve first occurrence order.
- Invalid or missing `galleryImagePathsJson` should parse as an empty array.
- Gallery folder picker/direct read is implemented after Batch 25.4. It reads only direct files from one explicitly selected folder, filters `.jpg`, `.jpeg`, `.png`, `.webp`, and `.gif` case-insensitively, replaces Gallery Images rows, and does not scan child folders.
- Native multi-image picker remains intentionally unimplemented unless explicitly requested.
- Image Detail gallery grid is implemented after Batch 25.5.
- Image Detail gallery full-size viewer controls are implemented after Batch 25.6. The viewer opens from saved gallery tiles, uses only `galleryImagePathsJson`-derived paths, keeps controls/status as overlays, supports Previous/Next, Fit/100%/Zoom In/Zoom Out, browser fullscreen with in-app fallback, scoped ArrowLeft/ArrowRight/Escape keyboard handling, and safe missing-image fallback behavior.
- Image Gallery QA/safety review is documented after Batch 25.7. Treat `galleryImagePathsJson` as the confirmed source of truth, keep `folderPath` metadata/reference only, keep `Browse Gallery Folder` direct-files-only, and do not add multi-image picker, recursive scan, watcher/live sync, file mutation, thumbnail generation, broad scanner, or schema/database changes unless a later batch explicitly asks.
- UI/UX V1 Audit and Prioritization Plan is documented after Batch 26.1. Use `docs/28-ui-ux-v1-audit-prioritization-plan.md` as the active UI/UX V1 roadmap, ignore earlier/superseded UI/UX V1 adjustment files unless the user explicitly promotes them, and do not mix App Shell, Home, Catalog, Categories, Detail, Form, Settings, Category Management, or V1 cleanup implementation in one batch.
- Catalog Toolbar V1 Planning is documented after Batch 26.4 in `docs/29-catalog-toolbar-v1-planning.md`. Catalog Toolbar implementation should stay scoped to Search, Filter, Sorting, and one View toggle; preserve existing search/category behavior where safe; use Last Updated with safe timestamp parsing; do not fake Quality, Rating, Year, Duration, Count, Status, Filmography, or Pictorials values; do not use Birth Date for Performer Year.
- Catalog Toolbar V1 Implementation is complete after Batch 26.5 if merged. The shared Catalog toolbar uses visible Search, one Filter button/panel, separate Sorting, and one View toggle; Categories remain backed by `categoriesJson`; Last Updated sorts by `updatedAt` with ISO and Tauri millisecond string parsing; planned filters are disabled and do not affect results.
- Categories Page V1 Cleanup is complete after Batch 26.6 if merged. Categories remains a browse-only page with Total/Videos/Images/Performers Category stats, a Manage Category link to `/settings/category-management`, and no Category Management CRUD, category storage change, thumbnail storage, schema change, or card-level Open actions.
- Detail Page V1 Layout Planning is documented after Batch 27.1 in `docs/30-detail-page-v1-layout-planning.md`. Detail implementation should keep hero/metadata cleanup separate from spider chart, Tech Info detection, related card work, and Image Gallery placement; do not show raw paths in normal metadata, do not fake Quality/Tech Info/rating values, and do not scan `folderPath` from Image Detail.
- Detail Hero + Metadata Cleanup is complete after Batch 27.2 if merged. Video/Image/Performer Detail heroes use cleaner title/original/code/favorite/status/category presentation, raw path fields are no longer shown in normal metadata, and existing media status/play, Image Gallery, performer thumbnail, related, edit, and delete behavior should remain preserved.
- Performer Detail Favorite should remain a chip with status chips, not a separate top-right action. Years Active remains visible; do not use Birth Date as Debut Year. Full `2015-present` and age-range calculation needs future Debut Date / Retired Date data support.
- Functional Spider Chart Rating Planning is documented after Batch 27.3 in `docs/31-functional-spider-chart-rating-planning.md`. Rating Summary V1 target is polygon spider chart only, not generic radial chart or star/chart hybrid; side count follows valid `ratingJson` dimension count, and Average / Final Score must be a shared helper for future Detail and Catalog reuse.
- Functional Spider Chart Rating Implementation is complete after Batch 27.4 if merged. Detail Rating Summary should remain spider-chart-only; do not restore star blocks or hybrid star/chart layouts. Shared rating helper behavior should be reused later for Catalog Rating sorting/filtering instead of duplicating score logic.
- Tech Info + Media Status Planning is documented after Batch 27.5 in `docs/32-tech-info-media-status-planning.md`. Tech Info must use data-backed values only; do not fake resolution/file size/file type/Quality, do not scan `folderPath` from Image Detail, and keep runtime metadata detection, persistence, and schema changes in separate approved batches.
- Tech Info + Media Status Implementation is complete after Batch 27.6 if merged. Video/Image Detail Tech Info should remain limited to existing safe values and honest unavailable states, Performer should not use media-style Tech Info, and Media Status should stay summarized under System Info without raw path values or new scanner/runtime metadata behavior.
- Related Cards on Detail Pages is complete after Batch 27.7 if merged. Related sections should stay display-only card/empty-state surfaces; do not add relation picker, add/remove controls, auto-linking, related JSON storage changes, schema changes, or raw ID/JSON/path exposure from Detail pages.
- Image Detail Gallery Placement Adjustment is complete after Batch 27.8 if merged. Image Detail Gallery should appear directly below Hero and before Metadata, Notes should remain before Related sections, System Info should remain last, and the Gallery should use 16-item initial/load-more batches while preserving the full-size viewer and saved `galleryImagePathsJson` paths only without scanning `folderPath`.

## Preferred Batch Prompt Format

Use this shape for future batch prompts:

```text
Current branch:
<branch-name>

Context:
- <stable checkpoint>
- <completed relevant work>
- <important docs to preserve>

Task:
<one narrow objective>

Required files or areas:
- <file or area>

Rules:
- Do not commit.
- Keep the diff controlled.
- Preserve locked terms.
- Follow category safety docs when category behavior is involved.

Verification:
- <commands to run or explain why not needed>

After finishing, report:
- files changed;
- verification run;
- behavior changed, if any;
- risks or follow-up.
```

## Human Review Requirements

Human review is required before:

- committing;
- tagging a checkpoint;
- opening or merging a PR;
- schema changes;
- data migration;
- backup/restore behavior changes;
- bulk record mutation behavior;
- changing category storage or semantics;
- adding new navigation surfaces such as a Categories sidebar page;
- changing roadmap order.

For category work, the reviewer should confirm:

- Managed Categories and Record Categories remain separate;
- `sakurava.managedCategories.v1` behavior is preserved;
- `categoriesJson` remains the MVP record category storage;
- mass record changes require preview and confirmation;
- record patches include only `categoriesJson` for category rename/remove.
