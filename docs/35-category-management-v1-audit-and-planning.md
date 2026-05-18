# 35 - Category Management V1 Audit and Planning

## 1. Purpose

Batch 30.1 remains the official roadmap item named `Category Management V1 Planning`.

This document treats Batch 30.1 as Category Management V1 Audit + Planning because a dedicated Category Management page already exists at `/settings/category-management`, but the desired V1 direction has changed.

The approved Category Management V1 UI/UX direction is inspired by the WordPress Category Page, adapted to Sakurava's clean local desktop style. This means:

- Simple Add/Edit form.
- Inline toolbar for table navigation/filtering only.
- Full-width category table with pagination footer.
- Separate Bulk Edit area.
- Minimal safety notes.

This batch is documentation only:

- No source code implementation.
- No UI implementation.
- No storage implementation.
- No schema, database, migration, runtime, Tauri, Cargo, package, or dependency changes.
- No test changes.
- No roadmap rename, reorder, split, merge, addition, or removal.

## 2. Current Context

Sakurava is a local/offline Windows desktop app for managing Videos, Images, and Performers. The MVP persistence baseline remains:

```text
Add -> Save -> List -> Detail -> Edit -> Restart -> data persists
```

Current category standards still matter:

- Managed Categories are app-managed category configuration.
- Record Categories are labels saved on individual records in `categoriesJson`.
- Category Management is separate from the Categories browsing page.
- Settings links to the dedicated Category Management page instead of embedding full CRUD.
- 30.1 must not decide or implement a data model. 30.2 owns data model safety planning.

## 3. Revised UI/UX Direction

Category Management V1 should feel like a compact management table, not a dashboard of separate panels.

Recommended page structure:

1. Header.
2. Add / Edit Category Form.
3. Inline Toolbar.
4. Full-width Category Table.
5. Bulk Edit section.
6. Minimal Safety Notes.

Key direction changes:

- The Add / Edit Category Form becomes the main form for both add and edit mode.
- The table `Edit` action loads the selected category into the Add / Edit form.
- Category Detail should not exist as a major separate V1 section.
- Modify Records should not exist as a major V1 section.
- Bulk Edit must be separate from the toolbar.
- Record-only should disappear from normal UI because form category chips are no longer free-entry.
- Unmanaged/legacy labels found in record `categoriesJson` should be treated as legacy invalid data for deterministic automatic normalization planning in 30.2.

## 4. Existing Page Audit

### 4.1 Add or Edit Category Section

Current state:

- A section named `Add or Edit Category` already exists.
- It supports adding a Managed Category by name.
- Parent and Description / Notes controls exist visually but are disabled.
- Save Changes is disabled.
- Actual edit/rename behavior currently happens in the separate Selected Category Detail section.

Revised evaluation:

- This section should become the primary V1 Add / Edit Category Form.
- It should handle both add mode and edit mode.
- Edit mode should be entered from the table `Edit` action.
- It should include Name, Thumbnail, Parent, and Description fields.
- It should expose Add Category / Save, Delete, and Cancel actions.
- Delete should appear only when safe and require confirmation.

Preserve:

- Clear validation.
- Add behavior that does not silently mutate records.
- Status/error messages.

Change in future implementation:

- Remove fake disabled controls or make them real after 30.2 approves the data model.
- Move rename/edit into this form.
- Add thumbnail path/preview behavior only after storage is approved.
- Parent selection must include self-parent and circular validation after hierarchy storage exists.

### 4.2 Category List

Current state:

- The current list already has search, filters, sort, a table-like layout, and row actions.
- Existing columns are Category, Parent, Usage, Status, Actions.
- Parent always shows `None`.
- Existing filters include `Record-only`.
- Existing row actions include view, edit, delete, and record actions.

Revised evaluation:

- Category List should become the V1 full-width Category Table.
- The table should be the main browsing/editing surface.
- The toolbar above the table should provide Search, Filter, and Sort.
- Bulk Edit must not live in the toolbar.
- Record-only filter/status/row type should be removed from the V1 plan.
- Risky operations should not be primary row actions.

Preserve:

- Search.
- Sorting.
- Table layout.
- Empty state.

Change in future implementation:

- Use required V1 columns: Name, Parent, Description, Videos, Images, Performers, Usage, Edit.
- Name may include a small thumbnail preview if useful.
- Parent should show root/parent category clearly.
- Usage is total usage across Videos + Images + Performers.
- Edit loads the selected category into the Add / Edit form.
- Avoid many direct row actions.

### 4.3 Category Detail

Current state:

- A separate Selected Category Detail section exists.
- It shows selected category name, status, usage metrics, edit/delete/modify buttons, rename input, and delete confirmation.

Revised evaluation:

- Category Detail should be removed as a major separate V1 section.
- Basic category information should be visible in the table.
- Editable category fields should live in the Add / Edit Category Form.
- Usage counts should be table columns rather than a separate detail panel.

Preserve:

- Usage count concepts.
- Safe delete confirmation.
- No raw JSON/ID exposure.

Change in future implementation:

- Move edit/delete workflows into the Add / Edit form.
- Keep detail-like information integrated into the table and form, not a standalone page section.

### 4.4 Modify Records

Current state:

- A dedicated Modify Records section exists.
- It supports record category rename/remove with preview and confirmation.
- It applies `categoriesJson`-only record patches.

Revised evaluation:

- Modify Records should not remain as a major V1 user-facing section.
- Normal V1 should not ask the user to manually clean up record-level category labels.
- Record-level cleanup/normalization should be planned as automatic and deterministic.
- The exact cleanup timing, validation, and safety rules belong in Batch 30.2 before implementation.

Preserve as planning constraints:

- Any future record normalization must use safe `categoriesJson`-only rules.
- Unrelated record fields must be preserved.
- No hidden broad mutation without 30.2-approved safety boundaries.

Change in future implementation:

- Remove the normal Modify Records section from V1.
- Do not replace it with a manual Record-only cleanup workflow.
- If a later maintenance tool is needed, plan it separately.

### 4.5 Safety Notes

Current state:

- Safety Notes exist as a separate section.
- They explain record changes require preview and confirmation and media files are not changed.

Revised evaluation:

- Safety Notes should be minimized.
- Do not create a long safety section unless essential.
- Essential safety can be shown near relevant workflows, especially Bulk Edit and Thumbnail fields.

Minimal safety coverage:

- Bulk edit requires validation, preview, and confirmation.
- Thumbnail uses local path/reference only.
- No file scan, watcher, copy, move, delete, or thumbnail generation.
- Record category normalization must use safe `categoriesJson`-only rules after Batch 30.2 defines them.
- No schema/storage/package changes without an approved batch.

## 5. Final V1 Planned Structure

### 5.1 Header

Content:

- Title: `Category Management`.
- Subtitle: concise explanation that this page manages Categories used by Videos, Images, and Performers.

Rules:

- Keep the header simple.
- Do not use dashboard cards for status.
- Do not expose raw storage details.

### 5.2 Add / Edit Category Form

Fields:

- Name.
- Thumbnail.
- Parent.
- Description.

Actions:

- Add Category / Save.
- Delete.
- Cancel.

Rules:

- This form handles both add and edit mode.
- Add mode creates a category after validation.
- Edit mode is triggered from the table `Edit` action.
- Save updates the selected category after validation.
- Delete is available only when safe and requires confirmation.
- Cancel exits edit mode and clears unsaved values.
- Thumbnail is a path/reference only.
- No image binary embedding.
- No file copy, move, delete, or thumbnail generation.
- Parent selection is planning-only until 30.2 defines storage and validation.

### 5.3 Inline Toolbar

The toolbar is only for table navigation/filtering:

- Search.
- Filter.
- Sort.

