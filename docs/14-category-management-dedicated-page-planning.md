# 14 - Category Management Dedicated Page Planning

## 1. Purpose

Category Management has outgrown its current placement inside Settings. The existing workflows include Managed Categories, category audit, record rename preview/apply, record removal preview/apply, usage counts, and safety confirmations. Those are catalog-management actions, not simple preferences.

This document plans how Category Management should move into a dedicated management page or area before implementation begins.

This batch is planning only:

- No route, page, component, or code changes.
- No category behavior changes.
- No schema changes.
- No backend/Rust/Tauri changes.
- No test changes.

## 2. Current Category Standard

Sakurava uses a two-layer category model.

### 2.1 Managed Categories

Managed Categories are local app-managed category configuration:

- Stored in `localStorage` key `sakurava.managedCategories.v1`.
- Used for controlled category vocabulary.
- Used for form suggestions.
- Used by the Category Management UI.
- Does not automatically mutate existing records.
- Is not the source of truth for collection filtering.

### 2.2 Record Categories

Record Categories are labels stored on individual records:

- Stored in `categoriesJson` on Video, Image, and Performer records.
- Used for collection filters.
- Used for category audit.
- Used for usage counts.
- Treated as actual record metadata.

### 2.3 Mandatory Rules

- Managed Categories are not Record Categories.
- Adding a managed category does not change records.
- Renaming a managed category does not change records.
- Deleting an unused managed category only removes it from `localStorage`.
- Renaming or removing categories across records requires preview and confirmation.
- Record-level operations only patch `categoriesJson`.
- Unrelated fields must be preserved.
- Invalid `categoriesJson` must not crash the app.
- Duplicate categories in a single record must be prevented.
- Do not introduce a relational category table.
- Do not introduce parent/child categories.
- Do not replace `categoriesJson` with `categoryIds`, UUIDs, or relation tables.

## 3. Problem With Keeping It Only In Settings

Keeping all Category Management inside Settings is not ideal long-term:

- Settings becomes too crowded.
- Category operations are catalog-management actions, not simple preferences.
- Audit, preview, and apply flows need more room than a compact Settings card.
- Record-level category operations are data-risk operations and need clearer UI structure.
- Future Form Category Picker Lockdown needs a clearer source of truth for managed category vocabulary.
- Safety messaging is easier to understand when management actions are grouped in a dedicated area.

## 4. Recommended Information Architecture

Recommended future structure:

```text
Settings
- Catalog Management
  - Category Management
```

The Category Management Dedicated Page should be a management page, not a browsing page.

It should handle:

- Add managed category.
- Rename managed category.
- Delete unused managed category.
- Category audit.
- Rename category across records preview.
- Rename category across records apply.
- Remove category from records preview.
- Remove category from records apply.
- Safety confirmations.
- Usage count visibility.
- Invalid category state handling if needed.

The first implementation should preserve current behavior before adding new capability.

## 5. Distinction From Categories Sidebar Page

The Category Management Dedicated Page is different from the future Categories Sidebar Page.

Category Management Dedicated Page:

- Management/admin workflow.
- Add, rename, delete, audit, preview, and apply.
- Safety-first.
- Likely entered from Settings / Catalog Management.
- Can include destructive or data-risk workflows only with preview and confirmation.

Future Categories Sidebar Page:

- Browsing/catalog discovery.
- Category cards.
- Thumbnail/collage.
- Counts by Videos, Images, and Performers.
- Search/sort categories.
- Not for destructive operations by default.

Do not implement or plan the Categories Sidebar Page in detail here. That is a later roadmap item.

## 6. Proposed Dedicated Page UX Structure

This section describes a future page structure without implementing it.

### 6.1 Page Header

- Title: `Category Management`
- Short safety description that explains Managed Categories and Record Categories are separate.
- Optional entry context showing it belongs under Settings / Catalog Management.

### 6.2 Managed Categories Panel

The Managed Categories panel should handle local managed category list operations:

- List/search Managed Categories.
- Add managed category.
- Rename managed category.
- Delete unused managed category.
- Show usage count for each managed category.
- Clearly state that managed-only operations do not change existing records.

### 6.3 Category Audit Panel

The Category Audit panel should show record category usage:

- Usage counts by Videos, Images, and Performers.
- Categories found in records.
- Categories missing from the managed list.
- Unused Managed Categories.
- Safe handling for invalid `categoriesJson`.

### 6.4 Record Operations Panel

The Record Operations panel should handle data-risk record category actions:

