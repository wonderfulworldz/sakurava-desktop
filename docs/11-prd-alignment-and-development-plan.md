# PRD Alignment and Development Plan

## Purpose

This document explains how to read the original Sakurava MVP PRD after the project has moved into post-MVP work.

The original PRD remains the stable MVP baseline. Newer documents such as `PROJECT_STATUS.md`, `ROADMAP_LOCKED.md`, `AGENT_CODE_HANDOFF.md`, `10-category-management-safety.md`, and workflow docs represent the current post-MVP standard for future work.

If the original PRD conflicts with newer project status, roadmap, safety, or workflow documents, do not rewrite history. Treat the PRD as the baseline that defined the MVP, and treat newer documents as the current operating standard.

## How to Read the PRD Now

Read `02-mvp-prd.md` as the original MVP contract:

- what the app was built to prove first;
- what the MVP deliberately excluded;
- what data shapes and UI safety rules were locked early;
- what core acceptance criteria had to pass before post-MVP expansion.

Then read current docs for the active standard:

- `PROJECT_STATUS.md` for completed capabilities and latest checkpoints;
- `ROADMAP_LOCKED.md` for the next roadmap order;
- `10-category-management-safety.md` for Category Management safety rules;
- `AGENT_CODE_HANDOFF.md` and `WORKFLOW_GIT.md` for continuation and workflow rules.

Do not assume the old PRD is obsolete. Also do not assume it fully describes the current app.

## PRD Stable Baseline

The stable MVP baseline remains:

- Sakurava is a local/offline Windows desktop app.
- The stack is React, TypeScript, Tailwind CSS, Tauri, and SQLite.
- The primary records are Videos, Images, and Performers.
- The foundation is CRUD with SQLite persistence.
- The core journey is `Add -> Save -> List -> Detail -> Edit -> Restart -> data persists`.
- `categoriesJson` stores simple category text labels.
- `ratingJson` stores simple rating JSON.
- `favorite` is a boolean.
- File and folder paths were manual/local path inputs in MVP.
- Empty or invalid image paths use placeholder fallback.
- UI must not expose raw IDs, UUIDs, or raw JSON.
- Scraping was not part of MVP.
- Media player was not part of MVP.
- Relation pickers were not part of MVP.
- Advanced relational categories were not part of MVP.

These constraints still matter unless a later explicit batch changes them.

## Current Post-MVP Standard

The following post-MVP additions are already part of the current Sakurava standard:

- frontend static foundation;
- backend SQLite foundation;
- runtime and Tauri command boundary;
- CRUD integration for Video, Image, and Performer records;
- collection controls including search, sort, view toggle, pagination, and category filtering;
- detail and form data completion;
- safe delete flow;
- local asset and thumbnail foundation;
- responsive UI and thumbnail ratio handling;
- home dashboard;
- Settings structures;
- Managed Categories stored through localStorage;
- category audit;
- collection multi-filter by categories;
- rename category across records;
- remove category from records;
- preview and confirmation for record-level category operations;
- `categoriesJson`-only patch rule for record category operations;
- Category Management safety documentation;
- agent handoff documentation;
- Git, PR, and tag workflow standard.

Use `PROJECT_STATUS.md` as the short current capability summary. Use specific implementation files only when a batch requires code changes.

## Category System Current Standard

Sakurava currently uses a two-layer category model.

### Managed Categories

Managed Categories are local app-managed category configuration:

- stored in localStorage key `sakurava.managedCategories.v1`;
- used for the controlled category vocabulary;
- used for form suggestions and the Category Management UI;
- not automatically applied to existing records;
- not the source of truth for collection filtering.

Adding, renaming, or deleting a Managed Category changes only the local managed category list unless the user explicitly starts a separate Record Category operation.

### Record Categories

Record Categories are labels stored on individual catalog records:

- stored in `categoriesJson` on Video, Image, and Performer records;
- used for collection filters;
- used for category audit;
- used for usage counts;
- treated as actual record metadata.

### Mandatory Category Rules

- Managed Categories are not the same as Record Categories.
- Adding a managed category must not change records.
- Renaming a managed category must not change records.
- Deleting an unused managed category only removes it from localStorage.
- Renaming or removing categories across records requires preview and confirmation.
- Record-level category operations may only patch `categoriesJson`.
- Unrelated fields must be preserved.
- Invalid `categoriesJson` must not crash the app.
- Duplicate categories in a single record must be prevented.
- Do not introduce relational category tables now.
- Do not introduce parent/child categories now.
- Do not replace `categoriesJson` with `categoryIds`, UUIDs, or relation tables now.

The source of truth for category safety is `10-category-management-safety.md`.

## Completed vs Next Work

Completed work should not be repeated unless the user explicitly asks for a rework or bug fix. In particular, do not redo Category Management batches that are already complete through Batch 16.3.

Current completed category checkpoint:

```text
post-mvp-16-3-delete-category-record-apply-v1
```

Category Management safety documentation checkpoint:

```text
post-mvp-17-1-category-management-safety-docs-v1
```

This Batch 17.3 document is documentation alignment only. It does not change app behavior, category behavior, schema, tests, or roadmap order.

## Locked Roadmap

Follow the locked roadmap in this order unless the user explicitly changes it:

1. Backup/Restore UX Safety Review
2. Settings Persistence Planning
3. Category Management Dedicated Page Planning
4. Category Management Dedicated Page Implementation
5. Form Category Picker Lockdown
6. Categories Sidebar Page Planning
7. Categories Sidebar Page Implementation
8. Related Performer Picker Structure
9. Related Video/Image Picker Structure
10. Media File Status / Open File
11. Image Preview Modal
12. Video Open/Preview Safety

Keep one batch focused on one roadmap item.

## Deferred Work

Do not introduce these unless the user explicitly requests a planned batch:

- Home search/filter;
- Continue Cataloging;
- Appearance real logic;
- Language real logic;
- Welcome Slider real logic;
- advanced DB-backed categories;
- relational category table;
- parent/child categories;
- category analytics;
- import/export category mapping;
- advanced media player;
- broad UI polish.

## Future Development Direction

These are intended directions, not implementation instructions for this batch:

- Category Management should likely become a dedicated page under Settings -> Catalog Management -> Category Management.
- The future Categories sidebar page is for browsing and catalog discovery, not management.
- The form category picker should eventually be locked to Managed Categories only.
- Related Performer, Related Video, and Related Image should use searchable picker UI, not free text.
- Media work should start with file status and open-file behavior before any embedded player.

## Agent Continuation Checklist

For a new AI agent continuing Sakurava:

- Read `AGENTS.md` first.
- Read `PROJECT_STATUS.md` and `ROADMAP_LOCKED.md`.
- Read this PRD alignment document.
- Read `10-category-management-safety.md` before any category-related work.
- Check the current branch.
- Check `git status`.
- Never assume the old PRD is the full current state.
- Never start coding before the batch scope is clear.
- Do not repeat already completed Category Management work.
- Do not add UI polish unless requested or required for usability, correctness, accessibility, or verification.
- Do not commit without user approval.
