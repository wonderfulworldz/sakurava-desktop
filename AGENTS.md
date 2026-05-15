# AGENTS.md

Instructions for VSCode Agent Code, Codex, and other coding agents working on Sakurava.

Use these docs as compressed project memory. Do not reconstruct the full historical workflow unless the user explicitly asks for history or archaeology.

For PRD alignment, read `docs/11-prd-alignment-and-development-plan.md`: the original PRD remains the MVP baseline, while `PROJECT_STATUS`, `ROADMAP_LOCKED`, category safety docs, workflow docs, and handoff docs represent the current post-MVP standard.

## Project Identity

Sakurava is a local/offline Windows desktop app for managing Videos, Images, and Performers.

The app should remain private-first and local-first. Do not introduce cloud services, scraping, account systems, telemetry, or network-dependent behavior unless the user explicitly asks for a planned batch that includes those changes.

## Stack

- React
- TypeScript
- Tailwind CSS
- Tauri
- SQLite
- Vitest
- Rust tests under `src-tauri`

## Locked Terms

Use these terms consistently:

- Videos
- Images
- Performers
- Categories
- Managed Categories
- Record Categories
- `categoriesJson`
- Settings
- Catalog Settings

Do not rename locked terms in UI text, docs, database fields, tests, or prompts unless the user explicitly approves a terminology batch.

## Git Workflow Rules

- Use one branch per batch.
- Start implementation batches from a clean `main` unless the user states otherwise.
- Keep diffs controlled and scoped to the batch.
- Review `git status` before making changes.
- Review `git status` and `git diff --stat` before any commit.
- Do not mix unrelated refactors into feature or documentation batches.
- Do not rewrite history, reset, or discard user changes unless the user explicitly asks.

## No Auto-Commit Rule

Do not commit without user approval.

It is acceptable to prepare a commit summary, verification status, and recommended tag name, but the user must approve the commit command first.

## Category Management Safety Rules

The source of truth for category safety is `docs/10-category-management-safety.md`.

For Category Management dedicated page planning, read `docs/14-category-management-dedicated-page-planning.md`.

For Form Category Picker Lockdown planning, read `docs/15-form-category-picker-lockdown-planning.md`.

## Backup/Restore Safety Rules

The source of truth for Backup/Restore UX safety is `docs/12-backup-restore-ux-safety.md`.

Backup and Restore are data-risk operations. Safety rules:

- Backup must never mutate existing data.
- Backup must generate a clear backup artifact with recognizable name and timestamp.
- Backup failure must not affect the current database.
- Backup must clearly state that media files are not included.
- Restore is destructive — must require explicit confirmation.
- Restore must validate the backup file before applying.
- Restore must create a pre-restore safety backup.
- Restore failure must not leave the app in a partially restored state.
- Restore must clearly explain whether media files are included.
- Follow the Restore UX Flow in the safety document (select -> validate -> preview -> confirm -> execute).

## Settings Persistence Planning

The source of truth for Settings persistence planning is `docs/13-settings-persistence-planning.md`.

Settings persistence rules:

- Do not implement Settings persistence from a planning batch.
- Keep low-risk UI preferences separate from data-risk settings.
- Do not persist everything by default.
- Settings persistence must not mutate catalog records.
- Settings persistence must not change category behavior.
- Settings persistence must not change Backup/Restore or media behavior unless a later batch explicitly asks.
- Use safe defaults and defensive parsing for missing or invalid stored settings.

Current completed category checkpoint:

```text
post-mvp-16-3-delete-category-record-apply-v1
```

Category Management implementation is complete through Batch 16.3. Category Management safety documentation is complete through Batch 17.1 if that checkpoint has been merged.

Category Management lives in Settings -> Catalog Settings.

Keep these concepts separate:

- Managed Categories: the local app-managed category list.
- Record Categories: labels stored on individual Videos, Images, and Performers.

Safety rules:

- No schema changes for MVP Category Management.
- No relational category table in the MVP.
- No parent/child category system in the MVP.
- No mass record mutation without preview and confirmation.
- Record category operations must patch only `categoriesJson`.
- Managed Category operations must not mutate records.
- Record Category operations must not automatically mutate Managed Categories.
- Invalid stored category JSON must not crash Settings.

## `categoriesJson` MVP Rule

MVP categories are text labels stored in `categoriesJson`.

Do not replace MVP categories with IDs, UUIDs, relation tables, `categoryIds`, or a category table unless the user approves a future architecture batch.

For record category rename/remove operations, update records only with a patch shaped like:

```ts
{ categoriesJson: nextCategoriesJson }
```

Do not send incomplete full records. Preserve unrelated fields.

## Managed Category Storage

Managed Categories use local storage:

```text
sakurava.managedCategories.v1
```

Managed Categories are local UI configuration. They provide the Settings-managed list and form suggestions. They are not automatically applied to existing records and are not the source of truth for collection filtering.

## Mass Record Change Requirement

Any mass change to record categories must include:

- preview of affected records;
- count by record type where applicable;
- explicit confirmation before apply;
- `categoriesJson`-only patches;
- safe handling for invalid `categoriesJson`;
- preservation of unrelated fields.

This applies to record category rename, record category removal, and any future bulk maintenance action.

## UI Polish Rule

Do not propose UI polish by default.

Only include UI polish when the user requests it or when it blocks usability, correctness, accessibility, or verification of the requested batch.

## Future Category Direction

- Category Management may later move into a dedicated page, with Settings as the parent entry.
- A future Categories sidebar page should be a browsing/catalog page, not the management page.
- Form category input should eventually be locked to Managed Categories only, not free-text creation.
- Related pickers and Media Play are future phases after category page decisions.

## Verification Commands

Use the smallest verification set that matches the batch risk. For code changes, prefer:

```powershell
npm.cmd run test
npm.cmd run build
Push-Location src-tauri; cargo test; Pop-Location
npm.cmd run tauri dev
```

Run `cargo test` from `src-tauri`, not from the project root.

Docs-only changes do not require a full build unless docs reference generated code, scripts, or changed runtime behavior.
