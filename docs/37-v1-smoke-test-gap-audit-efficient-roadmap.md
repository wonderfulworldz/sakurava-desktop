# V1 Smoke Test Gap Audit and Efficient Roadmap

## Current Checkpoint

- Batch 30.4 - Category Management Table + Detail + Pagination is complete.
- Tag exists: `post-mvp-30-4-category-management-table-detail-pagination-v1`.
- Current batch: 31.1 - Smoke Test Gap Audit + Efficient Roadmap Lock.
- Batch 31.1 is docs-only.

## Purpose

This document locks the smoke-test gap audit and the approved efficient V1 roadmap so future Sakurava chats, agents, and Codex sessions keep the same context.

The app is not ready for release cleanup yet. Catalog filters, detail pages, form pages, Categories Catalog, Category Management visibility/cache, Settings, data operations, appearance, language, and placeholder cleanup still have known gaps.

## Approved Roadmap Replacement

This roadmap replaces the older premature 31.1-31.4 release-cleanup path. The replacement is approved by the user.

```text
31.1 - Smoke Test Gap Audit + Efficient Roadmap Lock

32.1 - Catalog Filter/Sort V1 Implementation
32.2 - Categories Catalog/Collection V1 Implementation

33.1 - Media Tech Info + Availability Safety Plan
33.2 - Video/Picture Form + Detail Tech Info Implementation
33.3 - Performer Form + Detail Data Completion
33.4 - Performer Related Detail Sections Implementation

34.1 - Category Visibility + Thumbnail Cache Safety Plan
34.2 - Category Visibility Implementation
34.3 - Thumbnail Cache / Low-res Regeneration Implementation

35.1 - Settings Functional Redesign + Data Operations Planning
35.2 - Settings Layout Redesign Implementation
35.3 - Backup/Restore + Clear Cache Implementation
35.4 - Import/Export Bulk Data Planning
35.5 - Appearance + Dark Mode Implementation
35.6 - Language System Planning
35.7 - Language Picker/Editor Implementation

36.1 - Placeholder / MVP Text / Dummy Data Audit + Cleanup Plan
36.2 - Placeholder / MVP Text / Dummy Data Cleanup
36.3 - Full Smoke Test + Release Candidate
```

## Why Release Cleanup Is Too Early

The prior release-cleanup direction assumed the remaining work was mostly polish and final validation. Smoke testing showed that several user-facing V1 areas still need functional implementation or safety planning before release-candidate cleanup.

Release cleanup should happen after:

- catalog filters and sorting work from real fields or safe helpers;
- detail and form tech-info behavior has a safety plan and implementation;
- Performer missing data sections are completed;
- Categories Catalog is usable as a collection page;
- Category Management visibility and thumbnail cache behavior are planned and implemented safely;
- Settings separates functional controls from system information;
- data operations, appearance, and language have their own safe batches;
- placeholder, MVP, and dummy text cleanup has been audited.

## Efficient Batching Principle

Prefer combining items only when it reduces overhead and does not increase bug risk.

Combine items that:

- are in the same page or area;
- use the same data;
- have similar testing or smoke flow;
- do not require schema, runtime, or package changes.

Separate items that:

- touch filesystem, media metadata, or cache;
- touch schema, database, runtime, or package changes;
- affect global UI theme or language;
- affect Backup/Restore or Import/Export;
- could break many pages at once.

## Smoke-Test Gap List

### Catalog Filter Bar Gaps

Video Catalog:

- Quality filter: SD, HD, FHD, 2K, 4K, 8K, etc.
- Rating filter: 1 star, 2 star, 3 star, 4 star, 5 star.
- Year filter: older, 2000, 2005, 2010, 2015, 2020, 2025, 2030, 2035, 2040, 2045, 2050.
- Duration filter: Short = under 15 min, Medium = under 60 min, Long = 60 min+.
- Sorting: add relevant video sort options, including Last Added.
- Remove stale text: "Data-dependent filters are unavailable until reliable fields or helpers exist."

Picture Catalog:

- Quality filter: SD, HD, FHD, 2K, 4K, 8K, etc.
- Rating filter: 1 star, 2 star, 3 star, 4 star, 5 star.
- Year filter: older, 2000, 2005, 2010, 2015, 2020, 2025, 2030, 2035, 2040, 2045, 2050.
- Image count / gallery size filter: Few = under 15, Some = under 50, Many = 100+.
- Sorting: add relevant image sort options, including Last Added.
- Avoid calling image count "Duration"; use "Image Count" or "Gallery Size".
- Remove stale text: "Data-dependent filters are unavailable until reliable fields or helpers exist."

Performer Catalog:

- Status filter: Active, Retired, Unknown.
- Rating filter: 1 star, 2 star, 3 star, 4 star, 5 star.
- Debut Year filter: older, 2000, 2005, 2010, 2015, 2020, 2025, 2030, 2035, 2040, 2045, 2050.
- Filmography filter: Few = under 15, Some = under 50, Many = 100+.
- Pictorial filter: Few = under 15, Some = under 50, Many = 100+.
- Sorting: add relevant performer sort options, including Last Added.
- Remove stale text: "Data-dependent filters are unavailable until reliable fields or helpers exist."

### Detail Page Gaps

Video Detail:

- Tech Info is not functioning as auto-detected data yet.

Image Detail:

- Tech Info is not functioning as auto-detected data yet.

Performer Detail:

- Years Active is not functioning.
- Years Active format: `YYYY - YYYY` or `YYYY - Now`, plus `(Age debut - Age retired/now)`.
- Filmography count is not functioning.
- Pictorials count is not functioning.
- Personal section is not functioning.
- Physical section is not functioning.
- Related Videos is not functioning.
- Related Images is not functioning.

Performer related section detail-page format:

- Card/Grid view and List view, similar to catalog.
- Table/list header sortable A-Z / Z-A.
- Pagination.
- Per page.

### Form Page Gaps

Video Form:

- Availability should auto-set based on Media video path: Owned, Not Owned, Missing.
- Publisher / Label should be a text field with pre-fill suggestions from previous values to reduce typos.
- Tech Info for detail page: Duration, Resolution, File Size, and File Type should be auto-detected.
- Categories should display parent context. No Parent and child categories may both appear.

Picture Form:

- Availability should auto-set based on media/image/gallery paths: Owned, Not Owned, Missing.
- Publisher / Label should be a text field with pre-fill suggestions from previous values to reduce typos.
- Tech Info for detail page: Image Count, Main Resolution, Total File Size, and Main File Type should be auto-detected.
- Categories should display parent context. No Parent and child categories may both appear.

Performer Form:

- Profile / Thumbnail: Browse Cover/Thumbnail should be labeled "Browse" only.
- Status / Activity: Debut Date is not active yet.
- Status / Activity: Retired Date is not active yet.
- Summary: Filmography count is not active.
- Summary: Pictorials count is not active.
- Personal: Birthplace text field with pre-fill suggestions.
- Personal: Nationality text field with pre-fill suggestions.
- Personal: Astrological Sign auto from Birth Date.
- Personal: Blood Type text field with pre-fill suggestions.
- Physical: Height in cm.
- Physical: Weight in kg.
- Physical: Measurement format: `... / ... / ... cm`.
- Physical: Cup Size text field with pre-fill suggestions.

### Categories Catalog/Collection Gaps

Needed:

- Filter: Video Only, Image Only, Performer Only.
- New card design with Thumbnail, Title / Category Name, Videos count, Images count, Performers count, Usage total, and other functional Category Management metadata if useful.
- Pagination and per page.

### Category Management Follow-up

Needed:

- Visibility checkboxes: Show in Videos, Show in Images, Show in Performers.

Thumbnail follow-up:

- Regenerate low-res version.
- Store in application cache.
- Do not damage original file.
- Requires safety planning before implementation.

### Settings Gaps

Settings needs redesign:

- Move all purely informative items to the bottom as System Information.
- Visually distinguish functional menu from informative/system info.

Clarify data operations:

- Backup / Restore stores/restores database + app cache.
- Import / Export is for bulk edit data through CSV/XLSX, not full backup.
- Clear Cache clears generated/cache data, not catalog data.

Appearance / Theme:

- Dark Mode.
- Other basic appearance features.

Language:

- Language picker.
- Language editor.
- Possible support through CSV/XLSX/database/notepad-style format.
- Needs planning before implementation.

Placeholder cleanup:

- Clean placeholders, dummy text, MVP labels, and stale explanatory text later.