- Rename category across records.
- Remove category from records.
- Preview affected records before apply.
- Show counts by Videos, Images, and Performers.
- Require explicit confirmation before apply.
- Explain that only `categoriesJson` will be patched.
- Explain that Managed Categories are not automatically changed.

### 6.5 Safety Notes / Operation Summary Panel

The safety panel should summarize:

- Managed Categories and Record Categories are separate.
- Managed-only actions do not mutate records.
- Record operations patch only `categoriesJson`.
- Videos, Images, Performers, media files, Backup/Restore behavior, and unrelated fields are unaffected outside the explicit category patch.

## 7. Navigation Plan

Future implementation should use Settings as the parent entry point:

- Settings remains the parent entry point.
- Add a Catalog Management section in Settings.
- Category Management can be opened from Settings.
- Do not add a sidebar Categories page yet unless a later batch explicitly asks.
- Do not add extra sidebar navigation in this planning batch.
- If a route is needed later, likely use a dedicated route such as `/settings/category-management` or `/category-management`, but decide during implementation.

The route decision should be confirmed in the implementation batch before code changes.

## 8. Implementation Boundaries For Future Batch

For the future implementation batch:

- Reuse existing helpers.
- Avoid rewriting category logic.
- Preserve existing tests.
- Move or wrap existing Settings category UI carefully.
- Keep behavior equivalent first.
- Do not introduce new category storage.
- Do not change `categoriesJson` format.
- Do not change the Managed Categories `localStorage` key.
- Do not introduce relational categories.
- Do not implement Categories Sidebar Page.
- Do not implement Form Category Picker Lockdown in the same batch.
- Do not add schema/backend/Tauri changes unless explicitly approved.

Recommended helper baseline:

- `src/lib/managedCategories.ts`
- `src/lib/categoryAudit.ts`
- `src/lib/categoryRenamePreview.ts`
- `src/lib/categoryRenameApply.ts`

## 9. Safety Rules

Future implementation must preserve these safety rules:

- All record-level operations require preview and confirmation.
- Delete unused managed category must not patch records.
- Rename managed category must not patch records.
- Record-level rename/remove must only patch `categoriesJson`.
- Unrelated fields must be preserved.
- Invalid `categoriesJson` must not crash.
- Duplicate categories must be prevented.
- UI must clearly distinguish managed category operations from record category operations.
- Managed Category operations must not automatically mutate Record Categories.
- Record Category operations must not automatically mutate Managed Categories.

## 10. Non-Goals / Deferred

The following are explicitly deferred:

- Category Management Dedicated Page implementation.
- Categories Sidebar Page.
- Form Category Picker Lockdown.
- Relational category table.
- `categoryIds` or UUID category migration.
- Parent/child categories.
- Category analytics.
- Category import/export mapping.
- Broad UI polish.
- Schema/backend/Tauri changes.

## 11. Future Implementation Checklist

For Batch 19.2 implementation:

- [ ] Route/page decision confirmed.
- [ ] Existing helpers reused.
- [ ] Settings entry point preserved.
- [ ] Managed Categories and Record Categories clearly separated.
- [ ] Preview and confirmation preserved for record operations.
- [ ] Existing tests still pass.
- [ ] No schema/backend/Tauri changes unless explicitly approved.
- [ ] No behavior regression from existing Settings category flow.
- [ ] Manual smoke test plan created.
- [ ] Managed Category localStorage key preserved.
- [ ] `categoriesJson` format preserved.
- [ ] Categories Sidebar Page not implemented.
- [ ] Form Category Picker Lockdown not implemented.

## 12. Agent Notes

Future agents:

- Do not implement this page from this planning batch.
- Do not redo completed Category Management logic.
- Do not move logic without preserving behavior.
- Do not mix this with Categories Sidebar Page.
- Do not mix this with Form Category Picker Lockdown.
- Do not add UI polish unless required for safety/usability.
- Read `docs/10-category-management-safety.md` before any category code work.
- Preserve the current Category Management behavior as the implementation baseline.

## 13. Related Documents

- [docs/10-category-management-safety.md](10-category-management-safety.md) - Category Management safety rules.
- [docs/11-prd-alignment-and-development-plan.md](11-prd-alignment-and-development-plan.md) - Current post-MVP standard.
- [docs/13-settings-persistence-planning.md](13-settings-persistence-planning.md) - Settings persistence planning.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.

## 14. Checkpoint

This documentation batch establishes the Category Management dedicated page planning baseline.

Checkpoint tag:

```text
post-mvp-19-1-category-management-dedicated-page-planning-v1
```
