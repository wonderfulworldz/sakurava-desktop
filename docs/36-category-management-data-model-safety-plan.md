# 36 - Category Management Data Model Safety Plan

## 1. Purpose

Batch 30.2 is the documentation-only data model safety plan for Category Management V1.

This plan follows `docs/35-category-management-v1-audit-and-planning.md` and keeps the official roadmap sequence unchanged:

- 30.2 - Category Management Data Model Safety Plan.
- 30.3 - Category Management CRUD Implementation.
- 30.4 - Category Management Table + Detail + Pagination.

This batch does not implement:

- source code changes;
- UI changes;
- database/schema changes;
- migrations;
- runtime/Tauri changes;
- package/dependency changes;
- tests.

## 2. V1 Data Model Problem

Category Management V1 needs metadata that the current Managed Categories storage cannot safely represent.

Current state:

- Managed Categories are stored in `localStorage` key `sakurava.managedCategories.v1`.
- Current stored shape is a string array.
- Record-level categories are stored on Videos, Images, and Performers in `categoriesJson`.
- Category Picker and Collection filters depend on text category labels.

V1 needs:

- Name.
- Parent.
- Description.
- Thumbnail path.
- Created/updated timestamps.
- CSV import/export validation.
- Deterministic handling for legacy unmanaged labels found in `categoriesJson`.

Primary safety principle:

- Keep `categoriesJson` compatible and do not force an immediate switch to `categoryIds`.
- If stable internal category identity is needed, hide it from UI and preserve text-label compatibility until a later approved migration says otherwise.

## 3. Managed Category Metadata Model Options

### 3.1 Option A - Structured localStorage

Description:

- Keep Managed Category metadata in localStorage.
- Migrate from `string[]` to structured objects.
- Preserve the existing key or introduce a versioned key such as `sakurava.managedCategories.v2`.

Possible shape:

```ts
type ManagedCategoryV2 = {
  key: string;
  name: string;
  parentKey: string | null;
  description: string;
  thumbnailPath: string;
  createdAt: string;
  updatedAt: string;
};
```

Benefits:

- No schema/database migration.
- No backend/runtime changes.
- Faster implementation path.
- Existing localStorage migration can be defensive and local.

Risks:

- Backup/Restore may not include localStorage-backed metadata unless the current backup system explicitly captures it.
- localStorage is easier to corrupt or clear outside the database lifecycle.
- CSV import/export and hierarchy validation become frontend-only state operations.
- Harder to keep category metadata consistent with future SQLite-backed catalog maintenance.

Migration difficulty:

- Medium.
- Existing `string[]` can migrate into structured objects with generated stable keys.
- Corrupt values must parse as an empty safe default or recover valid string labels only.

Backup/Restore impact:

- Risky unless backup/restore includes localStorage.
- Restoring the SQLite database without localStorage could lose Category Management metadata.

Compatibility:

- Existing Managed Categories: good if migration is defensive.
- `categoriesJson`: good if `name` remains the record-facing label.
- Category Picker: good if picker reads structured metadata and displays `name` with hierarchy context.
- Collection filters: good if filters continue matching `categoriesJson` labels exactly.

Suitability:

- Parent/child: acceptable for a small local app, but less robust.
- Thumbnail path: acceptable as explicit text path.
- Description: acceptable.
- CSV import/export: acceptable for metadata-only operations, but apply failure/rollback is harder.

### 3.2 Option B - SQLite Managed Category Metadata

Description:

- Store Managed Category metadata in SQLite.
- Keep record-level categories in `categoriesJson` for compatibility.
- Add a category metadata table only after a future approved implementation batch.

Potential table concept:

```text
managed_categories
- key
- name
- parent_key
- description
- thumbnail_path
- created_at
- updated_at
```

This is planning only. No table is created in Batch 30.2.

Benefits:

- Category metadata joins the main persisted catalog data lifecycle.
- Backup/Restore is safer if backups already capture SQLite.
- Better fit for parent/child validation, CSV import/export, timestamps, and future maintenance.
- Easier to test and validate as deterministic data.

