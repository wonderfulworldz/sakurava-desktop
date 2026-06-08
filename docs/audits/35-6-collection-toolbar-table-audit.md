# Batch 35.6.1 - Collection/Catalog Toolbar + Table Audit

## Scope

This is an audit and planning note only. No application code, UI behavior, database/schema, detail pages, form pages, Global Image Viewer behavior, or Batch 35.7 work is implemented here.

Source of truth:

- `docs/43-final-product-sequential-plan.md`
- `docs/CURRENT_ROADMAP.md`
- `docs/CURRENT_PRODUCT_PLAN.md`
- `docs/PROJECT_STATUS.md`
- `docs/mockups/35-final-product/Final Collection Spec 370b4fe015dd804aa077cf922c46f1bd.md`
- `docs/mockups/35-final-product/Filter bar performer 370b4fe015dd80c9abadef33786a337f.md`

## Current Behavior Summary By Page

### Video Catalog

Current implementation path:

- `src/pages/VideoCollectionPage.tsx`
- `src/pages/CollectionPage.tsx`
- `src/lib/collectionData.ts`
- `src/lib/videoIntegration.ts`

Current behavior:

- Uses shared `CollectionPage`.
- Search covers title/original title, availability, censorship, duration, and categories.
- Toolbar includes search, Filters toggle, Sorting select, and a single Card/Table view toggle.
- Filter panel includes category multi-filter plus entity filters: Quality, Rating, Year, Duration.
- Category multi-filter uses AND behavior, dedupes selected categories, caps active category filters at 5, disables category select at the cap, and can remove individual category chips.
- URL `?category=` is supported and seeds the active category filter when the category exists.
- Sort options include Last Added, Last Updated, Title A-Z, Release Year, Rating, and Duration.
- Card view uses full video cards in an auto-fill responsive grid.
- Table view is read-only and links cells to the detail route.
- Pagination defaults to page size `30`; options are `30`, `60`, `90`, `120`.
- Clear all behavior exists in two forms:
  - `Clear all filters` in the open filter panel clears search, category filters, and data filters, but preserves sort and page size.
  - Category chip row `Clear all` clears only active category filters.

### Image Catalog

Current implementation path:

- `src/pages/ImageCollectionPage.tsx`
- `src/pages/CollectionPage.tsx`
- `src/lib/collectionData.ts`
- `src/lib/imageIntegration.ts`

Current behavior:

- Uses shared `CollectionPage`.
- Search covers title/original title, code, availability, censorship, image count, and categories.
- Toolbar shape matches Video Catalog.
- Filter panel includes category multi-filter plus entity filters: Quality, Rating, Year, Image Count.
- Category multi-filter behavior is inherited from shared `CollectionPage`.
- Sort options include Last Added, Last Updated, Title A-Z, Release Year, Rating, and Image Count.
- Card view uses full image cards in an auto-fill responsive grid.
- Table view is read-only and links cells to the detail route.
- Pagination defaults to page size `30`; options are `30`, `60`, `90`, `120`.
- Clear all behavior is inherited from shared `CollectionPage`.

### Performer Catalog

Current implementation path:

- `src/pages/PerformerCollectionPage.tsx`
- `src/pages/CollectionPage.tsx`
- `src/lib/collectionData.ts`
- `src/lib/performerIntegration.ts`

Current behavior:

- Uses shared `CollectionPage`.
- Search covers name, original name, status, filmography count, pictorial count, and categories.
- Current search does not explicitly include aliases or nationality from the performer filter mockup.
- Toolbar shape matches Video and Image Catalogs.
- Filter panel includes category multi-filter plus entity filters: Status, Rating, Debut Year, Filmography, Pictorial.
- Current filter panel does not include the full performer mockup set: Age range, Nationality searchable select, Height, Body Type, Cup Size, or category smart picker with parent/child structure.
- Category multi-filter behavior is inherited from shared `CollectionPage`.
- Sort options include Last Added, Last Updated, Name A-Z, Rating, Status, Filmography, and Pictorials.
- Card view uses full performer cards in an auto-fill responsive grid.
- Table view is read-only and links cells to the detail route.
- Pagination defaults to page size `30`; options are `30`, `60`, `90`, `120`.
- Clear all behavior is inherited from shared `CollectionPage`.

### Category Catalog

Current implementation path:

- `src/pages/CategoriesPage.tsx`
- `src/components/CategoryCatalogCard.tsx`
- `src/lib/categoryAudit.ts`
- `src/runtime/managedCategoryCommands.ts`

Current behavior:

