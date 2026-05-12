# Post-MVP 1 — Bugfix & Polish Audit

Date: 2026-05-13

## Scope

Batch 1 performed a quick bugfix and polish sweep after Batch 0.

This batch did not implement new features. It was used to classify known issues and move them into the correct future batch.

## Findings

### Critical

- No critical runtime bug was found during the quick sweep.

### Annoying / Known Gaps

- Settings page is still static.
- Delete button / delete flow is not available yet.
- Some form fields are present but not fully functional yet.
- Collection pages do not have Table View yet.
- Collection controls are not functional yet:
  - Search
  - Filter
  - Sort
  - Pagination
  - Items per page
- Bulk add, bulk edit, and bulk delete are not available yet.
- Excel-style add/table input is not available yet.
- Add More button is not available yet.

## Moved to Relevant Batches

- Settings page improvements:
  - Move to Batch 6 — Settings Runtime Status

- Delete button and delete confirmation:
  - Move to Batch 4 — Safe Delete Flow

- Incomplete detail/form fields:
  - Move to Batch 3 — Detail & Form Data Completion

- Table View, search, filter, sort, pagination, and items per page:
  - Move to Batch 2 — Functional Collection Controls

- Bulk add, bulk edit, bulk delete:
  - Move to Batch 10 — Bulk Tools

- Excel-style add/table input:
  - Move to Batch 9 — Import / Export or Batch 10 — Bulk Tools

- Add More button:
  - Move to Batch 3 — Detail & Form Data Completion

## Intentionally Not Changed

- No source code was changed in Batch 1.
- No database schema was changed.
- No delete behavior was added.
- No bulk tools were added.
- No collection controls were added.
- No settings runtime feature was added.
- No backup/restore, native file picker, related picker, thumbnail rendering, or branding work was added.

## Verification

No code changes were made.

Previous Batch 0 verification remains valid:
- `npm.cmd run test`: passed
- `npm.cmd run build`: passed
- `npm.cmd run tauri build`: passed
- Manual smoke test: passed

## Decision

Batch 1 is closed as an audit-only batch.

Next implementation batch:
- Batch 2 — Functional Collection Controls