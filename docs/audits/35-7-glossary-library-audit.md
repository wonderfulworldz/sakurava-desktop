# Batch 35.7.1 - Glossary Library Audit + Implementation Plan

## Scope

This is an audit and planning note only. No Glossary page, route, sidebar item, persistence, database/schema change, or runtime behavior is implemented here.

Source of truth:

- `docs/43-final-product-sequential-plan.md`
- `docs/CURRENT_ROADMAP.md`
- `docs/CURRENT_PRODUCT_PLAN.md`
- `docs/PROJECT_STATUS.md`
- `docs/mockups/35-final-product/Glossary Library Page 372b4fe015dd8063b50de13ea7e9f673.md`
- `docs/mockups/35-final-product/Glosarry_Page_Layout.png`

Completed batches to preserve:

- 35.2 Form System Finalization
- 35.3 Category Library Finalization
- 35.4 Detail System Finalization
- 35.5 Global Gallery Preview Finalization
- 35.6 Collection Toolbar + Table Finalization

## Current App And Navigation State

Current route structure:

- `src/App.tsx` owns the `BrowserRouter` and route tree.
- App routes are nested under `AppShell`.
- Existing primary app routes include `/`, `/videos`, `/images`, `/performers`, `/settings`, and `/settings/category-management`.
- `/categories` currently redirects to `/settings/category-management`.
- Unknown routes redirect to `/`.
- No `/glossary` route exists yet.

Current app shell:

- `src/layouts/AppShell.tsx` renders the sidebar and a scrollable main outlet.
- Page title handling lives in `pageTitleFromPath`.
- Page titles currently handle Home, Videos, Images, Performers, Settings, and Category Management.
- No Glossary title handling exists yet.

Current sidebar:

- `src/components/Sidebar.tsx` renders all `sidebarItems` from `src/lib/navigation.ts` in one vertical navigation group.
- `src/lib/navigation.ts` currently defines the visible order as:
  - Home
  - Videos
  - Images
  - Performers
  - Categories
  - Settings
- Settings is currently in the same navigation group as the main catalog entries.
- No lower sidebar group exists yet.
- Existing sidebar tests in `src/App.test.tsx` cover navigation visibility, collapsed/expanded behavior, Settings access, page titles, and the `/categories` compatibility route.

## Required Glossary Behavior

Batch 35.7 introduces a standalone Glossary Library page. It must be independent from Video, Image, Performer, Category Catalog, Category Management, and record metadata.

Required page capabilities:

- Glossary Library header.
- Add Entry button.
- Add/Edit Glossary Entry form, hidden by default.
- Search glossary.
- Category filter.
- Sort dropdown.
- Rows per page.
- Table/list view.
- Pagination.
- Empty state when there are no entries.
- Footer or notice explaining Glossary independence from catalog metadata.

Required table columns:

- Thumbnail
- Term
- Synonyms
- Category
- Definition
- Source

Required form fields:

- Term
- Synonyms
- Category
- Thumbnail
- Favorite
- Source Title
- Source URL
- Definition

Required interactions:

- Add opens the form in add mode.
- Clicking a row opens the form in edit mode.
- Cancel hides the form without saving.
- Save/Update validates required fields before accepting changes.
- Delete appears only in edit mode and requires confirmation.
- Favorite can be toggled.
- Source link opens externally only after a safe implementation plan.
- Thumbnail preview may open full size only after safe image behavior is confirmed.

## Sidebar Placement Plan

Later implementation should split sidebar data/rendering into at least two groups:

Primary group, unchanged order:

- Home
- Videos
- Images
- Performers
- Categories

Lower group:

- Glossary
- Settings

Glossary must appear above Settings. Settings must remain accessible in both expanded and collapsed sidebar states. This should be implemented in the shell route/sidebar batch only, not in this audit.

Recommended route:

- `/glossary`

Recommended page title handling:

- Add `Glossary Library` to `pageTitleFromPath` after the route exists.

## Storage Options And Recommendation

### Option 1 - SQLite Storage

Pros:

- Best long-term fit for real CRUD and backup/restore expectations.
- Keeps Glossary durable across app sessions and machine restarts.
- Can support created/updated timestamps, source metadata, thumbnail path metadata, and future import/export.

Cons:

- Requires database/schema work.
- Requires frontend/backend repository or runtime command updates.
- Requires Rust/Tauri tests and restore/backup compatibility review.
- Must be approved as a dedicated storage/schema sub-batch.

### Option 2 - localStorage Temporary Storage

Pros:

- Fastest way to prototype low-risk local-only UI behavior.
- Avoids SQLite migration in the first UI batches.

Cons:

- Not ideal for a real product data library.
- Not naturally covered by database backup/restore.
- Can create migration cleanup work if users enter real Glossary data before SQLite is approved.

### Option 3 - Static Sample Data First

Pros:

- Safest for initial table, toolbar, layout, pagination, and empty-state implementation.
- No persistence, schema, runtime, or user data risk.
- Allows matching the mockup before storage decisions.

Cons:

- Not real CRUD.
- Must be clearly staged so sample data does not become production behavior.

### Option 4 - Staged Storage Plan

Recommended.

Use a staged sequence:

- Route/sidebar shell first.
- Decide storage in a dedicated 35.7.3 plan.
- Build table/search/sort/pagination against static or in-memory safe data.
- Build form UI and validation without risky persistence.
- Add SQLite persistence only after explicit user approval.

Persisted Glossary CRUD should eventually use SQLite, but the schema/table should be deferred to a dedicated sub-batch. Do not add a Glossary table, migration, Rust command, or repository in the shell/UI batches unless the user explicitly approves that storage decision.

## Glossary Data Field List

Minimum product fields:

- `id` or `key`
- `term`
- `definition`
- `synonymsJson` or `synonyms`
- `category`
- `thumbnailPath`
- `favorite`
- `sourceTitle`
- `sourceUrl`

Recommended system fields if SQLite is approved:

- `createdAt`
- `updatedAt`

Validation:

- `term` is required.
- `definition` is required.
- `sourceUrl` should be empty or a valid URL.
- `synonyms` should normalize empty/duplicate chips.
- `category` should be a Glossary category only.
- `thumbnailPath` should be local/app-managed only, with max-size validation before copying or storing.

## Glossary Category Recommendation

Glossary categories should be independent Glossary categories, not linked to Managed Categories, Record Categories, Category Catalog, or Category Management.

Reasons:

- The source plan states Glossary is decoupled from catalog and category systems.
- Glossary categories are reference taxonomy, not media metadata.
- Linking them to Managed Categories would risk unexpected category behavior, extra settings coupling, and user confusion.
- Keeping them independent avoids mutation of `categoriesJson` and preserves completed Category Library behavior.

Safe implementation rule:

- Glossary category selection may allow free creation inside Glossary only if approved for that page.
- It must not add to `sakurava.managedCategories.v1`.
- It must not create or mutate Managed Categories.
- It must not filter Videos, Images, Performers, or Categories.

## Page Layout Plan

Match the Glossary mockup structure:

1. Header row
   - Title: `Glossary Library`
   - Subtitle: `Store and manage definitions, references, and terms for your personal use.`
   - Primary Add Entry button.

2. Form section, hidden by default
   - Add title: `Add Glossary Entry`
   - Edit title: `Edit Glossary Entry`
   - Helper text: `Create a new glossary entry and reference.`
   - Fields: Term, Synonyms, Category, Thumbnail, Favorite, Source Title, Source URL, Definition.
   - Character counter for Definition.
   - Actions: Save Entry or Update Entry, Delete Entry in edit mode, Cancel.

3. Toolbar
   - Search field for term, synonyms, definition, category, source title, and source URL.
   - Category multi-select filter with active count badge.
   - Sort dropdown with Term A-Z, Term Z-A, Category A-Z, Category Z-A.

4. Pagination row
   - Showing count.
   - Rows per page selector.
   - Previous/page/next controls.

5. Table
   - Thumbnail.
   - Term with favorite icon.
   - Synonyms count badge.
   - Category badge.
   - Definition preview with Show more for long text.
   - Source title/link with external icon.

