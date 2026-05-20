# Locked Roadmap

This roadmap is locked for future Sakurava batches unless the user explicitly changes it.

Use this file as compressed project memory for future planning. Do not expand it into a full historical workflow by default.

## Future Roadmap

1. Backup/Restore UX Safety Review
2. Settings Persistence Planning
3. Category Management Dedicated Page Planning
4. Category Management Dedicated Page Implementation
5. Form Category Picker Lockdown
6. Categories Sidebar Page Planning
7. Categories Sidebar Page Implementation
8. Related Performer Picker Structure
9. Related Video/Image Picker Structure
10. Media File Status / Open File
11. Image Preview Modal
12. Video Open/Preview Safety

## Deferred Items

These items are intentionally deferred and should not be introduced during normal roadmap batches:

- Home search/filter
- Continue Cataloging
- Appearance real logic
- Language real logic
- Welcome Slider real logic
- advanced DB-backed categories
- relational category table
- parent/child categories
- category analytics
- import/export category mapping
- advanced media player

## Documentation Alignment

Batch 17.3 is a documentation-only PRD alignment batch. It clarifies that `02-mvp-prd.md` remains the MVP baseline while this roadmap, project status, category safety, workflow, and handoff docs represent the current post-MVP standard.

## Roadmap Rules

- Follow the roadmap order unless the user explicitly reprioritizes.
- Keep one batch focused on one roadmap item.
- Planning batches should produce practical implementation boundaries, risks, and verification expectations.
- Implementation batches should avoid unrelated refactors.
- Category-related roadmap work must follow `docs/10-category-management-safety.md`.
- UI polish is not part of the default plan unless the user requests it or it blocks usability.
- Category Management may later move into a dedicated page, with Settings as the parent entry.
- The Categories sidebar page should be a browsing/catalog page, not the management page.
- Form Category Picker Lockdown means form category input should eventually be locked to Managed Categories only, not free-text creation.
- Form Category Picker Lockdown planning is documented in `docs/15-form-category-picker-lockdown-planning.md`.
- Categories Sidebar Page planning is documented in `docs/16-categories-sidebar-page-planning.md`.
- Related Performer Picker Structure planning is documented in `docs/17-related-performer-picker-structure-planning.md`.
- Related Performer Storage planning is documented in `docs/18-related-performer-storage-planning.md`.
- Related Video/Image Picker Structure planning is documented in `docs/19-related-video-image-picker-structure-planning.md`.
- Related Video/Image Storage planning is documented in `docs/20-related-video-image-storage-planning.md`.
- Media File Status / Open File planning is documented in `docs/21-media-file-status-open-file-planning.md`.
- External Media Open planning is documented in `docs/22-external-media-open-planning.md`.
- Cover/Thumbnail Full Size Preview planning is documented in `docs/23-cover-thumbnail-full-size-preview-planning.md`.
- Performer Mini Thumbnail Storage/Form planning is documented in `docs/24-performer-mini-thumbnail-storage-form-planning.md`.
- Image Gallery planning is documented in `docs/25-image-gallery-planning.md`.
- Image Gallery Storage/Form planning is documented in `docs/26-image-gallery-storage-form-planning.md`.
- Image Gallery Storage/Form implementation adds `galleryImagePathsJson` and structured Image form path rows.
- Gallery Folder Picker / Direct Image Read implements folder-based gallery input only; multi-image file picker remains intentionally unimplemented unless explicitly requested later.
- Image Detail Gallery Grid renders from saved `galleryImagePathsJson` paths. Batch 27.8 places Gallery directly below Image Hero and uses 16-item initial/load-more batches to approximate two visible desktop rows.
- Gallery Full-size Viewer opens from Image Detail gallery tiles and uses only saved `galleryImagePathsJson` paths, with overlay Previous/Next, counter, close, zoom, and browser fullscreen with in-app fallback.
- Image Gallery QA and Safety Review is documented in `docs/27-image-gallery-qa-safety-review.md`; after clean QA, Image Gallery can be treated as post-MVP initial complete.
- UI/UX V1 Audit and Prioritization Plan is documented in `docs/28-ui-ux-v1-audit-prioritization-plan.md`; it is the active planning source for UI/UX V1 alignment after Image Gallery initial completion.
- Catalog Toolbar V1 Planning is documented in `docs/29-catalog-toolbar-v1-planning.md`; implementation should keep the toolbar scoped to Search, Filter, Sorting, and one View toggle, with data-dependent filters disabled/planned until reliable fields/helpers exist.
- Catalog Toolbar V1 Implementation is complete through Batch 26.5 after merge; Videos, Images, and Performers use Search, Filter, Sorting, and one View toggle while data-dependent filters remain planned/disabled.
- Categories Page V1 Cleanup is complete through Batch 26.6 after merge; Categories remains browse-only and Category Management CRUD remains on the dedicated management page.
- Detail Page V1 Layout Planning is documented in `docs/30-detail-page-v1-layout-planning.md`; implementation should keep Detail cleanup scoped to hero order, metadata cleanup, System Info, related cards, and Image Gallery placement while keeping spider chart and Tech Info detection in separate batches.
- Detail Hero + Metadata Cleanup is complete through Batch 27.2 after merge; Detail heroes are cleaner, raw path fields are removed from normal metadata, and media/gallery/thumbnail behavior remains unchanged.
- Functional Spider Chart Rating Planning is documented in `docs/31-functional-spider-chart-rating-planning.md`; Rating Summary V1 should become polygon spider chart only, with shared Average / Final Score helpers for future Detail and Catalog reuse.
- Functional Spider Chart Rating Implementation is complete through Batch 27.4 after merge; Detail Rating Summary uses polygon spider chart only, with shared average/final score and rating bucket helpers ready for future Catalog reuse.
- Tech Info + Media Status Planning is documented in `docs/32-tech-info-media-status-planning.md`; Tech Info should use data-backed values only, Media Status should consolidate into System Info where safe, and runtime metadata detection/storage/schema work remains deferred unless explicitly approved.
- Tech Info + Media Status Implementation is complete through Batch 27.6 after merge; Detail Tech Info uses existing safe data only, Media Status is summarized under System Info, and no runtime metadata detection, folder scan, or schema change is added.
- Related Cards on Detail Pages is complete through Batch 27.7 after merge; Detail related sections use compact cards or honest empty states, preserve related JSON storage, and do not add relation picker/add/remove behavior.
- Image Detail Gallery Placement Adjustment is complete through Batch 27.8 after merge; Image Detail Gallery appears below Hero and before Metadata, Notes remains before Related sections, System Info remains last, and Video Detail and Performer Detail section order remain unchanged.
- Form Field UX V1 Planning is documented in `docs/33-form-field-ux-v1-planning.md`; implementation should keep forms cleaner and closer to Detail Page V1 while preserving current save behavior, SQLite persistence, `categoriesJson`, related JSON storage, `galleryImagePathsJson`, `ratingJson`, and no-file-mutation rules.
- Category Picker Field Redesign is complete through Batch 28.2 after merge; forms use searchable Managed Categories picker options, selected chips, duplicate prevention, record-only chip preservation, no-match Manage Category guidance, and `categoriesJson` serialization without changing Managed Category storage or Category Management CRUD.
- Related Picker Field Redesign is complete through Batch 28.3 after merge; related form fields follow the Category Picker structure with selected chips, search input, scrollable available rows, and bottom inline guidance links. Video/Image forms preserve current related JSON serialization. Performer forms show related Video/Image picker UI only without storage or back-link mutation because Performer records have no related JSON fields.
- Video/Image Form Media + Tech Info Cleanup is complete through Batch 28.4 after merge; Video forms split Metadata, Cover, Media Video, Tech Info, Categories, Rating, Related, and Notes, while Image forms split Metadata, Cover, Gallery Images, Tech Info, Categories, Rating, Related, and Notes. Duration and Image Count live in Tech Info, Gallery Images uses `Add Images` with a scrollable explicit path list, Gallery Folder is no longer shown as a main form field, and no schema/runtime/file metadata detection behavior is added.
- Form Page Scroll + Duplicate Related Regression Fix is complete through Batch 28.4.1 after merge; AppShell remains the single page scroll owner for Form pages, the document/body no longer creates a second vertical scroll, and Performer forms show only the functional Related Videos / Related Images picker sections without the old placeholder duplicates.
- Performer Form Data Completion is complete through Batch 28.5 after merge; Performer forms use ordered Basic Identity, Profile / Thumbnail Fields, Status / Activity, Aliases, Summary, Personal, Physical, Categories, Rating, Related, and Notes sections. Thumbnail labels are cleaned up, Status remains the existing saved field, Astrological Sign is display-derived from Birth Date only, unsupported personal/physical fields stay read-only, and no new schema/storage/runtime behavior is added.
- Settings Page V1 Information Architecture is documented in `docs/34-settings-page-v1-information-architecture.md`; Settings V1 should group App Information, Data & Safety, Categories, Appearance, Media & Files, and Advanced / Maintenance while keeping planned/deferred features honest and disabled/omitted until their own batches.
- Settings Page V1 Menu Cleanup is complete through Batch 29.2 after merge; Settings uses the IA groups App Information, Data & Safety, Categories, Appearance, Media & Files, and Advanced / Maintenance, keeps existing safe Backup/Restore and media-root controls, links to the dedicated Category Management page, and keeps deferred features disabled/planned without new persistence, schema, runtime, package, scanner, or file-mutation behavior.
- Category Management V1 Planning is documented in `docs/35-category-management-v1-audit-and-planning.md`; it audits the existing dedicated page and plans the approved WordPress-inspired Sakurava structure: Header, Add / Edit Category Form, Inline Toolbar, full-width Category Table with pagination footer, separate Bulk Edit section, minimal Safety Notes, parent/child categories, category thumbnails, record-only removal, 30.2 data model handoff, and batch fit without changing the roadmap automatically.
- Category Management Data Model Safety Plan is documented in `docs/36-category-management-data-model-safety-plan.md`; it recommends SQLite-managed category metadata with stable internal keys while preserving record-level `categoriesJson` labels, exact filtering by default, CSV-first bulk edit planning, conditional XLSX support, minimal thumbnail path storage, and no normal Record-only UI.
- Category Management CRUD Implementation is complete through Batch 30.3 after merge; Category Management uses SQLite-managed category metadata for `key`, `name`, `parentKey`, `description`, `thumbnailPath`, `createdAt`, and `updatedAt`, limits hierarchy to No Parent plus one child level, supports thumbnail path entry with a narrow image picker, migrates legacy localStorage managed category labels without deleting the legacy cache, keeps records on `categoriesJson` labels, blocks unsafe delete when children or record usage exist, and drops normal unmanaged-label rows/statuses, Modify Records, and separate Category Detail UI from the management surface.
- Category Management Table + Detail + Pagination is complete through Batch 30.4 after merge; the management surface uses full-width table columns, table/form detail presentation, composed search/filter/sort, and a pagination footer with 25/50/100 row options.
- V1 Smoke Test Gap Audit and Efficient Roadmap is documented in `docs/37-v1-smoke-test-gap-audit-efficient-roadmap.md`; Batch 31.1 is docs-only, supersedes the premature release-cleanup path, and locks 32.1 as the next implementation batch.
- Media Tech Info + Availability Safety Plan is documented in `docs/38-media-tech-info-availability-safety-plan.md`; Batch 33.1 is docs-only and defines read-only metadata detection, availability semantics, runtime/storage boundaries, and 33.2 implementation guidance.
- Video/Picture Form + Detail Tech Info Implementation is complete through Batch 33.2 after merge; Video/Image forms support explicit Detect plus save-time read-only metadata checks, persisted safe metadata fields, availability derivation from explicit paths, and detail/catalog display from saved values without broad scanning or file mutation.
- Video Duration/Resolution Detector Implementation is complete through Batch 33.2.1 after merge; Video duration and resolution detection uses read-only Windows Shell media properties for one explicit file path and keeps safe fallback behavior when properties are unavailable.
- Performer Form + Detail Data Completion is complete through Batch 33.3 after merge; Performer forms and detail now use saved performer dates, personal fields, physical fields, derived Status, derived Filmography/Pictorial counts from performer-owned related Video/Image selections, and neutral fallbacks while preserving categoriesJson, ratingJson, mini thumbnails, existing related picker behavior, and no Video/Image Tech Info changes.
- Performer Related Detail Sections Implementation is complete through Batch 33.4 after merge; Performer Detail now displays performer-owned Related Videos and Related Images as mini collections with card/table views, sorting, pagination, safe unresolved fallbacks, neutral empty states, and no back-link writes or Video/Image mutation.
- Settings Functional Redesign + Data Operations Planning is documented in `docs/39-settings-functional-redesign-data-operations-plan.md`; Batch 34.1 is docs-only and locks the approved roadmap swap where 34.x is Settings + Data Operations and 35.x is Category Visibility + Thumbnail Cache / Low-res.
- Related Performer Picker Structure, Related Video/Image Picker Structure, and Media File Status / Open File should wait until category page decisions are settled.