- Uses a separate implementation, not shared `CollectionPage`.
- Loads Videos, Images, Performers, and Managed Categories to build category usage rows.
- Toolbar includes category search, a single usage filter select, and a sort select.
- Usage filter options are All, Video Only, Image Only, Performer Only.
- Search covers category name, parent name, and description.
- Sort options are Name A-Z, Usage high-low, Usage low-high, Last Updated, and Last Added.
- Card view exists using `CategoryCatalogCard`.
- No table view is currently present on the Category Catalog page.
- Pagination defaults to page size `24`; options are `12`, `24`, `48`.
- Pagination displays result range text such as `Showing 1-24 of N categories`.
- There are no active filter chips or clear-all controls on the Category Catalog page.

## Required 35.6 Behavior

Batch 35.6 from `docs/43-final-product-sequential-plan.md` requires Collection Toolbar + Table finalization:

- Revamp core catalog browsing interfaces.
- Provide powerful sorting and advanced filtering panels.
- Standardize filter chip rules, display order, and clear-all behavior.
- Finalize table elements and interactive column sorts.
- Render pagination headers with matching result counts and rows-per-page selectors.

The available mockup/spec notes add:

- Performer toolbar format: `[Search performers, name, alias, code, tag...] [Filters 0] [Sort: A-Z] [View]`.
- Filters button should include an active count badge.
- View should be a single Card/Table toggle action.
- Performer advanced filters should eventually include Status, Age, Nationality, Height, Body Type, Cup Size, Debut Year, Filmography Count, Pictorials Count, Rating range, and Tags/Attributes.
- Several sub-specs are still marked `Not started`: Filter chip order, Table columns, Short/pagination behavior, Card/Table toggle, and Clear all behavior. Treat these as requirements to define conservatively from the active 35.6 roadmap and current app patterns before implementation.

## Global Pagination/Page-Size Standard

User-added 35.6 collection/catalog UX standard:

- Global per-page options: `32`, `64`, `128`, `256`.
- Default page size: `32`.
- Default card/grid target: `4 columns x 8 rows = 32 items`.
- Apply/audit across:
  - Video Catalog
  - Image Catalog
  - Performer Catalog
  - Category Catalog
  - Any other existing collection/catalog page if relevant.

Current gap:

- Video/Image/Performer Catalogs use `30`, `60`, `90`, `120`, default `30`.
- Category Catalog uses `12`, `24`, `48`, default `24`.
- Category Management uses `25`, `50`, `100`; this is a management page under Settings, not the Category Catalog browsing page. Do not change it in 35.6 unless the user explicitly expands scope.
- Performer Detail related mini collections use `12`, `24`, `48`, `96`; these are detail-page related sections, not catalog pages. Do not change them in 35.6.1/35.6.2 unless explicitly included later.

Grid fit assessment:

- Shared Video/Image/Performer card grids use `auto-fill` with minimum widths around 300/320px, with performers slightly narrower at wide screens. This can display 4 columns on sufficiently wide desktop windows, but it does not enforce a stable 4-column target.
- Category Catalog uses `auto-fit` with minimum 260px. It can display 4 columns on wide screens, but it does not enforce the 4 x 8 target.
- Moving to default 32 is safe from a data perspective because pagination is purely frontend slicing, but visual density and card height consistency should be verified after implementation.

## Gap List

1. Page-size options do not match the new global standard.
2. Default page size is not 32 on any audited catalog page.
3. Shared catalog grids do not explicitly target 4 columns x 8 rows.
4. Category Catalog has card view only; no table view.
5. Category Catalog toolbar is separate from shared collection toolbar and lacks active chips / clear-all behavior.
6. Video/Image/Performer top toolbar has a Filters button but no active filter count badge.
7. Active filter chips currently cover category filters only, not search, sort, or data filters.
8. Clear behavior is split between category-only clear and filter-panel clear; 35.6 needs a consistent rule.
9. Table views are read-only and have static headers; columns are not interactive sort controls.
10. Table column definitions are basic and not yet final against the 35.6 table-column sub-spec.
11. Advanced filters are select-based and use coarse buckets; the performer mockup calls for richer controls such as ranges and searchable selects.
12. Performer search does not explicitly include aliases/nationality/code-like fields from the performer toolbar mockup.
13. Category Catalog usage filter has no active chip representation and no clear-all reset.
14. Existing tests assert old page-size values, so pagination standardization will require test updates.

## Safe Implementation Sequence

### 35.6.2 - Global Pagination/Page Size Standardization

- Add a shared catalog page-size constant for `32`, `64`, `128`, `256`.
- Set default to `32` where safe.
- Apply to Video, Image, Performer, and Category Catalog pages.
- Preserve existing search, filter, sort, category multi-filter, URL category seed, view toggle, and pagination reset behavior.
- Do not change Category Management pagination or detail-page related mini collections in this step.
- Update focused tests that currently expect `30/60/90/120` and Category Catalog `12/24/48`.

### 35.6.3 - Toolbar Layout + Active Filter Chips Cleanup