6. Empty state
   - Show when no entries exist or filters return no matches.
   - Keep it specific to Glossary and avoid catalog/category wording.

7. Footer notice
   - `Glossary entries are independent references and do not affect Category Management, catalog filters, metadata, or item relations.`

## CRUD Behavior Plan

Add:

- Opens form in add mode.
- Starts with empty fields and Favorite off.
- Requires Term and Definition before save.

Edit:

- Clicking a table row opens the selected entry in edit mode.
- Existing values populate the form.
- Update should preserve fields that were not changed.

Delete:

- Available only in edit mode.
- Requires explicit confirmation.
- Should remove only the selected Glossary entry.

Cancel:

- Collapses the form.
- Does not persist unsaved edits.

Favorite:

- Can be toggled from the row or form after behavior is implemented.
- Should update only the selected Glossary entry.

Validation:

- Required Term and Definition.
- Optional Source URL must validate before save.
- Synonyms should dedupe and trim.
- Thumbnail must respect local/app-managed file safety and max-size rules before persistence.

## Safe Implementation Sequence

### 35.7.2 - Glossary Route + Sidebar Shell

- Add route/page shell only.
- Add a `GlossaryPage` shell with static header/notice only.
- Move Glossary and Settings into the lower sidebar group.
- Preserve primary order: Home, Videos, Images, Performers, Categories.
- Keep Settings accessible.
- No persistence.
- No CRUD.
- No database/schema.

### 35.7.3 - Glossary Storage Safety Plan / Data Model

- Decide SQLite vs local-only/staged storage.
- Document the exact data model.
- If SQLite is chosen, document table shape, migration path, Tauri/Rust command boundaries, backup/restore impact, and tests.
- Ask for user confirmation before any schema or migration work.

### 35.7.4 - Glossary Table + Static/Safe Data UI

- Build table/search/sort/pagination visual structure.
- Use static or in-memory safe sample data only.
- Include empty state.
- Do not persist user entries.

### 35.7.5 - Glossary Add/Edit Form UI

- Build form UI and validation.
- Keep persistence disabled or in-memory only unless storage has been approved.
- Include Cancel behavior.
- Include edit-mode delete confirmation UI only if it does not mutate persisted data yet.

### 35.7.6 - Glossary CRUD Persistence

- Implement persistence after storage decision.
- If SQLite is approved, add schema, commands/repositories, validation, and tests in this batch.
- Ensure CRUD touches only Glossary data.

### 35.7.7 - Glossary Polish

- Favorite behavior.
- Safe external source link behavior.
- Thumbnail browse/store/preview behavior.
- Show more definition behavior.
- Responsive and accessibility polish.

### 35.7.8 - Regression Sweep + Closeout

- No new features.
- Verify routes, sidebar, Settings access, table/search/sort/pagination, form validation, CRUD persistence if implemented, and non-regression for completed 35.2-35.6 surfaces.

## Files Likely To Change In Implementation

Route/shell:

- `src/App.tsx`
- `src/layouts/AppShell.tsx`
- `src/components/Sidebar.tsx`
- `src/lib/navigation.ts`
- `src/lib/language.ts`
- `src/pages/GlossaryPage.tsx`

Glossary UI:

- `src/pages/GlossaryPage.tsx`
- Possible shared UI helpers only if existing patterns justify them.

Frontend model/storage if approved:

- `src/lib/glossary.ts`
- `src/backend/types.ts`
- `src/backend/repositories.ts`
- `src/backend/sqlite/adapter.ts`
- `src/backend/schema.ts`
- `src/backend/validation.ts`
- `src/backend/runtime/commands.ts`

Tauri/Rust storage if SQLite is approved:

- `src-tauri/src/database.rs`
- `src-tauri/src/commands.rs`
- Rust command tests in the same files or nearby test modules.

Avoid unless explicitly required:

- Catalog/Collection pages
- Category Catalog
- Category Management
- Video/Image/Performer forms
- Detail pages
- Global Image Viewer
- Backup/Restore behavior
- Import/Export behavior

