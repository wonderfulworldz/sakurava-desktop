# Agent Code Handoff

Use this document when continuing Sakurava with VSCode Agent Code or Codex.

Use these docs as compressed project memory. Do not reconstruct the full historical workflow unless the user explicitly asks for it.

## First Prompt For Agent Code

```text
You are working on the Sakurava desktop app.

Read AGENTS.md first, then docs/PROJECT_STATUS.md, docs/ROADMAP_LOCKED.md, docs/37-v1-smoke-test-gap-audit-efficient-roadmap.md, docs/38-media-tech-info-availability-safety-plan.md, docs/39-settings-functional-redesign-data-operations-plan.md, docs/AGENT_CODE_HANDOFF.md, docs/11-prd-alignment-and-development-plan.md, docs/10-category-management-safety.md, docs/12-backup-restore-ux-safety.md, docs/13-settings-persistence-planning.md, docs/14-category-management-dedicated-page-planning.md, docs/15-form-category-picker-lockdown-planning.md, docs/16-categories-sidebar-page-planning.md, docs/17-related-performer-picker-structure-planning.md, docs/18-related-performer-storage-planning.md, docs/19-related-video-image-picker-structure-planning.md, docs/20-related-video-image-storage-planning.md, docs/21-media-file-status-open-file-planning.md, docs/22-external-media-open-planning.md, docs/23-cover-thumbnail-full-size-preview-planning.md, docs/24-performer-mini-thumbnail-storage-form-planning.md, docs/25-image-gallery-planning.md, docs/26-image-gallery-storage-form-planning.md, docs/27-image-gallery-qa-safety-review.md, docs/28-ui-ux-v1-audit-prioritization-plan.md, docs/29-catalog-toolbar-v1-planning.md, docs/30-detail-page-v1-layout-planning.md, docs/31-functional-spider-chart-rating-planning.md, docs/32-tech-info-media-status-planning.md, docs/33-form-field-ux-v1-planning.md, docs/35-category-management-v1-audit-and-planning.md, docs/36-category-management-data-model-safety-plan.md, and docs/WORKFLOW_GIT.md.

Follow the locked terminology, no auto-commit rule, category safety rules, Backup/Restore safety rules, Settings persistence planning rules, Category Management dedicated page planning rules, Form Category Picker Lockdown planning rules, Categories Sidebar Page planning rules, Related Performer Picker Structure planning rules, Related Performer Storage planning rules, Related Video/Image Picker Structure planning rules, Related Video/Image Storage planning rules, Media File Status / Open File planning rules, External Media Open planning rules, Performer Mini Thumbnail Storage/Form planning rules, Image Gallery planning rules, and Image Gallery Storage/Form planning rules. Keep the batch scoped. Do not change application code, tests, schema, backend/Rust/Tauri, UI, or category behavior unless this specific batch asks for it.

Category Management implementation is complete through Batch 16.3. Category Management safety documentation is complete through Batch 17.1 if already merged. For Category Management dedicated page work, read docs/14-category-management-dedicated-page-planning.md before planning or implementation. For Form Category Picker Lockdown work, read docs/15-form-category-picker-lockdown-planning.md before implementation. For Categories Sidebar Page work, read docs/16-categories-sidebar-page-planning.md before implementation. For Related Performer Picker Structure work, read docs/17-related-performer-picker-structure-planning.md before implementation. For Related Performer Storage work, read docs/18-related-performer-storage-planning.md before implementation. For Related Video/Image Picker Structure work, read docs/19-related-video-image-picker-structure-planning.md before implementation. For Related Video/Image Storage work, read docs/20-related-video-image-storage-planning.md before implementation. For Media File Status / Open File work, read docs/21-media-file-status-open-file-planning.md before implementation. For External Media Open work, read docs/22-external-media-open-planning.md before implementation. For Cover/Thumbnail Full Size Preview work, read docs/23-cover-thumbnail-full-size-preview-planning.md before implementation. For Performer Mini Thumbnail Storage/Form work, read docs/24-performer-mini-thumbnail-storage-form-planning.md before implementation. For Image Gallery work, read docs/25-image-gallery-planning.md before planning or implementation. For Image Gallery Storage/Form work, read docs/26-image-gallery-storage-form-planning.md before implementation. For Backup/Restore work, read docs/12-backup-restore-ux-safety.md before planning or implementation. For Settings persistence work, read docs/13-settings-persistence-planning.md before planning or implementation. UI polish is not a default roadmap item.

Before editing, check git status. After editing, report files changed, verification run, risks, and follow-up. Do not commit without user approval.
```

## Files To Read First

Read these before planning or editing:

- `AGENTS.md`
- `docs/PROJECT_STATUS.md`
- `docs/ROADMAP_LOCKED.md`
- `docs/37-v1-smoke-test-gap-audit-efficient-roadmap.md`
- `docs/38-media-tech-info-availability-safety-plan.md`
- `docs/39-settings-functional-redesign-data-operations-plan.md`
- `docs/AGENT_CODE_HANDOFF.md`
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
- `docs/33-form-field-ux-v1-planning.md`
- `docs/35-category-management-v1-audit-and-planning.md`
- `docs/36-category-management-data-model-safety-plan.md`
- `docs/WORKFLOW_GIT.md`
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
- Form Field UX V1 Planning is documented after Batch 28.1 in `docs/33-form-field-ux-v1-planning.md`. Form implementation should make Video/Image/Performer Create/Edit forms cleaner and closer to Detail Page V1 while preserving current save behavior, SQLite persistence, `categoriesJson`, related JSON storage, `galleryImagePathsJson`, `ratingJson`, and explicit file picker/no-file-mutation rules. Category picker work belongs in 28.2, Related picker work belongs in 28.3, Video/Image form cleanup belongs in 28.4, Performer form data completion belongs in 28.5, validation/save safety review belongs in 28.6, and smoke testing belongs in 28.7.
- Category Picker Field Redesign is complete after Batch 28.2 if merged. Video/Image/Performer Create/Edit forms should use searchable Managed Categories picker options, selected category chips, duplicate prevention, record-only preservation for existing labels not in Managed Categories, no-match Manage Category guidance, and a Manage Category link to `/settings/category-management`. Form saves must continue writing selected labels to `categoriesJson`; do not add inline category creation, `categoryIds`, category tables, Category Management CRUD changes, or Managed Category mutation from forms.
- Related Picker Field Redesign is complete after Batch 28.3 if merged. Related form fields should follow the Category Picker structure: selected chips, search input, scrollable selectable rows, and bottom inline guidance links. Available rows use compact performer alias display or Code - Title catalog display, selected chips stay short/removable, and Video/Image Create/Edit forms preserve current related JSON serialization. Performer Create/Edit related picker UI must not persist selections or mutate Video/Image records backward unless a later storage/back-link batch explicitly approves it.
- Video/Image Form Media + Tech Info Cleanup is complete after Batch 28.4 if merged. Video Create/Edit forms should keep Cover and Media Video as separate sections, with Duration under Tech Info and honest unavailable Resolution/File Size/File Type placeholders. Image Create/Edit forms should keep Cover and Gallery Images as separate sections, hide Gallery Folder from the main form UI, use `Add Images` for explicit gallery path rows, keep the gallery path list scrollable, and place Image Count under Tech Info. Preserve Category Picker, Related Picker, `galleryImagePathsJson`, related JSON, `categoriesJson`, `ratingJson`, and no-file-mutation rules.
- Form Page Scroll + Duplicate Related Regression Fix is complete after Batch 28.4.1 if merged. Form pages should rely on AppShell `main` as the single vertical scroll owner, with the document/body locked to the viewport to prevent a second scroll bar or blank scroll area. Performer Create/Edit should show only the functional Related Videos and Related Images picker sections; do not restore the old `Available after relation features are added` placeholders.
- Performer Form Data Completion is complete after Batch 28.5 if merged. Performer Create/Edit should keep the completed section order, cleaned Thumbnail labels, saved Status field, read-only saved Summary counts, Birth Date-only Astrological Sign derivation, read-only unsupported personal/physical fields, Category Picker, Rating, Related pickers, and Notes. Do not add Debut Date / Retired Date persistence, personal/physical storage, relation tables, back-link mutation, or any schema/runtime/package changes without a later approved batch.
- Settings Page V1 Information Architecture is documented after Batch 29.1 in `docs/34-settings-page-v1-information-architecture.md`. Batch 29.2 should implement only Settings menu/layout cleanup from that IA: App Information, Data & Safety, Categories, Appearance, Media & Files, and Advanced / Maintenance groups with honest planned/deferred states. Do not implement Settings persistence, Backup/Restore, Import/Export, theme/language switching, Category Management CRUD, file scan/watch/mutation, schema/runtime/package changes, or fake controls from Settings V1 work.
- Settings Page V1 Menu Cleanup is complete after Batch 29.2 if merged. Settings should stay grouped by App Information, Data & Safety, Categories, Appearance, Media & Files, and Advanced / Maintenance; keep existing safe Backup/Restore and media-root controls; use a dedicated Category Management link instead of embedded CRUD; keep deferred tools disabled/planned; and do not add settings persistence, schema/runtime/package changes, scanners, watchers, or file mutation. Next roadmap batch is 30.1 - Category Management V1 Planning.
- Category Management V1 Planning is documented after Batch 30.1 in `docs/35-category-management-v1-audit-and-planning.md`. The approved V1 direction is WordPress-inspired but adapted to Sakurava: Header, Add / Edit Category Form, Inline Toolbar, full-width Category Table with pagination footer, separate Bulk Edit section, and minimal Safety Notes. Category Detail and Modify Records should not remain major separate V1 sections, Record-only should disappear from normal UI, and 30.2 must define parent/child storage, thumbnail path storage, description storage, unmanaged category normalization, and CSV/XLSX validation safety before implementation.
- Category Management Data Model Safety Plan is documented after Batch 30.2 in `docs/36-category-management-data-model-safety-plan.md`. It recommends SQLite-managed category metadata with stable internal keys while preserving record-level `categoriesJson` labels, globally unique names in V1, exact category filtering by default, path/reference-only thumbnails, plain-text descriptions, CSV-first bulk edit, conditional XLSX support, and no normal Record-only UI. Schema/database/package changes, broad existing-record normalization, and any future `categoryIds` migration need explicit user confirmation before implementation.
- Category Management CRUD Implementation is complete after Batch 30.3 if merged. Category Management now has SQLite-backed managed category metadata, a combined Add/Edit form for Name, Thumbnail, Parent, and Description, one-level No Parent plus child hierarchy enforcement, thumbnail path entry with a narrow image picker, safe unused delete checks, and idempotent localStorage label migration/cache compatibility. Legacy unmanaged record labels are not shown as normal category statuses or rows. The management page has no Modify Records section and no separate Category Detail section. Records still store category labels in `categoriesJson`; do not migrate records to IDs.
- Category Management Table + Detail + Pagination is complete after Batch 30.4 if merged. Category Management should keep the full-width table with Name, Parent, Description, Videos, Images, Performers, Usage, and Edit columns; detail stays in the table and Add/Edit form; search/filter/sort feed the pagination footer with 25/50/100 row options.
- V1 Smoke Test Gap Audit and Efficient Roadmap Lock is documented after Batch 31.1 in `docs/37-v1-smoke-test-gap-audit-efficient-roadmap.md` if merged. Batch 31.1 is docs-only and must not change source files. The old premature release-cleanup path is superseded because smoke-test gaps remain. The next implementation batch is 32.1 - Catalog Filter/Sort V1 Implementation. Do not start 32.1 inside 31.1.
- Media Tech Info + Availability Safety Plan is documented after Batch 33.1 in `docs/38-media-tech-info-availability-safety-plan.md` if merged. Batch 33.1 is docs-only and must not change source files, Tauri/Rust files, schema, package files, runtime behavior, or UI. The next implementation batch is 33.2 - Video/Picture Form + Detail Tech Info Implementation. Do not start 33.2 inside 33.1.
- Video/Picture Form + Detail Tech Info Implementation is complete after Batch 33.2 if merged. Video/Image forms use explicit Detect plus save-time read-only metadata checks, persist safe metadata values, and derive availability from explicit media/gallery paths. Do not expand this into Performer form completion, category visibility, thumbnail cache, media player, broad scanning, or file mutation work. The next implementation batch is 33.3 - Performer Form + Detail Data Completion.
- Performer Form + Detail Data Completion is complete after Batch 33.3 if merged. Performer Create/Edit persists debut/retired dates, birthplace, nationality, blood type, height, weight, structured Bust/Waist/Hip measurements, cup size, and performer-owned related Video/Image selections; Status is derived from debut/retired dates, Filmography/Pictorial counts are derived from performer-owned related selections, and Performer Detail displays those derived/saved values with neutral fallbacks. Do not expand this into Performer related detail sections, back-link saves, relation tables, category visibility, thumbnail cache, Video/Image Tech Info, or file mutation work. The next implementation batch is 33.4 - Performer Related Detail Sections Implementation.
- Performer Related Detail Sections Implementation is complete after Batch 33.4 if merged. Performer Detail displays performer-owned Related Videos and Related Images as safe mini collections with card/table views, sorting, pagination, per-page controls, unresolved fallbacks, and no Video/Image mutation or back-link saves. The user approved swapping the old 34/35 order: Batch 34 is now Settings + Data Operations, and Batch 35 is now Category Visibility + Thumbnail Cache / Low-res. Do not revert to the old order.
- Settings Functional Redesign + Data Operations Planning is documented in `docs/39-settings-functional-redesign-data-operations-plan.md` if merged. Batch 34.1 is docs-only and must not change source files, Tauri/Rust files, schema, package files, runtime behavior, or UI. The next implementation batch is 34.2 - Settings Layout Redesign Implementation. Do not start 34.2 inside 34.1.
- Settings Layout Redesign Implementation is complete after Batch 34.2 if merged. Settings should present the approved five-section control center: Appearance, Language, Optimization, Data Safety & Migration, and App Information. Existing Backup/Restore and media root behavior must remain unchanged, and future operations remain disabled/planned until their dedicated batches. The next implementation batch is 34.3 - Backup/Restore + Clear Cache Implementation.
- Backup/Restore + Clear Cache Implementation is complete after Batch 34.3 if merged. Backup/Restore remains database-level app data safety with validation, restore confirmation, and restore safety backup behavior. Clear Cache is scoped to app-generated cache folders under Sakurava app data only and must not delete source media, SQLite records, categories, ratings, related links, settings, or catalog data. Import/Export remains planned for 34.4.
- Import/Export Bulk Data Planning is documented in `docs/40-import-export-bulk-data-plan.md` if merged. Batch 34.4 is docs-only and plans CSV-first data exchange for Videos, Images, Performers, and Categories with preview, validation, confirmation, and error reporting. Import/Export is not Backup/Restore and must not include original media files or app-generated cache files. The next official batch is 34.5 - Appearance + Dark Mode Implementation.
- Appearance + Dark Mode Implementation is complete after Batch 34.5 if merged. Theme selection is a frontend/local preference only, defaults safely to Light, persists with `sakurava.appearance.theme.v1`, and applies Light/Dark styling across the app shell and main pages without database/schema/runtime changes.
- Export CSV Implementation is complete after Batch 34.6 if merged. Settings > Data Safety & Migration exports Videos, Images, Performers, and Categories as separate locked Bulk Manual Edit CSV files. Each file starts with `Action` and `Sakurava Ref`, uses user-facing editable headers in locked order, safe escaping, text-only path fields, readable categories/ratings/related values/path lists, no raw internal IDs/update keys/JSON column names, and no database mutation or media file copy. Missing CSV rows are not delete; future delete requires `Action = Delete`. Import CSV Preview must reuse the same header mapping layer in 34.7; Categories and Related are preview-diff fields and ambiguous matching remains preview/validation work. Import CSV Apply + Report remains 34.8, and XLSX remains optional later only if it shares the same validation pipeline.
- Import CSV Preview + Validation is complete after Batch 34.7 if merged. Settings > Data Safety & Migration reads selected CSV files for preview only, detects Videos/Images/Performers/Categories from locked Bulk Manual Edit headers, validates `Action`, `Sakurava Ref`, required fields, old technical/raw JSON headers, categories, related refs, and editable field formats, then shows Added/Modified/Unchanged/Deleted/Skipped counts and row-level warnings/errors with Apply disabled for 34.8. Data Safety & Migration uses progressive disclosure: default state shows only the four action cards, Export CSV choices appear after Export Data, and Import Preview appears after Import Data selects/parses a CSV. Missing CSV rows are not delete; delete is previewed only via `Action = Delete`. No database records, managed categories, related records, Backup/Restore, Clear Cache, Dark Mode, source media, or media files are mutated.

