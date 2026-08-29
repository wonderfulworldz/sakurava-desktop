# Sakurava Agent Instructions

## Repository and Project Brain

- Repository: `D:\sakurava-desktop`; primary branch: `main`.
- Canonical Project OS authority is the restored `00`–`07` system plus
  `SAKURAVA-CHATGPT-BOOT-PROMPT.md`; use the precedence defined in
  `docs/ai/00-operating-contract.md` and the boot prompt.
- Before meaningful work, read the applicable canonical owners in this order:
  `00-operating-contract.md`, `02-active-locks.md`, `03-active-batch.md`,
  `01-current-state.md`, `07-master-roadmap.md`, `04-session-ledger.md`,
  `06-feedback-log.md`, then `05-model-routing.md` when model selection or an
  executable prompt is involved.
- `docs/ai/PROJECT.md`, `STATE.md`, `DECISIONS.md`, `LESSONS.md`, `HISTORY.md`,
  and `BACKLOG.md` are secondary transitional documents pending a separate
  disposition decision. They may supply post-migration evidence but do not
  override the canonical Project OS.
- `AGENTS.md` remains the repository-agent instruction surface; it is not a
  replacement for the canonical Project OS.
- The canonical repository Project OS overrides conflicting chat memory.

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

## Adaptive Execution Governance

Use process intensity proportional to task risk, uncertainty, and blast radius.

### Model Recommendation

Before every substantial executable Codex prompt, Project ChatGPT must visibly
state:

- Model: `Luna`, `Terra`, or `Sol`;
- Reasoning: `Low`, `Medium`, `High`, or `Extra High`;
- Mode: `AUDIT ONLY`, `PLAN ONLY`, `IMPLEMENT`, `VERIFY`, `CLOSURE`, or
  `RECOVERY`;
- Risk: `LOW`, `MEDIUM`, or `HIGH`;
- Why: one concise sentence.

Choose the lowest-cost model and reasoning level likely to complete the work
correctly in one controlled cycle.

### Risk Paths

- **LOW — Quick Path:** For small, local, deterministic, reversible work,
  allow inspect -> implement -> focused verify -> deliver in one execution.
  Do not require separate planning, terrain mapping, progress percentages, or
  broad verification unless a material unknown appears.
- **MEDIUM — Standard Path:** For normal multi-file features, integrations,
  workflow changes, or user-visible behavior, understand affected behavior and
  contracts, resolve solution-changing unknowns, define focused verification,
  and split dependent stages only when the result could change the safe next
  action.
- **HIGH — Guarded Path:** For stored-data integrity, database/schema/
  migration, Backup/Restore, security, package compatibility, destructive
  behavior, or unexplained cross-system regressions, understand the causal path
  and owner subsystem before mutation, resolve material unknowns, define
  recovery/rollback where relevant, audit first when needed, use stronger
  verification, and execute only the next safe dependent stage.

### Result Review and Verification

After Codex returns an execution result, Project ChatGPT must review it before
issuing dependent follow-up execution. Review may be brief for LOW-risk
deterministic work and more detailed for MEDIUM/HIGH-risk work; a Codex success
report is not final proof.

Use the smallest reliable evidence set that proves the requested outcome. Do
not run broad tests, builds, measurements, or repeated verification merely to
increase evidence volume. Increase verification strength with risk, blast
radius, irreversibility, and uncertainty.

### Progress, Quota, and Prompt Proportionality

Do not require progress percentages or quota posture for ordinary short work.
Use explicit progress/quota governance only for meaningfully multi-stage,
long-running, measurement-heavy, retry-heavy, experimental, or quota-sensitive
work. When used, progress represents completed outcomes or gates, never command
count, prompt count, retry count, or activity volume.

Do not use a giant fixed Codex prompt contract for every task. Keep LOW-risk
prompts compact; include relevant scope, contracts, material unknowns,
verification, and stop conditions for MEDIUM-risk prompts; and include the
safety, recovery, mutation, verification, and stop boundaries actually needed
for HIGH-risk prompts. Keep durable rules in the Project Brain or reusable
skills instead of repeating them verbatim in every prompt.

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
