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
- Related Performer Picker Structure, Related Video/Image Picker Structure, and Media File Status / Open File should wait until category page decisions are settled.

## UI/UX V1 Alignment Sequence

Use `docs/28-ui-ux-v1-audit-prioritization-plan.md` for the active UI/UX V1 draft roadmap. Earlier or superseded UI/UX V1 adjustment files should be ignored unless the user explicitly promotes them again.

Recommended sequence:

1. 26.1 - UI/UX V1 Audit & Prioritization Plan
2. 26.2 - App Shell V1 Cleanup
3. 26.3 - Home Page V1 Cleanup
4. 26.4 - Catalog Toolbar V1 Planning
5. 26.5 - Catalog Toolbar V1 Implementation
6. 26.6 - Categories Page V1 Cleanup
7. 27.1 through 27.8 as defined in `docs/28-ui-ux-v1-audit-prioritization-plan.md`.
8. 28.1 - Form Field UX V1 Planning
9. 28.2 - Category Picker Field Redesign
10. 28.3 - Related Picker Field Redesign
11. 28.4 - Video/Image Form Layout Cleanup
12. 28.5 - Performer Form Data Completion
13. 28.6 - Form Validation and Save Safety Review
14. 28.7 - Form UX Smoke Test
15. Continue 29.1 through 31.5 as defined in `docs/28-ui-ux-v1-audit-prioritization-plan.md`.

Keep UI/UX V1 batches scoped. Do not mix App Shell, Home, Catalog, Categories, Detail, Form, Settings, Category Management, or V1 cleanup implementation in one batch.
