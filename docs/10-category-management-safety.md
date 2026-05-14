# Category Management Safety

This document defines the safety boundary for Sakurava category management in the MVP.

Category management lives in **Settings -> Catalog Settings**. It has two separate concepts:

- **Managed Categories**: the local app-managed category list.
- **Record Categories**: category labels stored on Videos, Images, and Performers.

Keep this separation explicit in code, tests, and future planning.

## Managed Categories

Managed Categories are the user-maintained category list for the app UI.

- Stored in browser/local app `localStorage`.
- Storage key: `sakurava.managedCategories.v1`.
- Stored as an array of strings.
- Used by the Settings-managed category list.
- Used as form category suggestions.
- Not automatically written to existing records.
- Not automatically removed from existing records.

Managed Categories are local UI configuration, not the source of truth for record filtering.

## Record Categories

Record Categories are category labels saved on individual catalog records.

- Stored per record in `categoriesJson`.
- Present on Videos, Images, and Performers.
- Used by collection filters.
- Used by the category audit in Settings.
- Affected only by explicit record rename/remove operations.

Record Categories are the source of truth for collection filtering and audit usage counts.

## Add Category

Add Category only changes the managed category list.

- Adds a new Managed Category to `sakurava.managedCategories.v1`.
- Trims the entered label.
- Rejects blank and duplicate labels case-insensitively.
- Does not update any Video, Image, or Performer.
- Does not write to `categoriesJson`.

## Rename Managed Category

Rename Managed Category only changes the local managed category list.

- Renames the selected Managed Category in `sakurava.managedCategories.v1`.
- Preserves the managed category order.
- Rejects blank, duplicate, and same-name rename targets.
- Does not update any Video, Image, or Performer.
- Does not write to `categoriesJson`.

Use record rename if existing records also need to change.

## Delete Unused Managed Category

Delete Unused Managed Category only removes a local managed category entry.

- Allowed only when the selected managed category usage count is `0`.
- Requires confirmation.
- Removes the category from `sakurava.managedCategories.v1`.
- Preserves the order of remaining managed categories.
- Does not update any Video, Image, or Performer.
- Does not remove labels from `categoriesJson`.

Use record removal if existing records also need to change.

## Rename Category Across Records

Rename Category Across Records changes Record Categories only after explicit user review.

- Requires a preview of affected records.
- Requires confirmation before applying.
- Matches category labels case-insensitively and after trimming.
- Updates only `categoriesJson` patches.
- Preserves unrelated record fields.
- Preserves category order inside each record.
- Prevents duplicate categories inside each record.
- Skips invalid `categoriesJson` safely.
- Does not automatically rename the Managed Category.

The update path must use existing record update commands with a patch shaped like:

```ts
{ categoriesJson: nextCategoriesJson }
```

Do not send incomplete full records.

## Remove Category From Records

Remove Category From Records changes Record Categories only after explicit user review.

- Requires a preview of affected records.
- Requires confirmation before applying.
- Matches category labels case-insensitively and after trimming.
- Updates only `categoriesJson` patches.
- Preserves unrelated record fields.
- Preserves the order of remaining categories inside each record.
- Removes blank category labels.
- Skips invalid `categoriesJson` safely.
- Does not automatically delete the Managed Category.

The managed category entry can be deleted separately only through Delete Unused Managed Category.

## Safety Rules

- No schema changes for MVP category management.
- No relational category table yet.
- No parent/child category system yet.
- No mass record mutation without preview and confirmation.
- Record category operations must patch only `categoriesJson`.
- Unrelated record fields must be preserved.
- Managed Category operations must not mutate records.
- Record Category operations must not automatically mutate Managed Categories.
- Invalid stored JSON must not crash Settings.
- Sidebar should remain clean; do not add a Categories sidebar menu for MVP.

## Testing Expectations

Category changes should include focused tests at the helper and Settings levels.

- Helper tests for category parsing, rename, remove, duplicate prevention, invalid JSON, and no-op behavior.
- Managed category helper tests for add, rename, delete, ordering, duplicate handling, and corrupt localStorage.
- Settings tests for preview display and empty states.
- Settings tests for confirmation flows.
- Settings tests that record update payloads contain only `categoriesJson`.
- Settings tests that unrelated fields are preserved.
- Settings tests that Managed Category localStorage is unchanged by record operations.
- Settings tests that record `categoriesJson` is unchanged by managed-only operations.
- `npm.cmd run test` must pass after category behavior changes.
- `npm.cmd run build` must pass after category behavior changes.

Docs-only changes do not require a build unless code references or generated docs are changed.

## Future Roadmap

Potential future category work should remain explicit and incremental.

- Optional DB-backed app settings for Managed Categories.
- Optional relational category table.
- Optional advanced category manager.
- Optional import/export for category lists and mappings.
- Optional richer merge/split workflows.
- Optional bulk category maintenance tools with preview, confirmation, and rollback planning.

Do not introduce these roadmap items implicitly while maintaining the MVP category flow.