## Batch-by-Batch Intent

31.1 - Smoke Test Gap Audit + Efficient Roadmap Lock:

- Docs-only lock for this audit and roadmap.
- No implementation.

32.1 - Catalog Filter/Sort V1 Implementation:

- Implement V1 functional filters and sorting for Videos, Images, and Performers catalog pages where safe from existing fields/helpers.
- Replace stale data-dependent filter placeholder text.
- Keep scope to catalog toolbar behavior.

32.2 - Categories Catalog/Collection V1 Implementation:

- Implement Categories Catalog/Collection filters, card redesign, pagination, and per-page controls.
- Keep it browse/catalog focused, not Category Management CRUD.

33.1 - Media Tech Info + Availability Safety Plan:

- Plan safe media metadata detection and availability auto-status behavior before implementation.
- Define schema/runtime/package implications before code changes.

33.2 - Video/Picture Form + Detail Tech Info Implementation:

- Implement approved Video/Picture availability and tech-info behavior from 33.1.
- Keep file behavior explicit and safe.

33.3 - Performer Form + Detail Data Completion:

- Implement approved Performer dates, counts, personal, and physical fields.
- Include form and detail display behavior together when safe.

33.4 - Performer Related Detail Sections Implementation:

- Implement Performer Related Videos and Related Images display sections with view modes, sorting, pagination, and per-page controls.

34.1 - Category Visibility + Thumbnail Cache Safety Plan:

- Plan category visibility fields and thumbnail cache / low-res regeneration.
- Define cache location, invalidation, backup/restore implications, and file safety rules before implementation.

34.2 - Category Visibility Implementation:

- Implement Show in Videos, Show in Images, and Show in Performers behavior.
- Keep record-level `categoriesJson` labels unchanged unless a later approved batch changes that rule.

34.3 - Thumbnail Cache / Low-res Regeneration Implementation:

- Implement approved cache and low-res regeneration behavior.
- Preserve originals and avoid destructive file behavior.

35.1 - Settings Functional Redesign + Data Operations Planning:

- Plan Settings redesign and data operation definitions.
- Separate Backup/Restore, Import/Export, Clear Cache, Appearance, Language, and System Information.

35.2 - Settings Layout Redesign Implementation:

- Implement the approved Settings functional layout and System Information placement.

35.3 - Backup/Restore + Clear Cache Implementation:

- Implement approved Backup/Restore plus Clear Cache behavior with data safety controls.

35.4 - Import/Export Bulk Data Planning:

- Plan bulk edit import/export behavior for CSV/XLSX.
- Keep full backup separate from bulk data edit workflows.

35.5 - Appearance + Dark Mode Implementation:

- Implement approved basic appearance behavior, including Dark Mode.

35.6 - Language System Planning:

- Plan language storage, editing, and file/data format.

35.7 - Language Picker/Editor Implementation:

- Implement approved language picker/editor behavior.

36.1 - Placeholder / MVP Text / Dummy Data Audit + Cleanup Plan:

- Audit stale placeholder, MVP, dummy, and explanatory text across the app.

36.2 - Placeholder / MVP Text / Dummy Data Cleanup:

- Implement approved cleanup from 36.1.

36.3 - Full Smoke Test + Release Candidate:

- Run final full smoke test and release-candidate cleanup after the functional gaps above are addressed.

## Not in 31.1

Batch 31.1 does not implement code. It must not:

- modify source files under `src/`;
- modify Tauri/Rust files;
- change package files;
- add packages;
- implement UI;
- implement filters;
- implement media metadata detection;
- implement cache logic;
- implement Backup/Restore;
- implement Import/Export;
- implement Appearance/Theme;
- implement Language;
- start Batch 32.1;
- rename routes;
- change database schema.

## Next Batch After 31.1

```text
32.1 - Catalog Filter/Sort V1 Implementation
```

32.1 should start from this document, `docs/PROJECT_STATUS.md`, `docs/ROADMAP_LOCKED.md`, and `docs/AGENT_CODE_HANDOFF.md`.

## Agent Continuation Rule

Future agents must follow this roadmap and must not invent, reorder, merge, split, add, or remove batches without explicit user approval.

Batch 31.1 is docs-only. Do not start implementation work inside 31.1.
