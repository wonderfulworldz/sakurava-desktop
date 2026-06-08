# Batch 35.7.3 - Glossary Storage Safety Plan / Data Model

## Scope

This is a docs-only storage and data-model safety plan. No storage, schema, migration, runtime command, Tauri command, CRUD UI, test, route, sidebar, catalog, or Settings behavior is implemented here.

Source of truth:

- `docs/audits/35-7-glossary-library-audit.md`
- `docs/43-final-product-sequential-plan.md`
- `docs/CURRENT_ROADMAP.md`
- `docs/CURRENT_PRODUCT_PLAN.md`
- `docs/PROJECT_STATUS.md`
- Existing SQLite schema and runtime patterns in `src-tauri/src/database.rs`
- Existing CRUD command patterns in `src-tauri/src/commands.rs`
- Existing frontend schema/contracts in `src/backend/`

Completed work to preserve:

- 35.7.1 Glossary Library Audit + Implementation Plan
- 35.7.2 Glossary Route + Sidebar Shell
- 35.2 through 35.6 final product work

## Current Database And Storage Pattern Summary

Current SQLite database:

- Runtime database file: `sakurava.sqlite`.
- Runtime app data folder: `app.sakurava.desktop`.
- Rust schema constants live in `src-tauri/src/database.rs`.
- TypeScript schema mirrors live table definitions in `src/backend/schema.ts`.
- Runtime schema initialization uses `CREATE TABLE IF NOT EXISTS` statements and targeted `ALTER TABLE ... ADD COLUMN` helpers.
- Current `SCHEMA_SQL` creates:
  - `videos`
  - `images`
  - `performers`
  - `managedCategories`
- Existing schema naming style uses mostly camelCase columns, for example `categoriesJson`, `createdAt`, `updatedAt`, `thumbnailPath`, and `sourceUrl`-like field naming in frontend data models.
- Boolean fields are stored as `INTEGER NOT NULL DEFAULT 0 CHECK (... IN (0, 1))`.
- JSON-like arrays are stored as text columns with `TEXT NOT NULL DEFAULT '[]'`.
- Timestamps are currently stored as text values, not integer epoch values.

Current CRUD command pattern:

- Tauri command names are snake_case by entity and action:
  - `video_create`, `video_list`, `video_get`, `video_update`, `video_delete`
  - `image_create`, `image_list`, `image_get`, `image_update`, `image_delete`
  - `performer_create`, `performer_list`, `performer_get`, `performer_update`, `performer_delete`
  - `managed_category_create`, `managed_category_list`, `managed_category_get`, `managed_category_update`, `managed_category_delete`
- Rust commands lock the runtime database connection and delegate to create/list/get/update/delete helpers.
- List commands currently sort from newest first, then a stable text field.
- Update commands load the current record, merge patch-like input, update `updatedAt`, and write only the target table.
- Delete commands delete only from the requested table and return a small `{ id, deleted: true }`-style result for catalog entities.

Current Managed Category storage:

- `managedCategories` is a SQLite table with independent category metadata.
- Older localStorage managed-category compatibility exists elsewhere, but current SQLite metadata is separate from record `categoriesJson`.
- Managed Categories must not be automatically mutated by record category operations.
- Record Categories remain text labels stored on Video/Image/Performer rows as `categoriesJson`.

Current backup/restore behavior:

- Backup uses SQLite online backup and copies the active database only.
- Backup does not copy original media files.
- Restore validates that the selected file is a valid SQLite database and currently checks required base tables `videos`, `images`, and `performers`.
- Restore creates a pre-restore safety backup before replacing the active database.
- Restore failure must not leave the app partially restored.

## Storage Options Compared

### 1. Static/Sample Only

Use static or in-memory entries for table/layout work only.

Pros:

- Lowest risk for 35.7.4 table/search/sort/pagination UI work.
- No persistence, migration, backup/restore, or runtime command risk.
- Lets the UI match the mockup before storage is approved.

Cons:

- Not real user data.
- Cannot support actual CRUD.
- Must be clearly treated as a staging layer only.

Best use:

- 35.7.4 Glossary Table + Static/Safe Data UI.
- 35.7.5 form validation UI if persistence remains unapproved.

### 2. localStorage

Store Glossary entries under a local preference-like key.

Pros:

- Avoids immediate SQLite schema work.
- Could support a quick prototype without Tauri changes.

Cons:

- Glossary entries are real content, not a low-risk UI preference.
- localStorage data is not covered by current database backup/restore.
- It creates migration risk if users enter real Glossary data before SQLite is approved.
- It can blur the line between product records and frontend preferences.

Recommendation:

- Avoid localStorage for persisted Glossary records.
- Use localStorage only for harmless future UI preferences, such as last rows-per-page, if explicitly approved.

### 3. SQLite Independent Table

Add an independent Glossary entries table in the existing SQLite database.

Pros:

- Best long-term fit for durable user-created Glossary content.
- Automatically included in database backup if stored in `sakurava.sqlite`.
- Keeps Glossary local-first and private-first.
- Can follow existing CRUD, validation, and test patterns.
- Avoids coupling to Video/Image/Performer/Category catalog metadata.

Cons:

- Requires explicit schema implementation.
- Requires Rust schema and command updates.
- Requires TypeScript schema/contracts/repository updates.
- Requires restore compatibility decisions for older backups.

Recommendation:

- Use SQLite for real persisted Glossary CRUD, but only after explicit user confirmation in a later implementation batch.
- Continue to allow static/in-memory UI staging before persistence is approved.

## Recommended Option

Recommended staged plan:

1. Keep 35.7.4 table UI static or in-memory.
2. Keep 35.7.5 form UI non-persistent or in-memory unless storage has been explicitly approved.
3. Implement real persistence in 35.7.6 using an independent SQLite table.

SQLite is the recommended final storage target because Glossary entries are user content. localStorage should be avoided for real Glossary data because it is not covered by database backup/restore and would create avoidable migration risk.

## Proposed Table Schema

The user-proposed snake_case shape is conceptually sound, but the existing app schema uses camelCase table/column conventions. To reduce adapter friction and keep consistency with `videos`, `images`, `performers`, and `managedCategories`, the recommended implementation schema is:

```sql
CREATE TABLE IF NOT EXISTS glossaryEntries (
  id TEXT PRIMARY KEY NOT NULL,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  synonymsJson TEXT NOT NULL DEFAULT '[]',
  glossaryCategory TEXT NOT NULL DEFAULT '',
  thumbnailPath TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  sourceTitle TEXT NOT NULL DEFAULT '',
  sourceUrl TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
```

Recommended schema notes:

- Use `glossaryEntries` instead of `glossary_entries` to match `managedCategories`.
- Use `synonymsJson` instead of `synonyms_json` to match `categoriesJson`, `aliasesJson`, and related JSON text fields.
- Use `glossaryCategory` instead of `category` to avoid confusion with Managed Categories and Record Categories.
- Use `thumbnailPath`, `sourceTitle`, `sourceUrl`, `createdAt`, and `updatedAt` to match current camelCase style.
- Use text timestamps to match existing catalog tables.
- Do not add a relation table in the first persistence implementation.
- Do not add a foreign key to `managedCategories`.
- Do not make `term` globally unique unless the user explicitly wants duplicate terms blocked. A case-insensitive uniqueness rule can be added later if approved.

If the user strongly prefers the snake_case table name from the prompt, it can still be implemented safely as `glossary_entries`, but it would be the first naming-style split in the app schema. The lower-risk consistency choice is `glossaryEntries`.

## Field Validation Rules

Core fields:

- `id`
  - Generated internally.
  - Required for update/delete.
  - Not exposed as a normal user-facing field.
- `term`
  - Required.
  - Trim before save.
  - Empty after trim is invalid.
