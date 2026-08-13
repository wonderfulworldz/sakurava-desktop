# Sakurava Agent Instructions

## Repository and Project Brain

- Repository: `D:\sakurava-desktop`; primary branch: `main`.
- Before meaningful work, read `docs/ai/PROJECT.md` and `docs/ai/STATE.md`.
- Read `docs/ai/DECISIONS.md` when product or architecture contracts matter.
- Read `docs/ai/LESSONS.md` when prior failures, regressions, or platform/fixture traps may matter.
- Read `docs/ai/HISTORY.md` to determine whether work has already been performed.
- Read `docs/ai/BACKLOG.md` only for planning; backlog presence is not authorization.
- The repository Project Brain overrides conflicting chat memory.

## Product Identity and Stable Terms

Sakurava is a private-first, local/offline Windows desktop catalog for Videos,
Images, Performers, Categories, Credits, Glossary, and related metadata. The
application direction is React + Tauri + TypeScript + SQLite. Do not introduce
cloud services, scraping, accounts, telemetry, or network-dependent behavior
without explicit scope approval.

Use these terms consistently: Videos, Images, Performers, Categories, Managed
Categories, Record Categories, `categoriesJson`, Settings, and Catalog Settings.

## Protected Data and Evidence

- `manual-smoke/` is protected local evidence. It remains untracked. Never
  broadly inspect, enumerate children, count children, delete, move, rename,
  stage, commit, or clean it.
- Protect live AppData at
  `C:\Users\Working WW\AppData\Roaming\app.sakurava.desktop`. Do not access
  or mutate live data without explicit approval; use a disposable root for
  data-sensitive work.
- Approved evidence labels are: `OBSERVED_BY_OPERATOR`, `REPORTED_BY_CODEX`,
  `MEASURED`, `PROVEN_BY_STATIC_SOURCE`, `REPORTED_HISTORICAL`, `INFERRED`,
  `UNKNOWN`, and `NOT_MEASURABLE_IN_CURRENT_ENVIRONMENT`. Never upgrade an
  evidence class or invent counts, timings, dimensions, acceptance, or safety.

## Approval and Scope

- A checkpoint or backlog entry is not authorization. Approval for one stage
  does not authorize another.
- Implementation, runtime, tests, builds, live-data work, schema/index,
  dependency, package, security, Import/Export, Backup/Restore, and UI/UX
  changes require explicit scope approval.
- Preserve existing design, workflow, terminology, and frontend patterns; no
  redesign without approval. Use heading `PERUBAHAN FRONTEND` only when visible
  frontend behavior really changes. Use `SMOKE TEST MANUAL DIPERLUKAN` only
  when operator action is genuinely required.
- Partial evidence does not become implementation approval.

## Git Safety

- Inspect repository state before meaningful mutation; keep diffs controlled.
- Stage exact intended paths only. Do not use broad staging.
- Do not commit without explicit operator approval.
- Do not use `git clean`, `reset`, `stash`, broad `restore`, branch switching,
  rebase, amend, or force-push without explicit approval.
- Review status and diff before commit and verify the remote/divergence before
  push. Do not discard existing work silently.

## Product Safety Contracts

- MVP Categories remain text labels in `categoriesJson`; do not replace them
  with IDs or relational tables without a future architecture decision.
- Managed Categories are local UI configuration stored under
  `sakurava.managedCategories.v1`; they do not mutate records. Record-category
  bulk changes require preview, counts, confirmation, `categoriesJson`-only
  patches, invalid-JSON handling, and preservation of unrelated fields.
- Backup must not mutate existing data, must state that external media is not
  included, and must produce a recognizable artifact. Restore is destructive,
  requires confirmation, validates first, creates a pre-restore safety backup,
  and must not leave a partial restore.
- Settings persistence must use defensive parsing, separate preferences from
  catalog data, and must not change category, media, or Backup/Restore behavior
  unless explicitly approved.

The detailed category, Backup/Restore, and Settings safety references remain in
`docs/10-category-management-safety.md`, `docs/12-backup-restore-ux-safety.md`,
and `docs/13-settings-persistence-planning.md`.

## Execution Discipline

- Future technical batches use at most three main stages; do not introduce new
  nested retry/administrative stage IDs. Historical nested IDs may remain in
  `HISTORY.md`.
- Diagnose root cause before retrying. Do not blindly repeat failed work; stop
  after repeated low-value failure or unresolved causal uncertainty.

## Graphify

Graphify is advisory and subordinate to the Project Brain and current scope. If
the existing approved bridge is used, preserve its read-only boundaries and
confirm material conclusions against current source/Git/evidence. Do not run
Graphify rebuild, update, watch, install, hooks, purge, or other mutation
commands during documentation migration. Never direct it at `manual-smoke/`,
live AppData, runtime databases, media, or operator data.
