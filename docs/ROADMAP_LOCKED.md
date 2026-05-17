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
- Image Detail Gallery Grid renders from saved `galleryImagePathsJson` paths with 24 item batches.
- Gallery Full-size Viewer opens from Image Detail gallery tiles and uses only saved `galleryImagePathsJson` paths, with overlay Previous/Next, counter, close, zoom, and browser fullscreen with in-app fallback.
- Image Gallery QA and Safety Review is documented in `docs/27-image-gallery-qa-safety-review.md`; after clean QA, Image Gallery can be treated as post-MVP initial complete.
- UI/UX V1 Audit and Prioritization Plan is documented in `docs/28-ui-ux-v1-audit-prioritization-plan.md`; it is the active planning source for UI/UX V1 alignment after Image Gallery initial completion.
- Catalog Toolbar V1 Planning is documented in `docs/29-catalog-toolbar-v1-planning.md`; implementation should keep the toolbar scoped to Search, Filter, Sorting, and one View toggle, with data-dependent filters disabled/planned until reliable fields/helpers exist.
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
7. 27.1 through 31.5 as defined in `docs/28-ui-ux-v1-audit-prioritization-plan.md`.

Keep UI/UX V1 batches scoped. Do not mix App Shell, Home, Catalog, Categories, Detail, Form, Settings, Category Management, or V1 cleanup implementation in one batch.