- `definition`
  - Required.
  - Trim or preserve line breaks while rejecting empty-after-trim content.
  - UI may enforce a 2,000 character soft/hard limit if approved.
- `synonymsJson`
  - Store as a JSON text array.
  - Normalize by trimming entries, dropping empty entries, and deduping case-insensitively.
  - Invalid JSON should normalize to `[]` before save and parse defensively on read.
- `glossaryCategory`
  - Independent Glossary category text only.
  - Trim before save.
  - Empty string means uncategorized.
  - Must not read from or write to `managedCategories`.
  - Must not read from or write to Video/Image/Performer `categoriesJson`.
- `thumbnailPath`
  - Optional text path/reference only.
  - Must not copy, move, delete, or mutate source files in the first persistence batch.
  - Must not generate thumbnails unless a later thumbnail safety batch approves it.
- `favorite`
  - Boolean in UI, `INTEGER` 0/1 in SQLite.
  - Defaults to false.
- `sourceTitle`
  - Optional text.
  - Trim before save.
- `sourceUrl`
  - Optional text.
  - Trim before save.
  - If present, validate URL format before save.
  - Store text only; opening links is a separate safe external-open behavior.
- `createdAt`
  - Generated internally on create.
  - Not user-editable.
- `updatedAt`
  - Generated internally on create and update.
  - Not user-editable.

## Synonyms Storage Recommendation

Recommended: `synonymsJson TEXT NOT NULL DEFAULT '[]'`.

Why:

- Matches existing `aliasesJson`, `categoriesJson`, `related...Json`, and `galleryImagePathsJson` patterns.
- Synonyms are a simple list, not a relational target.
- Search can parse defensively and match normalized list values.
- Avoids relation-table complexity before the feature is proven.

Not recommended for the first persistence batch:

- Separate `glossarySynonyms` table.
- Comma-separated normalized text.
- Free-form raw text without structured parsing.

## Glossary Category Recommendation

Recommended: independent `glossaryCategory` text field.

Rejected for first implementation:

- Link to `managedCategories`.
- Write to `sakurava.managedCategories.v1`.
- Write to `categoriesJson`.
- Add a separate Glossary category table.
- Store categories as a JSON text list unless multi-category Glossary entries are explicitly approved.

Reasoning:

- The Glossary is a reference library, not catalog metadata.
- A single text category is enough for the current mockup and keeps search/filter behavior simple.
- A future separate Glossary category system can be planned if users need hierarchy, descriptions, thumbnails, or managed category lists inside Glossary.

## Thumbnail Path Safety

Recommended first persistence behavior:

- Store `thumbnailPath` as text only.
- Use explicit user-selected paths only.
- Do not copy files into app data.
- Do not delete, rename, resize, compress, or generate image files.
- Do not scan folders.
- Do not create thumbnail cache behavior in the CRUD batch.

Future thumbnail preview/open behavior:

- Should reuse safe media asset path handling where applicable.
- Should not involve Global Image Viewer changes unless explicitly scoped.
- Should be implemented after persistence is stable.

## Source Link Safety

Recommended first persistence behavior:

- Store `sourceTitle` and `sourceUrl` as text only.
- Validate `sourceUrl` if present.
- Do not fetch metadata.
- Do not scrape pages.
- Do not check remote availability.
- Do not add network-dependent behavior.

Future link open behavior:

- Open through an approved safe external-open path.
- Keep external opening separate from save/update.
- Never require network access for the page to render.

## CRUD Command Plan

Recommended Tauri command names:

- `glossary_list`
- `glossary_create`
- `glossary_get`
- `glossary_update`
- `glossary_delete`

Optional:

- `glossary_toggle_favorite`

Recommendation on favorite:

- Do not add `glossary_toggle_favorite` unless it materially simplifies UI code.
- Existing patterns support `*_update`; a favorite toggle can call `glossary_update` with `{ favorite: true/false }`.

Suggested TypeScript contracts after approval:

- `GlossaryEntry`
- `NewGlossaryEntry`
- `GlossaryEntryPatch`
- `GlossaryRepository`
- Runtime command contract entries for create/list/get/update/delete.

Suggested Rust command shape after approval:

- `GlossaryEntry` struct with serde `camelCase`.
- `GlossaryEntryInput` for create/update input.
- Create validates required `term` and `definition`.
- List orders by `createdAt DESC, term ASC` or by `term COLLATE NOCASE ASC` depending on UI default confirmed later.
- Update merges existing row with the patch and updates `updatedAt`.
- Delete deletes only the selected Glossary row.

No command should:

- Mutate Videos.
- Mutate Images.
- Mutate Performers.
- Mutate Managed Categories.
- Mutate record `categoriesJson`.
- Copy or mutate media files.
- Open source URLs.

## UI Integration Plan

After storage approval:

1. `GlossaryPage` should load entries through `glossary_list`.
2. Search/filter/sort/pagination should operate on loaded Glossary entries only.
3. Add/Edit form should call `glossary_create` or `glossary_update`.
4. Delete should require confirmation and call `glossary_delete`.
5. Favorite toggle should call `glossary_update` unless `glossary_toggle_favorite` is approved.
6. Empty state should appear when no entries exist or no filters match.
7. The independence notice should remain visible.

UI should not:

- Use Category Management data for Glossary categories.
- Show Glossary entries in Category Catalog.
- Show Glossary entries in Video/Image/Performer catalogs.
- Add route or sidebar changes beyond the completed shell.

## Backup/Restore Implications

If Glossary uses the same SQLite database:

- Backup will include Glossary rows automatically because it copies the whole active database.
- Backup UI copy should still state that media files are not included.
- Thumbnail paths are database text references only; thumbnail source files are not backed up.
- Source URLs are database text and are backed up as record fields.

Restore compatibility recommendation:

- Do not add `glossaryEntries` to the required restore table list initially.
- Older valid Sakurava backups without Glossary should remain restorable.
- After restore, schema initialization should ensure `glossaryEntries` exists before Glossary commands run.
- If restore does not currently re-run schema initialization after replacing the database, the future implementation batch should either:
  - run idempotent schema initialization after restore, or
  - require/recommend app restart before Glossary commands are used.

Tests should explicitly cover restoring a pre-Glossary database and keeping the app safe.

## Import/Export Implications

Import/export is not part of 35.7.3 and should not be implemented here.

Future recommendation:

- Treat Glossary as a separate export/import entity after CRUD is stable.
- Use CSV-first workflow consistent with existing Import/Export planning.
- Do not expose raw internal IDs in normal user-facing CSV.
- If an update key is required internally, use the same safe reference layer pattern as catalog CSV.
- Export user-facing headers such as `Action`, `Glossary Ref`, `Term`, `Definition`, `Synonyms`, `Glossary Category`, `Thumbnail Path`, `Favorite`, `Source Title`, and `Source URL`.
- Synonyms should export as a readable delimiter-separated list, not raw JSON, unless the import/export pipeline explicitly standardizes JSON list fields.
- Import must preview before apply.
- Import must not copy, move, delete, or fetch thumbnail/source files.
- Import must not mutate catalog categories or record `categoriesJson`.

## Migration, Idempotency, And Safety Concerns

Required safety rules for the future schema batch:

- Add the table with `CREATE TABLE IF NOT EXISTS`.
- Add the schema constant to both Rust and TypeScript schema definitions.
- Add the table name to TypeScript `TABLE_NAMES` only after implementation.
- Keep schema initialization idempotent.
- Do not drop or rewrite existing tables.
- Do not alter Videos, Images, Performers, or Managed Categories for Glossary.
- Do not add relation tables.
- Do not add foreign keys to catalog tables.
- Do not backfill records from catalog data.
- Do not create Glossary entries from existing categories.
- Do not translate user-entered Glossary data.

Potential compatibility issue:

- Existing tests assert the exact table list and the absence of relation/content tables. Future implementation must update those tests intentionally.