## Tests Likely To Update

Likely focused tests:

- `src/App.test.tsx`
  - Glossary route renders shell.
  - Sidebar displays Glossary above Settings in the lower group.
  - Settings remains accessible in expanded and collapsed sidebar states.
  - Page title updates for `/glossary`.
  - Primary navigation order remains Home, Videos, Images, Performers, Categories.

Glossary UI tests after UI batches:

- Search filters term, synonyms, definition, category, source title, and source URL.
- Category multi-filter works independently from Managed Categories.
- Sort handles Term A-Z, Term Z-A, Category A-Z, Category Z-A.
- Rows per page and pagination avoid empty pages after filter changes.
- Empty state renders when no entries exist or no filters match.
- Add/Edit form validation blocks missing Term or Definition.
- Cancel hides the form without saving.
- Delete requires confirmation.
- Favorite toggle changes only the selected Glossary entry.

Storage tests if SQLite is approved:

- Schema test includes a Glossary table only after approval.
- Frontend repository/adapter tests cover create/list/update/delete.
- Runtime/Tauri command tests cover safe validation and CRUD.
- Rust tests cover schema initialization, idempotency, and command behavior.
- Backup/restore tests may need updates if required-table validation changes.

## Regression Checklist

- App shell still renders and scrolls correctly.
- Sidebar collapse/expand still works.
- Settings remains accessible.
- Glossary appears above Settings only in the lower group after implementation.
- Primary navigation order remains Home, Videos, Images, Performers, Categories.
- `/categories` compatibility route behavior is preserved unless explicitly revised.
- `/settings/category-management` remains accessible.
- Page title handling remains correct for existing routes.
- Video Catalog remains unchanged.
- Image Catalog remains unchanged.
- Performer Catalog remains unchanged.
- Category Catalog remains unchanged.
- Category Management behavior remains unchanged.
- Managed Categories storage remains unchanged.
- Record Categories and `categoriesJson` remain unchanged.
- Video/Image/Performer forms remain unchanged.
- Detail pages remain unchanged.
- Global Image Viewer remains unchanged.
- Table pagination changes for Glossary do not alter existing catalog pagination.
- External source links use the safe Tauri/browser-open pattern only after approval.
- Thumbnail browse/store/preview behavior does not mutate source media files.
- No cloud, telemetry, scraping, accounts, or network-dependent behavior is introduced.

## Explicit Non-Goals

- Do not implement Glossary page in 35.7.1.
- Do not add route yet.
- Do not add sidebar item yet.
- Do not add database/schema.
- Do not add SQLite migration.
- Do not add runtime/Tauri commands.
- Do not add persistence.
- Do not start 35.7.2.
- Do not start 35.8.
- Do not touch Catalog/Collection pages.
- Do not touch Category Catalog.
- Do not touch Category Management.
- Do not touch Video/Image/Performer forms.
- Do not touch Detail pages.
- Do not touch Settings behavior.
- Do not touch Global Image Viewer.
- Do not link Glossary categories to Managed Categories.
- Do not mutate `categoriesJson`.
- Do not introduce cloud services, scraping, accounts, telemetry, or network-dependent behavior.

## Open Questions Requiring User Confirmation

1. Should persisted Glossary CRUD use SQLite as the final storage target?
2. If SQLite is approved, should the Glossary table be required for restore validation, or should older backups without Glossary data remain valid during migration?
3. Should Glossary categories allow free creation inside the Glossary form, or should they be chosen only from existing Glossary entries?
4. Should thumbnail storage copy images into an app-managed folder, or store only explicit local paths?
5. Should the Source URL open in the system browser through the same safe external-open pattern used elsewhere?
6. Should Rows per page follow the catalog standard from 35.6, or use a Glossary-specific compact table default?
7. Should Delete be part of the first persistence batch, or deferred until after add/edit/list behavior is stable?

## Verification For This Audit

Recommended verification for 35.7.1:

```powershell
git diff --check
git status
```

Expected result:

- Only `docs/audits/35-7-glossary-library-audit.md` is changed.
