# 16 - Categories Sidebar Page Planning

## 1. Purpose

The future Categories Sidebar Page should be a browsing and discovery page for exploring catalog content by category.

It is not Category Management.

The page should help users see which categories exist across Videos, Images, and Performers, compare usage counts, and open related catalog content. It should not provide add, rename, delete, or bulk record maintenance actions by default.

## 2. Current Scope

This batch is documentation/planning only.

Do not make implementation changes in this batch:

- No Categories Sidebar Page implementation.
- No route changes.
- No sidebar changes.
- No UI code changes.
- No tests.
- No schema changes.
- No backend/Rust/Tauri changes.
- No package changes.

The goal is to define page behavior, safety boundaries, and future implementation direction before code changes begin.

## 3. Difference From Category Management

Category Management and the future Categories Sidebar Page must remain separate.

### 3.1 Category Management

Category Management is a management and safety workflow.

Current location:

- Settings / Catalog Management.
- Dedicated route: `/settings/category-management`.

Responsibilities:

- Add managed category.
- Rename managed category.
- Delete unused managed category.
- Audit categories.
- Preview record-level rename operations.
- Apply record-level rename operations after confirmation.
- Preview record-level removal operations.
- Apply record-level removal operations after confirmation.
- Keep data-risk operations gated by preview and confirmation.

Category Management is the only category management surface.

### 3.2 Categories Sidebar Page

The future Categories Sidebar Page should be a main sidebar navigation page for browsing and discovery.

Responsibilities:

- Browse categories.
- Search categories.
- Sort categories.
- View category cards, a list, or a table.
- Show counts by Videos, Images, Performers, and Total.
- Open filtered collection views or a category detail/browse view.
- Link to Category Management for management actions.

It should not include destructive operations by default.

## 4. Source Of Category Data

Record Categories from `categoriesJson` are the source for actual catalog usage.

Managed Categories from `sakurava.managedCategories.v1` may enrich display, but they are not the source of truth for usage counts.

Planned behavior:

- Show categories that exist in records.
- Use existing category audit behavior where possible to count usage across Videos, Images, and Performers.
- Optionally show unused Managed Categories as empty or unused categories if useful.
- Mark categories as Managed, Record-only, Used, or Unused Managed where that helps clarity.
- Do not mutate Managed Categories.
- Do not patch records.
- Do not change `categoriesJson`.
- Do not create categories from this page.

Recommended source hierarchy:

1. Build usage counts from Record Categories in `categoriesJson`.
2. Read Managed Categories from `sakurava.managedCategories.v1` only to enrich status.
3. Merge by trimmed, case-insensitive category name for display.
4. Preserve the display label from record usage when a category exists in records.
5. Use the Managed Category label when showing an unused Managed Category.

## 5. Recommended Page Behavior

Future implementation should add a main sidebar item named `Categories` only in the implementation batch.

Recommended page behavior:

- Page title: `Categories`.
- Search categories by name.
- Sort by:
  - Name.
  - Total usage.
  - Video count.
  - Image count.
  - Performer count.
- Optional filters:
  - All.
  - Used.
  - Unused Managed.
  - Record-only.
- Support cards or table view if useful.
- Show counts:
  - Videos.
  - Images.
  - Performers.
  - Total.
- Clicking a category should browse related catalog items.
- Do not show add, edit, delete, rename, or record maintenance buttons by default.
- Provide a clear link to Category Management for management actions.

The first implementation should favor a simple, readable browse page over broad UI polish.

## 6. Category Card / List Content

Each category item should include:

- Category name.
- Managed or Record-only status.
- Total usage count.
- Videos count.
- Images count.
- Performers count.
- Optional thumbnail or collage placeholder for later.
- Action to view the category.
- Optional actions to open filtered Videos, Images, or Performers if planned.

Recommended status labels:

- Managed: exists in Managed Categories.
- Record-only: exists in records but not in Managed Categories.
- Unused Managed: exists in Managed Categories but has no record usage.