## Current Locked V1 Roadmap

The older 31.1-31.4 release-cleanup path is superseded because smoke-test gaps remain. Use `docs/37-v1-smoke-test-gap-audit-efficient-roadmap.md` as the active continuation after Batch 30.4, amended by `docs/39-settings-functional-redesign-data-operations-plan.md` for the approved 34/35 roadmap swap.

Recommended sequence:

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

Current batch:

```text
34.8 - Import CSV Apply + Report
```

Next implementation batch after 34.8:

```text
34.9 - Settings Full Smoke Test + Cleanup
```

Batch 31.1 is documentation-only and complete. Batch 33.1 is documentation-only and complete. Batch 33.2 implements Video/Image Tech Info and availability only. Batch 33.2.1 adds Windows Shell property-based Video duration/resolution detection only. Batch 33.3 completes Performer form/detail data fields only. Batch 33.4 implements Performer related detail sections only. Batch 34.1 is documentation-only and locks Settings/Data Operations before Category Visibility/Thumbnail Cache. Batch 34.2 implements Settings layout only. Batch 34.3 implements Backup/Restore + scoped Clear Cache only. Batch 34.4 is Import/Export Bulk Data planning only. Batch 34.5 implements Appearance + Dark Mode only. Batch 34.6 implements read-only Bulk Manual Edit CSV Export only with `Action`, `Sakurava Ref`, and no raw internal IDs/update keys/JSON column names. Batch 34.7 implements Import CSV Preview + Validation only. Batch 34.8 implements Import CSV Apply + Report only: apply from preview after confirmation, patch mapped CSV fields, skip blocked/error rows, report row outcomes, keep missing rows as not delete, and delete only via `Action = Delete` without touching media files. Batch 34.9 remains Settings Full Smoke Test + Cleanup, and XLSX remains optional later only if it can share the same validation pipeline. Do not revert to the old 34/35 order.