Rules:

- Do not put Bulk Edit in the toolbar.
- Do not put pagination controls in the toolbar.
- Do not include risky actions in the toolbar.
- Do not include Record-only filter.
- Filters should align with V1 status values.

Preferred status values:

- Active.
- Unused.
- Has children.
- Missing thumbnail.
- Invalid / Needs review only if absolutely necessary for validation.

Do not use:

- Record-only.

### 5.4 Category Table

The table should be full width.

Required columns:

- Name.
- Parent.
- Description.
- Videos.
- Images.
- Performers.
- Usage.
- Edit.

Column rules:

- Name may include a small thumbnail preview if useful.
- Parent should show root/parent category clearly.
- Description should be concise and truncate/wrap safely.
- Videos, Images, and Performers show per-type usage counts.
- Usage is total usage across Videos + Images + Performers.
- Edit loads the selected category into the Add / Edit form.

Behavior rules:

- Avoid too many direct row actions.
- Risky operations should not be primary row actions.
- Delete belongs in the Add / Edit form in edit mode, not as a prominent table action.
- Search/filter should show parent context when hierarchy exists.
- Pagination is required for V1 and belongs inside the Category Table area.

Pagination footer:

- Place the pagination footer below the full-width Category Table.
- Show range text, for example: `Showing 1-25 of 120 categories`.
- Include Previous / Next controls.
- Include page number controls if useful.
- Include rows per page selector.
- Default rows per page: 25.
- Rows per page options: 25, 50, 100.
- Pagination must work together with search, filter, and sort.
- Pagination is part of the Category Table, not a separate section.
- Bulk Edit must not be placed in pagination or the toolbar.

### 5.5 Bulk Edit

Bulk Edit must be a separate section.

Required actions:

- Export.
- Import.

CSV-first workflow:

- Export CSV template.
- Import CSV.
- Validate.
- Show error report.
- Show preview.
- Require confirmation box before apply.

XLSX rule:

- Direct `.xlsx` support is deferred if it increases scope significantly.
- `.xlsx` may only be included if it safely reuses the same CSV validation, preview, confirmation, and apply pipeline without risky package, schema, runtime, or data model changes.
- If `.xlsx` requires a new package or separate parser complexity, defer it.

Bulk file content rule:

- Thumbnail/images should not be embedded.
- Only thumbnail path values may be included.

### 5.6 Minimal Safety Notes

Keep safety notes concise and close to relevant actions.

Essential notes:

- Bulk edit requires validation, preview, and confirmation.
- Thumbnail uses local path/reference only.
- No file scan, watcher, copy, move, delete, or thumbnail generation.
- Record category normalization must use safe `categoriesJson`-only rules after Batch 30.2 defines them.
- No schema/storage/package changes without an approved batch.

## 6. Parent/Child Category Planning

Parent/child categories are in scope for V1 planning.

Required concepts:

- Root category: category with no parent.
- Child category: category with one parent.
- Parent selection in the Add / Edit form.
- Moving a category to another parent.
- Prevent self-parent.
- Prevent circular parent relationships.
- Display parent in the table.
- Search/filter with parent context.

Recommended V1 behavior:

- The table should show `Root` or the parent category clearly.
- Search should match category name, parent name, and possibly full path.
- Moving a parent should be an explicit edit/save action, not an inline row gesture.
- Circular validation must happen before save.
- Duplicate-name policy should be decided in 30.2. Recommended initial rule: globally unique names until stable identity/path rules are approved.

Impact on form category picker:

- The picker should show hierarchy context.
- Search should match parent and child categories.
- Chips may stay short if names are globally unique.
- If duplicate names under different parents are ever allowed, chips must show full path or parent context.

Impact on collection filters:

- Exact category filtering is safest for initial V1.
- Parent includes children should be planned as an explicit option only after 30.2 defines query semantics and UI copy.

## 7. Category Thumbnail Planning