Do not use parent category fields or parent/child status.

## 7. Navigation Plan

Future implementation direction:

- Add a main sidebar item named `Categories` only in the implementation batch.
- Use route `/categories` unless implementation review finds a safer convention.
- A category browsing route may later use `/categories/:categoryName` or query filters.
- Decide specific deep-link behavior during implementation.
- Do not add a route in this planning batch.
- Do not add sidebar navigation in this planning batch.

The future sidebar item should sit with the catalog browsing pages, not under Settings.

## 8. Relationship To Collection Filters

The Categories Sidebar Page should integrate with collection browsing later, but this planning batch should not change collection filter logic.

Future options:

- Clicking a category opens collection pages with a category filter applied.
- Clicking a category opens a dedicated category browse/detail page.
- Category cards can offer direct links to filtered Videos, Images, and Performers.

Implementation should avoid complex deep-link behavior unless the batch explicitly includes it. If collection filter state is not currently URL-addressable, the implementation batch should decide whether to add query parameters or start with a local browse/detail page.

## 9. Safety Rules

Mandatory rules for future implementation:

- No add category from the Categories Sidebar Page.
- No rename category from the Categories Sidebar Page.
- No delete category from the Categories Sidebar Page.
- No record-level category operations from this page.
- No mutation of Managed Categories.
- No mutation of Record Categories.
- No `categoriesJson` format change.
- No relational category table.
- No parent/child categories.
- No `categoryIds` or UUID migration.
- Category Management remains the only management surface.

If the user needs management actions, the page should link to Category Management instead of duplicating those actions.

## 10. Non-Goals / Deferred

The following are explicitly deferred:

- Implementation in this batch.
- Category Management changes.
- Destructive category operations.
- Parent/child categories.
- Relational categories.
- Category analytics.
- Category import/export mapping.
- Thumbnail or collage generation if not already supported.
- Deep linking complexity.
- Broad UI polish.
- Backend/schema/Tauri/package changes.

## 11. Future Implementation Checklist

For the future implementation batch:

- [ ] Sidebar item decision confirmed.
- [ ] Route decision confirmed.
- [ ] Category source behavior confirmed.
- [ ] Category counts use existing category audit helpers if possible.
- [ ] Managed Categories enrich display without becoming usage source of truth.
- [ ] Record-only category display handled.
- [ ] Unused Managed Category display decision confirmed.
- [ ] No mutation behavior added.
- [ ] Link to Category Management provided.
- [ ] Tests added for route/page rendering.
- [ ] Tests added for search/sort/filter if implemented.
- [ ] Tests verify no management actions are present by default.
- [ ] `npm.cmd run test` passes.
- [ ] `npm.cmd run build` passes.
- [ ] Manual smoke test plan prepared.

## 12. Agent Notes

Future agents:

- Do not implement the Categories Sidebar Page from this planning batch.
- Do not mix the Categories Sidebar Page with Category Management.
- Do not add destructive operations.
- Do not add parent/child logic.
- Do not alter Form Category Picker Lockdown.
- Do not alter category storage.
- Do not change `categoriesJson`.
- Do not change `sakurava.managedCategories.v1`.
- Read `docs/10-category-management-safety.md` and `docs/14-category-management-dedicated-page-planning.md` before implementation.
- Keep the page focused on browsing and discovery.

## 13. Related Documents

- [docs/10-category-management-safety.md](10-category-management-safety.md) - Category Management safety rules.
- [docs/14-category-management-dedicated-page-planning.md](14-category-management-dedicated-page-planning.md) - Category Management dedicated page planning.
- [docs/15-form-category-picker-lockdown-planning.md](15-form-category-picker-lockdown-planning.md) - Form Category Picker Lockdown planning.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.

## 14. Checkpoint

This documentation batch establishes the Categories Sidebar Page planning baseline.

Checkpoint tag:

```text
post-mvp-21-1-categories-sidebar-page-planning-v1
```
