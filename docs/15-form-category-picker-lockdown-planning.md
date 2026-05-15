# 15 - Form Category Picker Lockdown Planning

## 1. Purpose

Form category input should stop being free-text. Future form category selection should use Managed Categories as the controlled vocabulary for Videos, Images, and Performers.

This planning document defines the expected behavior before implementation begins. It preserves the current MVP record storage model: selected form categories continue to be saved as text labels in `categoriesJson`.

## 2. Current Scope

This batch is documentation/planning only.

Do not make implementation changes in this batch:

- No form category picker implementation.
- No form UI changes.
- No tests.
- No schema changes.
- No backend/Rust/Tauri changes.
- No package changes.

The goal is to define safe behavior, edge cases, and implementation boundaries for a later batch.

## 3. Current Category Model

Sakurava uses a two-layer category model.

### 3.1 Managed Categories

Managed Categories are the local app-managed category vocabulary:

- Stored in `localStorage` key `sakurava.managedCategories.v1`.
- Stored as an array of strings.
- Used by Category Management.
- Used as the controlled vocabulary for future form category selection.
- Not automatically applied to existing records.

### 3.2 Record Categories

Record Categories are category labels stored on individual records:

- Stored in `categoriesJson`.
- Present on Videos, Images, and Performers.
- Used by collection filters.
- Used by category audit and usage counts.
- Treated as actual record metadata.

Managed Categories are the vocabulary source. Record Categories are the saved metadata on each record.

## 4. Lockdown Goal

The target behavior for the future implementation:

- Form category picker should only allow selecting from Managed Categories.
- Free-text category creation from forms should be disabled.
- If a category does not exist, the user should go to Category Management first.
- The form should not create new Managed Categories automatically.
- The form should not mutate records except when saving the current record.
- The form should continue saving selected categories to `categoriesJson`.
- Form save should preserve the current record save flow and only include the categories selected for that current record.

## 5. Affected Forms

The lockdown applies to category controls on these routes:

- `/videos/new`
- `/videos/:id/edit`
- `/images/new`
- `/images/:id/edit`
- `/performers/new`
- `/performers/:id/edit`

Implementation should verify the actual route parameter names in code before editing. The current app may use route names such as `:itemKey` internally, but the affected user-facing form flows are the create and edit forms for Videos, Images, and Performers.

## 6. Legacy Record Handling

Existing records may already contain Record Categories that are not present in Managed Categories.

Future implementation should handle those safely:

- Do not delete legacy categories automatically.
- Do not silently add legacy categories to Managed Categories.
- Show legacy categories as existing selected Record Categories on the form.
- Mark legacy categories as "not managed" or "record-only" if needed.
- Allow the user to remove legacy categories from the current record.
- Do not allow adding new free-text categories.
- Adding categories should still be restricted to Managed Categories.
- Full cleanup should happen through Category Management, not form auto-migration.

Recommended display model:

- Managed selected category: normal selected chip.
- Legacy record-only selected category: selected chip with a "Record-only" or "Not managed" marker.
- Available picker choices: Managed Categories only.

## 7. Empty Managed Categories State

When no Managed Categories exist:

- The form should show an empty controlled picker state.
- The form should direct the user to Category Management.
- Helper text should explain: "Create categories in Category Management first."
- Saving the record with no categories should remain allowed if categories are optional.
- The form must not fall back to free-text input.
- The form must not create a Managed Category during save.

This state should be clear but not blocking for records that do not need categories.

## 8. UX Plan

Future implementation should use a picker/chip multi-select style:

- Selected categories appear as removable chips.
- Available choices come from Managed Categories.
- Search/filter inside the picker can be added if the managed list is long.
- Category selection should be keyboard accessible.
- A link or button should open Category Management.
- Helper text should be clear: "Create categories in Category Management first."
- Legacy record-only categories should be visually distinct if present.
- Empty state should explain that no Managed Categories exist yet.

Keep the UI focused on clarity and safety. Do not add broad unrelated UI polish.

## 9. Safety Rules

Mandatory rules for future implementation:

- Do not change `categoriesJson` format.
- Do not change Managed Categories key `sakurava.managedCategories.v1`.
- Do not create relational category tables.
- Do not introduce `categoryIds` or UUID category migration.
- Do not introduce parent/child categories.
- Do not auto-create categories from form input.
- Do not mutate other records.
- Do not mutate Managed Categories from forms.
- Do not change Category Management behavior.
- Do not silently remove legacy record-only categories.
- Do not block saving a record only because categories are empty, unless a later batch explicitly makes categories required.

## 10. Future Implementation Boundaries

For the implementation batch:

- Likely create or update a reusable form category picker component.
- Reuse `getStoredManagedCategories`.
- Preserve current form save behavior.
- Preserve existing category chip behavior where possible.
- Ensure selected categories still serialize to `categoriesJson`.
- Update tests for Video, Image, and Performer new/edit forms.
- Verify restart/persistence behavior.
- Verify legacy record-only category handling.
- Verify empty Managed Categories behavior.
- Keep changes frontend-focused unless the user explicitly approves a broader batch.

Suggested implementation areas to inspect before editing:

- `src/lib/managedCategories.ts`
- `src/lib/formData.ts`
- `src/pages/FormPage.tsx`
- `src/App.test.tsx`

## 11. Non-Goals / Deferred

The following are explicitly deferred:

- Implementation in this batch.
- Categories Sidebar Page.
- Parent/child categories.
- Relational categories.
- Category analytics.
- Category import/export mapping.
- Automatic category migration.
- Broad UI polish.
- Backend/schema/Tauri/package changes.
- Any change to Category Management behavior.

## 12. Future Implementation Checklist

For the future implementation batch:

- [ ] Affected forms identified.
- [ ] Picker component behavior defined.
- [ ] Empty Managed Categories state handled.
- [ ] Legacy record-only categories handled.
- [ ] Free-text category creation removed from forms.
- [ ] Managed Categories are not mutated from forms.
- [ ] Save still writes selected category labels to `categoriesJson`.
- [ ] Current record save behavior preserved.
- [ ] Tests updated for Video new/edit forms.
- [ ] Tests updated for Image new/edit forms.
- [ ] Tests updated for Performer new/edit forms.
- [ ] Legacy record-only category tests added.
- [ ] Empty Managed Categories tests added.
- [ ] Manual smoke test plan prepared.

## 13. Agent Notes

Future agents:

- Do not implement Form Category Picker Lockdown from this planning batch.
- Do not change form code in this batch.
- Do not change category storage.
- Do not change `categoriesJson`.
- Do not change `sakurava.managedCategories.v1`.
- Do not mix this with Categories Sidebar Page.
- Do not add parent/child logic.
- Do not auto-create Managed Categories from form input.
- Read `docs/10-category-management-safety.md` and `docs/14-category-management-dedicated-page-planning.md` before implementation.
- Keep Managed Categories and Record Categories separate.

## 14. Related Documents

- [docs/10-category-management-safety.md](10-category-management-safety.md) - Category Management safety rules.
- [docs/14-category-management-dedicated-page-planning.md](14-category-management-dedicated-page-planning.md) - Category Management dedicated page planning.
- [docs/13-settings-persistence-planning.md](13-settings-persistence-planning.md) - Settings persistence planning.
- [docs/ROADMAP_LOCKED.md](ROADMAP_LOCKED.md) - Locked roadmap order.

## 15. Checkpoint

This documentation batch establishes the Form Category Picker Lockdown planning baseline.

Checkpoint tag:

```text
post-mvp-20-1-form-category-picker-lockdown-planning-v1
```