Risks:

- Requires schema and migration work in a later approved batch.
- Requires careful migration from localStorage.
- Increases implementation scope for 30.3.
- Must avoid converting record categories to `categoryIds` prematurely.

Migration difficulty:

- Medium to high.
- Must migrate existing localStorage labels into SQLite metadata without losing labels.
- Must not mutate records during metadata migration.
- Must keep app safe if localStorage and SQLite metadata temporarily disagree during transition.

Backup/Restore impact:

- Stronger than localStorage if backup/restore includes SQLite database.
- Thumbnail files remain external paths and are not included as media files.

Compatibility:

- Existing Managed Categories: good with explicit migration.
- `categoriesJson`: good if `name` remains the record-facing label.
- Category Picker: good if it reads SQLite metadata and serializes selected `name` labels to `categoriesJson`.
- Collection filters: good if filters continue exact label matching.

Suitability:

- Parent/child: best V1 candidate.
- Thumbnail path: best V1 candidate.
- Description: best V1 candidate.
- CSV import/export: best V1 candidate.

### 3.3 Option C - Hybrid / Defer Metadata Storage

Description:

- Keep the current localStorage `string[]`.
- Implement only table/form cleanup that does not require parent, thumbnail, or description persistence.
- Defer hierarchy, thumbnail, description, and bulk apply.

Benefits:

- Lowest immediate implementation risk.
- No migration.
- Preserves current behavior.

Risks:

- Does not satisfy the approved V1 direction.
- Parent, thumbnail, description, and CSV import/export remain fake or disabled.
- Increases chance of another redesign batch before V1 is complete.

Migration difficulty:

- Low now, but delayed.

Backup/Restore impact:

- Same risks as current localStorage model.

Compatibility:

- Existing app compatibility is high, but V1 feature compatibility is poor.

Suitability:

- Parent/child: not suitable.
- Thumbnail path: not suitable.
- Description: not suitable.
- CSV import/export: limited to flat name lists only.

### 3.4 Recommendation

Recommended storage model:

- Use SQLite-managed category metadata for Category Management V1, while keeping record-level category labels in `categoriesJson`.

Rationale:

- Parent/child, thumbnail path, description, timestamps, CSV import/export, and backup/restore are metadata-heavy.
- SQLite keeps category metadata with the catalog data lifecycle.
- It avoids making localStorage the long-term owner of important catalog management state.
- It can still preserve `categoriesJson` compatibility by treating category `name` as the record-facing label.

Implementation caution:

- This recommendation requires future user approval for schema/migration implementation.
- Batch 30.2 does not implement the table, migration, commands, or UI.

## 4. Required Category Metadata Fields

Minimum V1 metadata:

```text
key
name
parentKey
description
thumbnailPath
createdAt
updatedAt
```

Field rules:

- `key`: stable internal identity, not shown in UI.
- `name`: user-facing label and `categoriesJson` compatibility label.
- `parentKey`: nullable reference to another managed category key.
- `description`: plain text only.
- `thumbnailPath`: explicit local path/reference only.
- `createdAt`: ISO-like timestamp generated by app.
- `updatedAt`: ISO-like timestamp updated by app.

Identity analysis:

- Name-only identity is simple but fragile for rename and parent moves.
- Slug/path identity is readable but changes when names or parents change unless frozen.
- Internal stable key is safest for parent/child links and CSV validation.

Recommendation:

- Use a stable internal `key`.
- Keep names globally unique in V1.
- Do not expose raw keys in UI.
- Continue writing category names to record `categoriesJson`.

Why not `categoryIds` now:

- Record-level storage currently uses text labels.
- Switching records to category IDs would affect forms, filters, existing records, tests, backup/restore, and category audit.
- A record-level `categoryIds` migration should require a later explicit architecture batch if ever needed.

## 5. Parent/Child Safety Rules

Root representation:

- `parentKey: null` means Root.
- UI should display `Root`, not a raw null value.

Parent selection:

- Parent selector lists existing categories except the category being edited.
- Parent selector includes Root / No parent.
- Parent selector should show hierarchy context.

Move parent rules:

- Moving a category to Root is allowed.
- Moving a category under another category is allowed only after validation.
- Moving a category must not mutate records by default.
- Moving a category changes metadata only.

Self-parent prevention:

- A category cannot select itself as parent.

Circular prevention:

- A category cannot move under any of its descendants.
- Validation must walk the parent chain before save/import apply.

Duplicate-name rule:

- Recommended V1 policy: globally unique category names.
- Duplicate names under different parents should be deferred.

Reason:

- Global uniqueness keeps `categoriesJson` label matching unambiguous.
- It keeps Category Picker chips readable.
- It avoids forcing full path labels into record categories.

Path display:

- UI can display path/breadcrumb derived from parent chain.
- Path is display-only, not the record storage value.
- Example: `Root / Media / Drama`.

Parent rename:

- Renaming a parent updates derived display paths automatically.
- Child records do not need mutation because paths are metadata-derived.

Parent delete:

- Recommended V1 rule: parent delete requires no children and zero usage.
- If a parent has children, block delete and ask the user to move or delete children first.
- Do not cascade delete in V1.

Children under unused parent:

- Allowed.
- A parent with children is not considered safely deletable even if its own usage count is zero.

Filtering:

- Exact category filtering by default.
- Parent includes children is deferred unless a later batch explicitly adds and tests that behavior.

## 6. Thumbnail Safety Rules

Storage:

- Store `thumbnailPath` as a string on Managed Category metadata.
- Empty string means no thumbnail.

Manual path vs picker:

- Manual path is the lowest-risk baseline.
- A safe image picker may be added later if it only writes an explicit selected path and does not mutate files.

Preview fallback:

- Show thumbnail preview when path is present and renderable.
- Show missing thumbnail fallback when path is empty.
- Show broken thumbnail fallback when path cannot render.

Missing file behavior:

- Missing files should not block opening Category Management.
- Missing files should not trigger scanning.
- Missing files should not delete or rewrite the saved path automatically.

Clear thumbnail:

- Clears `thumbnailPath` metadata only.
- Does not delete files.

Replace thumbnail:

- Replaces `thumbnailPath` metadata only.
- Does not copy, move, delete, or generate files.

Backup/Restore note:

- Thumbnail paths point to external files.
- Backup/Restore must not imply thumbnail image files are included unless a later backup format explicitly includes media files.

Hard guardrails:

- No binary image storage.
- No file scan.
- No watcher.
- No file copy.
- No file move.
- No file delete.
- No thumbnail generation.

## 7. Description Safety Rules

Storage:

- Store description as plain text.
- Recommended max length: 500 characters for V1.

Rendering:

- No rich text.
- No HTML rendering.
- No markdown rendering unless a later batch explicitly adds a safe renderer.
- Escape text in UI through normal React text rendering.

Table display:

- Truncate or wrap safely.
- Do not let long descriptions break table layout.
- Full value remains editable in the Add / Edit form.

CSV import:

- Trim leading/trailing whitespace.
- Preserve internal newlines only if CSV parsing and table display handle them safely; otherwise normalize newlines to spaces.

## 8. Automatic Legacy Category Normalization

Record-only must not be a user-facing concept in V1.

Definition:

- Any label found in record `categoriesJson` that does not match a Managed Category name is a legacy invalid label.

Non-goals:

- Do not show Record-only status.
- Do not show Record-only filter.
- Do not show Record-only rows.
- Do not add a manual Record-only cleanup workflow.

Timing options:

### A. On app start

Benefits:

- Cleans data early.

Risks:

- Hidden mutation at startup.
- Harder to explain or preview.
- Risky after restore.

Recommendation:

- Do not use for V1.

### B. When Category Management opens

Benefits:

- Context is relevant.

Risks:

- Still surprising if it mutates immediately.
- Could slow page load.

Recommendation:

- Use only for detection and summary, not automatic apply.

### C. When category data refreshes

Benefits:

- Keeps audit current.

Risks:

- Hidden mutation risk if apply is automatic.

Recommendation:

- Use only for recalculating invalid label counts.

### D. When record is saved

Benefits:

- Narrow mutation: only the record being saved.
- Fits existing form save flow.
- Avoids broad background cleanup.

Risks:

- Legacy data disappears gradually, not all at once.
- User may not understand why unmanaged chips are removed unless forms communicate it.

Recommendation:

- Safe for per-record normalization after 30.2 rules are implemented.

### E. Manual developer/admin maintenance only

Benefits:

- Avoids hidden mutation.

Risks:

- Does not meet the no per-category user intervention preference.
- Leaves legacy data indefinitely.

Recommendation:

- Keep as fallback for exceptional repair, not normal V1.

### 8.1 Recommended Normalization Strategy

Recommended V1 strategy:

- Detect unmanaged labels when Category Management opens or category data refreshes.
- Show only a concise internal/technical summary if needed, such as affected count.
- Do not show unmanaged labels as categories.
- Do not require per-category user intervention.
- Do not silently mutate all records on page open.
- Normalize record categories deterministically when a record is saved.
- For bulk normalization across existing records, require one-time confirmation after a backup recommendation.

One-time confirmation:

- Required before broad existing-record normalization.
- Confirmation should state that only `categoriesJson` labels not present in Managed Categories will be removed.
- Confirmation should include affected record count by Videos, Images, and Performers.

Backup/Restore warning:

- Broad normalization should recommend creating a backup first.
- It should not run automatically immediately after restore.

Preview/internal summary:

- Show affected counts.
- Avoid a normal Record-only category list.
- If examples are needed, present them as validation/maintenance details, not as categories.

Apply rules:

- Patch only `categoriesJson`.
- Preserve unrelated fields.
- Remove unmanaged labels.
- Trim labels.
- Remove blank labels.
- Dedupe case-insensitively.
- Preserve first valid managed label order.
- Empty result becomes `[]`.
- Invalid JSON parses as `[]` for normalization only after confirmation or current-record save.
- Invalid JSON must not crash the app.

Case variants:

- Match Managed Category names case-insensitively.
- Normalize saved labels to the Managed Category display name.

## 9. CSV-First Bulk Edit Data Model

Bulk Edit is metadata-focused and separate from the toolbar.

Required columns:

```csv
operation,name,newName,parentName,description,thumbnailPath,deleteIfUnused
```

Required by operation:

- `operation`: always required.
- `name`: always required.
- `newName`: required for rename, optional otherwise.
- `parentName`: optional, empty means Root or unchanged depending on operation.
- `description`: optional.
- `thumbnailPath`: optional.
- `deleteIfUnused`: required for delete_unused.

Supported operations:

- `add`
- `update`
- `rename`
- `set_parent`
- `set_description`
- `set_thumbnail`
- `delete_unused`

Validation rules:

- File must parse as rows and columns.
- Required columns must exist.
- Unknown columns may warn but should not block unless they conflict.
- Unknown operations fail validation.
- Names must be nonblank.
- Names must pass global uniqueness rules.
- Parent name must exist or be created earlier in the same valid import.
- Self-parent fails validation.
- Circular parent chain fails validation.
- Delete unused fails if category has record usage or children.
- Thumbnail path is text only; no image embedding.
- Description must follow plain-text length rules.

Dry-run / preview:

- Import must validate before apply.
- Preview shows proposed adds, updates, renames, parent changes, description changes, thumbnail path changes, and delete-unused actions.
- Preview must show errors and warnings before confirmation.

Error report:

- Include row number.
- Include field.
- Include issue.
- Include recommended fix where concise.

Confirmation:

- Required before apply.
- Should summarize counts by operation.
- Should recommend backup before apply.

Apply model:

- Apply only after validation succeeds.
- Recommended V1 rule: no partial apply.
- If any row has blocking errors, apply is disabled.
- Apply mutates Managed Category metadata only unless a later explicitly approved normalization operation is included.