Category thumbnails are in scope for V1 planning.

Required behavior:

- Thumbnail path field.
- Thumbnail preview.
- Thumbnail fallback.
- Replace thumbnail.
- Clear thumbnail.
- Thumbnail shown in the table if useful.
- Store thumbnail as path/reference only.

Guardrails:

- No image binary embedding.
- No file copy.
- No file move.
- No file delete.
- No thumbnail generation.
- No folder scan.
- No watcher.
- No recursive discovery.

30.2 must decide:

- Where thumbnail path metadata is stored.
- Whether manual path input is enough for initial V1.
- Whether a safe local image picker can be included later without expanding runtime scope.
- How broken/missing thumbnail paths are represented.
- How backup/restore explains external thumbnail files.

## 8. Bulk Edit CSV/XLSX Planning

Bulk Edit is a separate V1 section, not part of the toolbar.

CSV-first workflow:

1. Export CSV template.
2. Import CSV.
3. Validate all rows.
4. Show error report.
5. Show preview.
6. Require confirmation before apply.
7. Apply only after validation and confirmation.
8. Show result summary.

Recommended CSV columns:

```csv
operation,name,newName,parentName,description,thumbnailPath,deleteIfUnused
add,Drama,,Root,Story-focused videos,C:\Media\category-thumbnails\drama.jpg,false
update,Drama,,Movies,Story-focused catalog,C:\Media\category-thumbnails\drama-new.jpg,false
delete_unused,Unused Category,,,,,true
```

Supported operations to evaluate in 30.2:

- Add category.
- Update name.
- Set parent.
- Set description.
- Set thumbnail path.
- Mark delete unused.

Blocked from default V1 unless separately approved:

- Embedding thumbnail/image files.
- Bulk record category mutation from import.
- Cascade delete through children.
- Merge/split categories.
- Partial apply with mixed success/failure.

XLSX rule:

- Direct `.xlsx` support is conditional.
- It may be included only if it reuses the same validation, preview, confirmation, and apply pipeline.
- Defer `.xlsx` if it requires a new package, separate parser complexity, schema changes, runtime changes, or data model changes.

## 9. Record-Only Removal Plan

Record-only should disappear from normal Category Management V1 UI.

Do not plan:

- Record-only status.
- Record-only filter.
- Record-only row type.
- Manual Record-only cleanup workflow.
- Modify Records section for normal V1.

Reason:

- Form category chips are no longer free-entry.
- Categories should come from Category Management.
- Unmanaged labels found in record `categoriesJson` should be treated as legacy invalid data, not a normal category type.

30.2 handoff:

- Define deterministic automatic normalization for unmanaged/legacy record category labels.
- Define when normalization runs.
- Define whether normalization is previewed, blocked, logged, or applied as part of approved category operations.
- Define exact safe `categoriesJson`-only rules.
- Preserve unrelated record fields.

30.1 does not decide the cleanup timing or implement normalization.

## 10. Data Model Handoff To 30.2

30.2 must decide:

- Parent/child storage model.
- Thumbnail path storage.
- Description storage.
- Unmanaged category automatic normalization model.
- CSV import/export validation model.
- Whether localStorage extension is enough.
- Whether SQLite is needed.
- Whether any schema changes are required.
- Whether any package changes are required.
- Whether existing `sakurava.managedCategories.v1` data needs migration.
- How record `categoriesJson` remains compatible with managed category metadata.
- Whether stable identity can use name/slug/path or needs an internal ID.

30.1 recommendation candidates:

- Candidate A: extend localStorage to structured category objects.
- Candidate B: move managed category metadata to SQLite while keeping record categories in `categoriesJson`.
- Candidate C: keep storage flat temporarily and implement only non-hierarchical table/form cleanup.

Preliminary recommendation:

- 30.2 should seriously evaluate SQLite-backed category metadata because parent/child, thumbnail path, description, CSV import/export, and backup/restore compatibility are metadata-heavy.
- Do not force an immediate switch from `categoriesJson` labels to `categoryIds`.

