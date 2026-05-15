# Agent Code Handoff

Use this document when continuing Sakurava with VSCode Agent Code or Codex.

Use these docs as compressed project memory. Do not reconstruct the full historical workflow unless the user explicitly asks for it.

## First Prompt For Agent Code

```text
You are working on the Sakurava desktop app.

Read AGENTS.md first, then docs/PROJECT_STATUS.md, docs/ROADMAP_LOCKED.md, docs/11-prd-alignment-and-development-plan.md, docs/10-category-management-safety.md, docs/12-backup-restore-ux-safety.md, docs/13-settings-persistence-planning.md, docs/14-category-management-dedicated-page-planning.md, docs/15-form-category-picker-lockdown-planning.md, docs/16-categories-sidebar-page-planning.md, docs/17-related-performer-picker-structure-planning.md, docs/18-related-performer-storage-planning.md, docs/WORKFLOW_GIT.md, and docs/AGENT_CODE_HANDOFF.md.

Follow the locked terminology, no auto-commit rule, category safety rules, Backup/Restore safety rules, Settings persistence planning rules, Category Management dedicated page planning rules, Form Category Picker Lockdown planning rules, Categories Sidebar Page planning rules, Related Performer Picker Structure planning rules, and Related Performer Storage planning rules. Keep the batch scoped. Do not change application code, tests, schema, backend/Rust/Tauri, UI, or category behavior unless this specific batch asks for it.

Category Management implementation is complete through Batch 16.3. Category Management safety documentation is complete through Batch 17.1 if already merged. For Category Management dedicated page work, read docs/14-category-management-dedicated-page-planning.md before planning or implementation. For Form Category Picker Lockdown work, read docs/15-form-category-picker-lockdown-planning.md before implementation. For Categories Sidebar Page work, read docs/16-categories-sidebar-page-planning.md before implementation. For Related Performer Picker Structure work, read docs/17-related-performer-picker-structure-planning.md before implementation. For Related Performer Storage work, read docs/18-related-performer-storage-planning.md before implementation. For Backup/Restore work, read docs/12-backup-restore-ux-safety.md before planning or implementation. For Settings persistence work, read docs/13-settings-persistence-planning.md before planning or implementation. UI polish is not a default roadmap item.

Before editing, check git status. After editing, report files changed, verification run, risks, and follow-up. Do not commit without user approval.
```

## Files To Read First

Read these before planning or editing:

- `AGENTS.md`
- `docs/PROJECT_STATUS.md`
- `docs/ROADMAP_LOCKED.md`
- `docs/11-prd-alignment-and-development-plan.md`
- `docs/10-category-management-safety.md`
- `docs/12-backup-restore-ux-safety.md`
- `docs/13-settings-persistence-planning.md`
- `docs/14-category-management-dedicated-page-planning.md`
- `docs/15-form-category-picker-lockdown-planning.md`
- `docs/16-categories-sidebar-page-planning.md`
- `docs/17-related-performer-picker-structure-planning.md`
- `docs/18-related-performer-storage-planning.md`
- `docs/WORKFLOW_GIT.md`
- `docs/AGENT_CODE_HANDOFF.md`
- `package.json`

For category-related work, also inspect:

- `src/lib/managedCategories.ts`
- `src/lib/categoryAudit.ts`
- `src/lib/categoryRenamePreview.ts`
- `src/lib/categoryRenameApply.ts`
- `src/pages/SettingsPage.tsx`
- `src/App.test.tsx`

## Critical Warnings

- Do not commit without user approval.
- Do not rename locked terms.
- Do not replace `categoriesJson` with category IDs, UUIDs, `categoryIds`, relation tables, or parent/child categories.
- Do not mutate records from Managed Category operations.
- Do not mutate Managed Categories from Record Category operations.
- Do not perform mass record category changes without preview and confirmation.
- Record category operations must patch only `categoriesJson`.
- Preserve unrelated record fields.
- Keep UI polish out of the default plan unless requested or blocking usability.
- Keep documentation-only batches documentation-only.
- Treat future Category Management dedicated page work as separate from the Categories sidebar browsing/catalog page.
- Treat future form category lockdown as a Managed Categories-only picker direction, not free-text creation.
- For Form Category Picker Lockdown implementation, preserve `categoriesJson` and do not mutate Managed Categories from forms.
- For Categories Sidebar Page implementation, keep it browsing/discovery only and do not add management or destructive operations.
- For Related Performer Picker Structure implementation, do not auto-create Performers, do not mutate Performer records from Video/Image forms, and do not invent storage before inspecting current record shapes.
- For Related Performer Storage implementation, prefer the planned JSON field direction unless the user explicitly approves a relational schema batch.
- Leave related pickers and Media Play for future phases after category page decisions.
- Do not make restore a one-click destructive action - follow the Restore UX Flow in `docs/12-backup-restore-ux-safety.md`.
- Backup/Restore must clearly state that media files are not included in the backup.
- Do not implement Settings persistence without reading `docs/13-settings-persistence-planning.md`.
- Keep low-risk UI preferences separate from data-risk Settings.
- Settings persistence must not mutate catalog records, category behavior, Backup/Restore behavior, or media behavior unless a later batch explicitly asks.
- Read `docs/14-category-management-dedicated-page-planning.md` before Category Management dedicated page work.
- Do not mix Category Management dedicated page work with the future Categories Sidebar Page.
- Do not mix Category Management dedicated page work with Form Category Picker Lockdown.
- Read `docs/16-categories-sidebar-page-planning.md` before Categories Sidebar Page work.
- Do not mix Categories Sidebar Page work with Category Management or Form Category Picker Lockdown.
- Read `docs/17-related-performer-picker-structure-planning.md` before Related Performer Picker Structure work.
- Do not mix Related Performer Picker Structure work with Related Video/Image Picker or media behavior.
- Read `docs/18-related-performer-storage-planning.md` before Related Performer Storage work.
- Do not implement Related Performer Picker persistence before storage has been approved.

## Preferred Batch Prompt Format

Use this shape for future batch prompts:

```text
Current branch:
<branch-name>

Context:
- <stable checkpoint>
- <completed relevant work>
- <important docs to preserve>

Task:
<one narrow objective>

Required files or areas:
- <file or area>

Rules:
- Do not commit.
- Keep the diff controlled.
- Preserve locked terms.
- Follow category safety docs when category behavior is involved.

Verification:
- <commands to run or explain why not needed>

After finishing, report:
- files changed;
- verification run;
- behavior changed, if any;
- risks or follow-up.
```

## Human Review Requirements

Human review is required before:

- committing;
- tagging a checkpoint;
- opening or merging a PR;
- schema changes;
- data migration;
- backup/restore behavior changes;
- bulk record mutation behavior;
- changing category storage or semantics;
- adding new navigation surfaces such as a Categories sidebar page;
- changing roadmap order.

For category work, the reviewer should confirm:

- Managed Categories and Record Categories remain separate;
- `sakurava.managedCategories.v1` behavior is preserved;
- `categoriesJson` remains the MVP record category storage;
- mass record changes require preview and confirmation;
- record patches include only `categoriesJson` for category rename/remove.