Rollback / backup:

- Do not implement hidden rollback in 30.2 planning.
- Recommend backup before apply.
- If SQLite metadata is used, a future implementation can consider transactional apply.

Blocked operations:

- Embedded thumbnail/image files.
- File mutation.
- Folder scan.
- Category merge/split.
- Cascade delete.
- Bulk record category mutation from CSV by default.
- Direct manipulation of raw keys or IDs in user-authored CSV.

## 10. XLSX Conditional Rule

XLSX is deferred by default.

Allowed only if:

- It reuses the same validation, preview, confirmation, and apply pipeline as CSV.
- It does not require schema changes.
- It does not require runtime changes.
- It does not require data model changes.
- It does not require a risky package change.

If a package is needed:

- Recommend a separate approved sub-batch.
- Include package review, build verification, and import parser tests in that later batch.

Preferred V1:

- CSV-first.
- Users can export from spreadsheet tools to CSV.

## 11. Backup/Restore Impact

If metadata stays localStorage:

- Backup/Restore may miss Category Management metadata.
- Restoring catalog data could leave category metadata stale or missing.
- User could lose parent, description, and thumbnail metadata outside SQLite backup.

If metadata moves to SQLite:

- Backup/Restore improves because category metadata follows the catalog database.
- Migration must preserve existing localStorage Managed Categories.
- Restore should include category metadata if it restores the database.

Thumbnail paths:

- Thumbnail image files remain external local files.
- Backups should state thumbnail files are not included unless a later media-inclusive backup format is approved.
- Restored thumbnail paths may point to missing files on a different machine or folder.

Bulk import:

- Recommend backup before apply.
- If SQLite is used, future implementation should consider transactional import apply.

Migration safety:

- Existing Managed Category labels must not be lost.
- Migration must be idempotent or safely detect already-migrated state.
- Migration must not mutate record `categoriesJson` unless a separately approved normalization step runs.

## 12. Compatibility With Current App

Category Picker:

- Should read Managed Category metadata.
- Should display hierarchy context.
- Should still save selected category names to `categoriesJson`.
- Should not expose internal keys.

Form category lockdown:

- Compatible if Managed Categories remain the only selectable source.
- Legacy unmanaged labels on existing records should be treated as invalid legacy labels, not picker options.

Collection filters:

- Continue exact matching against `categoriesJson` labels.
- Parent includes children is deferred.
- If hierarchy exists, parent/child context can affect display but not default filtering semantics.

Categories page:

- Browse/discovery page should use record usage counts from `categoriesJson`.
- Managed Category metadata can enrich display later.
- It should not become management UI.

Settings Category Management link:

- Remains valid.
- Settings should not embed CRUD.

Existing records:

- Existing `categoriesJson` stays compatible.
- No immediate `categoryIds` migration.
- Invalid JSON must not crash category views.

Tests expected later:

- Metadata migration from string list.
- Parent/self/circular validation.
- Duplicate-name validation.
- Thumbnail path clear/replace without file mutation.
- Description plain-text handling.
- CSV validation and no partial apply.
- Category Picker compatibility.
- Collection filter exact match compatibility.
- Normalization `categoriesJson`-only patches.

## 13. Recommended Implementation Boundaries

### 13.1 Batch 30.3 - CRUD Implementation

Recommended scope:

- Implement approved metadata storage.
- Migrate existing Managed Categories safely.
- Implement Add / Edit Category form data operations.
- Implement Name, Parent, Description, Thumbnail path metadata.
- Implement safe delete only when no usage and no children.
- Implement validation for global names, parent selection, self-parent, circular parent.
- Keep record `categoriesJson` compatible.

Not recommended in 30.3 unless explicitly approved:

- CSV apply.
- XLSX import.
- Broad legacy record normalization.
- Parent-includes-children filtering.
- Category IDs in records.

### 13.2 Batch 30.4 - Table + Integrated Detail + Pagination

Interpretation:

- Since Category Detail is no longer desired as a separate section, 30.4 should mean:
  - full-width Category Table;
  - integrated detail information in table columns and Add / Edit form;
  - pagination footer;
  - search, filter, sort, and pagination working together.

Recommended scope:

- Table columns: Name, Parent, Description, Videos, Images, Performers, Usage, Edit.
- Thumbnail preview in Name column if safe.
- Parent display as Root or parent/path context.
- Pagination footer with range, Previous / Next, optional page numbers, rows per page default 25, options 25/50/100.
- No Record-only UI.

Not recommended in 30.4 unless explicitly approved:

- Bulk Edit apply.
- XLSX support.
- Broad record normalization apply.

### 13.3 Recommended Extra Sub-Batches

Recommend additional approved sub-batches if needed:

- Category metadata SQLite migration implementation, if too large for 30.3.
- CSV Bulk Edit implementation.
- XLSX import support, only if a package/parser is approved.
- Broad legacy `categoriesJson` normalization apply, if not safely included in 30.3.

These are recommendations only. This document does not change the roadmap.

## 14. Final Recommendation

Recommended storage model:

- SQLite-managed category metadata, with a safe migration from current localStorage Managed Categories.

Recommended identity strategy:

- Use a stable internal `key` for metadata and parent links.
- Keep globally unique names in V1.
- Continue storing record categories as names in `categoriesJson`.
- Do not expose raw keys/IDs in UI.
- Do not switch records to `categoryIds` in V1.

Recommended normalization strategy:

- Remove Record-only from normal UI.
- Treat unmanaged record labels as legacy invalid data.
- Detect and summarize invalid labels without showing them as categories.
- Normalize current-record categories on record save after rules are implemented.
- Require one-time confirmation and backup recommendation before broad existing-record normalization.
- Use `categoriesJson`-only patches and preserve unrelated fields.

Recommended CSV/XLSX strategy:

- CSV-first.
- Validate, preview, report errors, confirm, then apply.
- No partial apply in V1.
- No embedded images.
- Thumbnail path values only.
- Defer XLSX unless it reuses the CSV pipeline without risky package/schema/runtime/data model changes.

Must be implemented in 30.3:

- Approved metadata storage and migration.
- Add / Edit Category form CRUD.
- Parent/child validation.
- Thumbnail path and description metadata if storage is approved.
- Safe delete guardrails.

Must be implemented in 30.4:

- Full-width Category Table.
- Integrated detail information through table/form, not separate Category Detail.
- Required pagination footer.
- Search/filter/sort/pagination integration.
- No Record-only UI.

Needs user confirmation before implementation:

- Any schema/database migration.
- Moving metadata from localStorage to SQLite.
- Any package addition for XLSX.
- Any broad existing-record normalization.
- Any future switch from `categoriesJson` names to `categoryIds`.
- Any parent-includes-children filter behavior.

## 15. Acceptance Criteria For Batch 30.2

- Storage options are evaluated.
- Recommended data model is documented.
- Required metadata fields are documented.
- Parent/child safety rules are documented.
- Thumbnail safety rules are documented.
- Description safety rules are documented.
- Legacy unmanaged category normalization is documented.
- CSV-first bulk edit data model is documented.
- XLSX conditional rule is documented.
- Backup/Restore impact is documented.
- Current app compatibility is documented.
- 30.3 and 30.4 implementation boundaries are documented.
- Roadmap sequence is not changed.
- Git diff is documentation-only.

## 16. Related Documents

- [docs/35-category-management-v1-audit-and-planning.md](35-category-management-v1-audit-and-planning.md)
- [docs/10-category-management-safety.md](10-category-management-safety.md)
- [docs/12-backup-restore-ux-safety.md](12-backup-restore-ux-safety.md)
- [docs/15-form-category-picker-lockdown-planning.md](15-form-category-picker-lockdown-planning.md)
- [docs/16-categories-sidebar-page-planning.md](16-categories-sidebar-page-planning.md)

## 17. Expected Checkpoint

Expected checkpoint tag after merge:

```text
post-mvp-30-2-category-management-data-model-safety-plan-v1
```