## 11. Batch Fit Analysis

Official roadmap sequence remains unchanged:

- 30.2 - Category Management Data Model Safety Plan.
- 30.3 - Category Management CRUD Implementation.
- 30.4 - Category Management Table + Detail + Pagination.

Interpretation update:

- Since Category Detail is no longer desired as a separate V1 section, `30.4 - Category Management Table + Detail + Pagination` should be interpreted as table/detail information integrated into the full-width table and Add / Edit form, unless the user later approves renaming or reframing the roadmap item.

Fit by feature:

| Feature | 30.2 planning | 30.3 implementation | 30.4 implementation | Needs additional approved sub-batch |
| --- | --- | --- | --- | --- |
| Add/Edit form structure | Yes | Yes, if model is settled | Refine only | No |
| Name field | Yes | Yes | Table display | No |
| Description field | Yes | Yes, if storage approved | Table display | Maybe if storage changes are large |
| Parent selection | Yes | Only if hierarchy model approved | Table parent display | Likely if hierarchy expands |
| Thumbnail path | Yes | Only if storage approved | Table preview/fallback | Maybe if picker work expands |
| Delete safe category | Yes | Yes, with confirmation | No | No |
| Inline toolbar | Yes | No | Yes | No |
| Full-width table | Yes | No | Yes | No |
| Pagination footer with range, Previous / Next, optional page numbers, and rows per page | Yes | No | Yes | No |
| Bulk CSV export/import | Yes | Not default | Not default | Yes |
| XLSX support | Yes | No by default | No by default | Yes if package/parser needed |
| Record-only removal/normalization | Yes | Only if 30.2 approves safe rules | Display no Record-only UI | Likely if record mutation needed |

Fit conclusion:

- 30.2 can safely plan the data model, normalization, parent/child, thumbnail, description, and bulk validation pipeline.
- 30.3 can implement CRUD only after 30.2 defines storage and safety.
- 30.4 can implement the integrated table/detail information and required table pagination.
- Bulk Edit apply, XLSX parsing, and automatic record normalization may need additional approved sub-batches if they cannot fit safely.

## 12. Acceptance Criteria For Batch 30.1

- Existing Category Management page is audited against the revised V1 direction.
- WordPress-inspired structure is documented without copying WordPress directly.
- Add / Edit Category Form is the main form.
- Inline Toolbar is limited to Search, Filter, and Sort.
- Category Table is full width and includes the required columns.
- Category Table pagination footer is planned with range text, Previous / Next, optional page numbers, rows per page selector, default 25 rows, and 25/50/100 options.
- Category Detail is no longer planned as a separate major section.
- Modify Records is no longer planned as a separate major section.
- Record-only is removed from normal V1 planning.
- Parent/child categories are planned.
- Category thumbnails are planned.
- Bulk Edit is planned as a separate section.
- CSV-first and conditional XLSX rules are documented.
- 30.2 data model handoff is documented.
- Batch fit analysis preserves roadmap sequence.
- Git diff is documentation-only.

## 13. Related Documents

- [docs/10-category-management-safety.md](10-category-management-safety.md)
- [docs/14-category-management-dedicated-page-planning.md](14-category-management-dedicated-page-planning.md)
- [docs/15-form-category-picker-lockdown-planning.md](15-form-category-picker-lockdown-planning.md)
- [docs/16-categories-sidebar-page-planning.md](16-categories-sidebar-page-planning.md)
- [docs/28-ui-ux-v1-audit-prioritization-plan.md](28-ui-ux-v1-audit-prioritization-plan.md)
- [docs/34-settings-page-v1-information-architecture.md](34-settings-page-v1-information-architecture.md)

## 14. Expected Checkpoint

Expected checkpoint tag after merge:

```text
post-mvp-30-1-category-management-v1-planning-v1
```
