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
- Related Performer Picker Structure, Related Video/Image Picker Structure, and Media File Status / Open File should wait until category page decisions are settled.