- Align Video/Image/Performer/Category toolbar structure where safe.
- Add Filters active count badge.
- Define active chip order conservatively:
  1. Search
  2. Category / Tags
  3. Entity data filters
  4. Usage filter for Category Catalog
- Make Clear All reset all active filters and search, while preserving sort and page size unless explicitly approved otherwise.
- Keep individual chip removal for category filters and add equivalent safe removals for other filter chips.

### 35.6.4 - Advanced Filter Panel Safe Implementation

- Add/complete entity-aware filters using only fields already present in `CollectionItem` or safe integration helpers.
- Videos: keep safe fields such as quality, rating, year, duration.
- Images: keep safe fields such as quality, rating, year, image count.
- Performers: add only filters backed by safe existing persisted/derived fields. Nationality, height, body metrics, cup size, and age should be audited against current integration fields before enabling.
- Categories: keep usage filters and add chips/clear behavior before adding new filter types.
- Do not introduce new database fields or schema changes.

### 35.6.5 - Table View + Sorting Finalization

- Finalize table columns per entity using current safe fields.
- Convert supported table headers into interactive sort controls.
- Keep table rows linked to detail routes.
- Add result count/pagination header alignment.
- Add Category Catalog table view if still in scope and safe.

### 35.6.6 - Regression Sweep + Closeout

- No new features.
- Verify Video, Image, Performer, and Category Catalogs.
- Verify completed 35.2-35.5 flows are not touched or regressed.
- Verify page-size standard, filter chips, clear behavior, table sorting, category URL filtering, and responsive grid/table behavior.

## Files Likely To Change

Likely implementation files:

- `src/pages/CollectionPage.tsx`
- `src/pages/CategoriesPage.tsx`
- `src/pages/VideoCollectionPage.tsx`
- `src/pages/ImageCollectionPage.tsx`
- `src/pages/PerformerCollectionPage.tsx`
- `src/lib/collectionData.ts`
- `src/lib/videoIntegration.ts`
- `src/lib/imageIntegration.ts`
- `src/lib/performerIntegration.ts`
- `src/components/CategoryCatalogCard.tsx`

Possible shared helper extraction if duplication grows:

- `src/lib/collectionPagination.ts`
- `src/lib/collectionFilters.ts`

Avoid unless needed:

- Detail pages
- Form pages
- Global Image Viewer files
- Runtime/database/schema files
- Settings Category Management pagination

## Tests Likely To Update

Likely focused tests:

- `src/App.test.tsx`
  - Shared catalog render tests currently assert default `30` and options `30/60/90/120`.
  - Catalog clear/filter/pagination tests currently use `60`.
  - Category Catalog tests currently assert default/ranges around `24` and options `12/24/48`.
  - Table view tests should be extended if table sort becomes interactive.
  - Category URL filter tests should remain covered.

Potential lower-level tests:

- `src/lib/catalogDerivedFields.test.ts`
- `src/lib/ratingSummary.test.ts`
- Entity integration helper tests if new advanced filters depend on derived values.

Do not update unrelated viewer/detail/form tests except to confirm no regressions.

## Regression Checklist

- Video Catalog still loads desktop runtime records and static fallback records.
- Image Catalog still loads desktop runtime records and static fallback records.
- Performer Catalog still loads desktop runtime records and static fallback records.
- Category Catalog still loads managed categories and category usage safely.
- Search still resets to page 1.
- Category filter from `?category=` still works for Video/Image/Performer catalogs.
- Category multi-filter remains AND behavior and keeps the 5-filter cap unless explicitly revised.
- Data filters still combine with search and category filters.
- Clear All behavior is consistent and does not reset sort/page size unless explicitly approved.
- Sort options still produce stable results and preserve fallback ordering for missing values.
- Card view remains usable at desktop and mobile widths.
- Table view remains read-only and detail links still route correctly.
- Pagination does not show empty pages after filters change.
- Page-size changes reset to page 1.
- Category Catalog usage count links still navigate to filtered Video/Image/Performer catalogs.
- Category Management in Settings is not changed by catalog standardization.
- Forms from 35.2 are not touched.
- Category Library behavior from 35.3 is not regressed.
- Detail layouts from 35.4 are not touched.
- Global Image Viewer from 35.5 is not touched.

## Explicit Non-Goals

- Do not implement advanced filters in 35.6.1.
- Do not change collection UI in 35.6.1.
- Do not change database/schema.
- Do not change detail pages.
- Do not change Global Image Viewer.
- Do not change form pages.
- Do not start 35.7.
- Do not introduce new fields that are not safely available.
- Do not remove existing working filters unless a later implementation audit proves they are broken or redundant.
- Do not change Category Management pagination as part of the Category Catalog standard unless explicitly approved.
- Do not change Performer Detail related mini-collection pagination as part of the main catalog standard unless explicitly approved.