## Test Plan

Docs-only 35.7.3 verification:

- `git diff --check`
- `git status`

Future schema/model tests after user approval:

- `src/backend/schema.test.ts`
  - Includes `glossaryEntries`.
  - Confirms columns and defaults.
  - Confirms no relation tables were added.
- `src-tauri/src/database.rs` tests
  - Creates `glossaryEntries` on fresh initialization.
  - Schema initialization remains idempotent.
  - Existing database gets the new table without data loss.
  - Restore from pre-Glossary database remains safe.
- `src/backend/validation.test.ts`
  - Term required.
  - Definition required.
  - Synonyms normalize defensively.
  - Source URL validation.
  - Favorite defaults.
- Repository/adapter tests
  - Create/list/get/update/delete Glossary entry.
  - Update preserves unrelated fields.
  - Delete affects only the target Glossary entry.
  - Invalid synonyms JSON is normalized or safely rejected according to final decision.
- Runtime command tests
  - `glossary_create`, `glossary_list`, `glossary_get`, `glossary_update`, `glossary_delete`.
  - Commands do not call or mutate catalog repositories.
- App tests after UI wiring
  - Glossary page loads entries.
  - Add/Edit/Delete/Favorite behavior is scoped to Glossary only.
  - Existing sidebar route tests still pass.
  - Existing catalog/category/settings tests still pass.

Recommended future verification set for the schema/CRUD implementation batch:

```powershell
git diff --check
npm.cmd run test -- src/App.test.tsx
npm.cmd run test
npm.cmd run build
Push-Location src-tauri; cargo test; Pop-Location
```

## Regression Risks

Database risks:

- Adding the table to one schema definition but not the other.
- Requiring the Glossary table during restore and rejecting older valid backups.
- Failing to initialize the table after restore before Glossary commands are used.
- Accidentally adding relation tables or category foreign keys.

Catalog risks:

- Accidentally linking Glossary category to Managed Categories.
- Mutating Video/Image/Performer `categoriesJson`.
- Including Glossary entries in Category Catalog usage counts.
- Changing Category Management behavior.

UI/runtime risks:

- Treating disabled shell actions as real saves.
- Opening source URLs during save or render.
- Copying or mutating thumbnail files.
- Adding network-dependent link checks.

Import/export risks:

- Exposing raw internal IDs.
- Treating missing CSV rows as delete.
- Importing Glossary categories into Managed Categories.
- Copying media or thumbnail files during import/export.

## Explicit Non-Goals

- Do not implement schema.
- Do not implement commands.
- Do not implement repositories.
- Do not implement CRUD UI.
- Do not add SQLite migration.
- Do not change database code.
- Do not change Tauri code.
- Do not change tests.
- Do not change App route/sidebar.
- Do not modify Catalog/Collection pages.
- Do not modify Category Catalog.
- Do not modify Category Management.
- Do not modify Settings behavior.
- Do not touch Video/Image/Performer forms.
- Do not touch detail pages.
- Do not touch Global Image Viewer.
- Do not start 35.7.4.
- Do not start 35.8.

## User Confirmation Required Before Implementation

Before implementing storage, the user should confirm:

1. Final storage target: SQLite independent table.
2. Schema naming: recommended `glossaryEntries`/camelCase vs requested conceptual `glossary_entries`/snake_case.
3. Timestamp style: recommended existing text timestamp style vs integer epoch timestamps.
4. Category model: single independent `glossaryCategory` text field.
5. Synonyms model: `synonymsJson` text array.
6. Thumbnail behavior: path/reference only, no file copy/mutation.
7. Restore compatibility: older backups without Glossary remain valid.
8. Whether `glossary_toggle_favorite` is needed or `glossary_update` is sufficient.

## Verification For This Plan

Recommended verification for 35.7.3:

```powershell
git diff --check
git status
```

Expected result:

- Only `docs/audits/35-7-glossary-storage-safety-plan.md` is changed.
