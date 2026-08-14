# Backlog and Future Work

APPLICATION_WORK_STATUS: `PAUSED_BY_OPERATOR`

Backlog presence is not implementation approval. Every item remains separately
gated unless a later prompt explicitly authorizes it.

## Managed Media Continuation

1. Remove Mini Images — ready/planned, pending separate approval. Managed mini
   images remain protected catalog assets unless a separately approved removal
   or cache-policy decision changes their handling.

## Pre-42.9 Product Review

- Notification System / Notification History — planned from
  `FEEDBACK-2026-08-13-NOTIFICATION-HISTORY`; retention, severity, persistence,
  actions, Translation, accessibility, Backup/Restore, and ownership remain
  design unknowns.
- Built-in Video Player and Contact Sheet — future, high-risk and audit-first.
- Centralized Remember policy — deferred product/architecture direction.
- Minimal Consistent Catalog Columns — approved future UI direction after the
  corrective foundation.

## Import, Export, and Credits

- Credits spreadsheet user-friendly projection — requires compatibility audit;
  current headers, order, public references, and identity contracts remain.
- XLSX sheet/section selection before Preview — choose file, choose sections,
  build Preview, validate, then Apply while preserving safety Backup, atomicity,
  rollback, stale protection, and integrity validation.
- CSV/Excel date compatibility — unresolved compatibility work.
- Selected empty CSV/XLSX Export sections should eventually produce valid empty
  sections/sheets rather than block the whole Export.
- Credits spreadsheet should become more user-friendly.
- User-facing “Managed Category” may later become “Category” only after a
  separate compatibility/product decision; current visible terminology is
  already `Category` where accepted.
- Deferred 278-row XLSX test debt, if reopened, requires a separately scoped
  test/fixture decision.

## Roadmap Direction

- Batch 42.9 — Design System and Iconography Foundation: NOT APPROVED; blocked
  pending the pre-42.9 feature review.
- Batch 42.10 — Controlled UI Polish: future direction, separately gated.
- Batch 42.11 — Translation Release Completion: final release-facing coverage,
  CSV/fallback/restart validation after feature work is stable.
- Batch 42.12 — Repository Professionalization: future direction.
- Batch 42.13 — Dependency and Security Remediation: controlled triage and
  targeted npm/Rust security hygiene completed; residual findings remain
  separately gated. Exact current alert identity and applicability must be
  established before further remediation. No broad or automatic dependency
  update is authorized. `uuid` via ExcelJS remains deferred unless a future
  compatibility/security decision reopens it.
- Batch 42.14 — Windows Identity and Packaging: future direction.
- Batch 42.15 — Private Pilot Release Candidate: future direction.

No backlog item authorizes implementation, runtime, tests, builds, live-data
access, schema/index changes, dependency work, or package changes.