## Current Efficient Roadmap

Follow this sequence unless the user explicitly changes it:

1. 31.1 - Smoke Test Gap Audit + Efficient Roadmap Lock
2. 32.1 - Catalog Filter/Sort V1 Implementation
3. 32.2 - Categories Catalog/Collection V1 Implementation
4. 33.1 - Media Tech Info + Availability Safety Plan
5. 33.2 - Video/Picture Form + Detail Tech Info Implementation
6. 33.2.1 - Video Duration/Resolution Detector Implementation
7. 33.3 - Performer Form + Detail Data Completion
8. 33.4 - Performer Related Detail Sections Implementation
9. 34.1 - Settings Functional Redesign + Data Operations Planning
10. 34.2 - Settings Layout Redesign Implementation
11. 34.3 - Backup/Restore + Clear Cache Implementation
12. 34.4 - Import/Export Bulk Data Planning
13. 34.5 - Appearance + Dark Mode Implementation
14. 34.6 - Export CSV Implementation
15. 34.7 - Import CSV Preview + Validation
16. 34.8 - Import CSV Apply + Report
17. 34.9 - Settings Full Smoke Test + Cleanup
18. 35.1 - Category Visibility + Thumbnail Cache/Low-res Strategy Planning
19. 35.2 - Category Visibility Implementation
20. 35.3 - Thumbnail Cache / Low-res Regeneration Implementation
21. 36.1 - Placeholder / MVP Text / Dummy Data Audit + Cleanup Plan
22. 36.2 - Placeholder / MVP Text / Dummy Data Cleanup
23. 36.3 - Full Smoke Test + Release Candidate

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
