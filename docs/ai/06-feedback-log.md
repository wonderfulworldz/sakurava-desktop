# Sakurava Feedback Log

active_count: 4
last_updated: 2026-07-22  

## Active Feedback

### FEEDBACK-2026-07-22-FRONTEND-CHANGE-NOTIFICATION — Frontend Change Notification

date: 2026-07-22  
batch: 42.2  
stage_received: 42.2C Documentation Closure  
type: DIRECT_COMMAND  
status: APPROVED  
risk: LOW  
placement: CURRENT_STAGE / FUTURE_BATCHES  

### Operator Feedback

Notify the operator only when the current instruction, stage, or Codex prompt will actually modify visible frontend behavior.

### Interpretation

Use the clear heading `PERUBAHAN FRONTEND`, state the specific visible pages, controls, dialogs, forms, layout, navigation, styling, rendered interaction, or user-facing workflow that may change, and place the notice immediately before the executable instruction or prompt. Do not notify when visible frontend behavior is unchanged. Do not display negative notices such as `VISUAL FRONT END: TIDAK` or `PERUBAHAN FRONTEND: TIDAK ADA`. Frontend source location alone does not trigger the notice. The notice is informational and does not replace approval; UI locks and scope gates remain active.

### Impact

Future prompt framing and operator review for actual rendered behavior changes.

### Decision

`APPROVED` — conditional notification only when visible frontend behavior changes.

### Next Action

Apply this rule before any future instruction that changes visible frontend behavior.

### Completion Evidence

Recorded in Project OS during Batch 42.2C documentation closure and reaffirmed during 42.2D1 closure; the conditional rule remains active.

### FEEDBACK-2026-07-22-MANUAL-SMOKE-NOTIFICATION — Manual Smoke Requirement Notification

date: 2026-07-22  
batch: 42.2  
stage_received: 42.2C Documentation Closure  
type: DIRECT_COMMAND  
status: APPROVED  
risk: LOW  
placement: CURRENT_STAGE / FUTURE_BATCHES  

### Operator Feedback

Notify the operator only when the current instruction or stage actually requires the operator to perform manual smoke testing.

### Interpretation

Use the clear heading `SMOKE TEST MANUAL DIPERLUKAN`, state what must be checked and why automated verification is insufficient, and place the notice immediately before the manual-smoke stage or executable instruction. Do not notify when manual smoke is not required. Do not display negative notices such as `MANUAL SMOKE: TIDAK` or `SMOKE TEST MANUAL: TIDAK DIPERLUKAN`. Automated tests, builds, static inspection, and Codex verification are not manual smoke. The notice is informational and does not authorize live AppData use; disposable-environment and data-safety requirements remain active.

### Impact

Future prompt framing and operator review when operator-performed manual smoke is actually required.

### Decision

`APPROVED` — conditional notification only when manual smoke is required.

### Next Action

Apply this rule immediately before any future manual-smoke instruction.

### Completion Evidence

Recorded in Project OS during Batch 42.2C documentation closure and reaffirmed during 42.2D1 closure; the conditional rule remains active.

### FEEDBACK-2026-07-22-EXPORT-EMPTY-SECTIONS — Empty Selected Export Sections

date: 2026-07-22
batch: FUTURE_IMPORT_EXPORT_WORK
type: PROBLEM_REPORT
status: PLANNED
risk: MEDIUM
placement: FUTURE_SEPARATE_BATCH / BACKLOG

### Operator Feedback

When all Export sections are selected, an empty selected section such as
Credits blocks the entire Export. The desired future behavior is to export the
selected section with valid empty headers or sheet structure while preserving
populated sections.

### Decision

Record for later. This is not a Batch 42.3A blocker; no implementation or
automatic deselection is authorized, and no data may be fabricated.

### FEEDBACK-2026-07-22-SPREADSHEET-UX-TERMINOLOGY — Spreadsheet UX and Terminology

date: 2026-07-22
batch: FUTURE_IMPORT_EXPORT_WORK
type: NEW_REQUEST
status: PLANNED
risk: MEDIUM
placement: FUTURE_SEPARATE_BATCH / BACKLOG

### Operator Feedback

Improve CSV/XLSX spreadsheet design for user-oriented terminology and a more
usable Credits table, and display Managed Categories as Category.

### Decision

Record for later. A dedicated product and compatibility decision is required;
current headers, ordering, sheet names, public references, internal Category
identity, and other spreadsheet contracts remain unchanged. No implementation
or Active Lock change is authorized.

## Resolved Feedback

### FEEDBACK-2026-07-22-CATALOG-DELETE-INTEGRITY — Catalog Deletion Integrity Failure

date: 2026-07-22
batch: 42.3A
stage_received: 42.3A-1 Static Audit
type: PROBLEM_REPORT
status: RESOLVED
risk: HIGH
placement: RESOLVED / COMPLETED_BATCH_42_3A

### Operator Feedback

The operator reported that one Video, one Image, and three Performers remained
after Credit-bearing catalog activity. Credits appeared removable through the
normal form and Save, but deleting a remaining Video, Image, or Performer could
make another Detail screen show a not-found state. Settings reported
`Catalog references need recovery`, Import and Export became unavailable, and
Restore returned the catalog to a usable state. The five records originated
from a Bulk Import/Export deletion attempt that could not delete
Credit-protected targets.

### Interpretation

The observation is retained as `OBSERVED_BY_OPERATOR`. The static audit reports
the supported architecture findings separately as
`REPORTED_BY_CODEX_STATIC_AUDIT`; the live catalog state remains unknown.

### Decision

- insert Batch `42.3A` before Batch `42.3`;
- complete and close Batch `42.3A` after implementation and accepted smoke;
- restore Batch `42.3` as the next audit-first proposed batch;
- keep existing-catalog diagnosis and repair separately gated.

### Next Action

Closure evidence: implementation commit
`7e5fc6e7b807047203e645256b2f20f87a298f81`, focused Rust/frontend verification
was `REPORTED_BY_CODEX`, disposable smoke was
`PASSED_OBSERVED_BY_OPERATOR`, and no live AppData or existing-catalog repair
was used.

### FEEDBACK-2026-07-22-TRANSLATION-D1-DECISIONS — User CSV and Design Decisions

date: 2026-07-22
batch: 42.2
stage_received: 42.2D1 Project OS Documentation Closure
type: DIRECT_COMMAND
status: APPROVED
risk: LOW
placement: CURRENT_STAGE / FUTURE_BATCHES

### Decision

The five-column user CSV contract, automatic state derivation, `Category` terminology, Sakurava design continuity, and safe automatic reconciliation of benign protected local-evidence count changes are recorded in Active Locks and current authority files.

### Completion Evidence

Documentation closure for Batch 42.2D1, commit `4c14990a666efde80972ec74973f1bdd5974a9a1`.

---

## Entry Template

### FEEDBACK-ID — Short Title

date: YYYY-MM-DD  
batch:  
stage_received:  
type: OBSERVATION / CORRECTION / NEW_REQUEST / DIRECT_COMMAND / PROBLEM_REPORT  
status: OBSERVED / PLANNED / APPROVED / DEFERRED / BLOCKING  
risk: LOW / MEDIUM / HIGH  
placement: CURRENT_STAGE / NEXT_STAGE / LATER_STAGE / NEW_STAGE / SUB_BATCH / SEPARATE_BATCH / BACKLOG  

### Operator Feedback

Concise factual summary of what the operator said.

### Interpretation

Explain the likely meaning without adding unstated requirements.

### Impact

List the affected product, workflow, UI, data, architecture, testing, or Git areas.

### Decision

Record the current decision or state:

`PENDING`

when no decision has been approved.

### Approval

Record one:

- NOT_REQUIRED
- PENDING
- APPROVED
- REJECTED

### Next Action

State one specific action, stage, sub-batch, separate batch, or backlog destination.

### Completion Evidence

Add only after completion.

Possible evidence:

- test result;
- manual smoke result;
- approved decision document;
- Active Lock update;
- commit;
- merge;
- push.

Remove the entry after:

- implementation is complete;
- required verification has passed;
- permanent decisions are recorded elsewhere;
- Active Batch and Current State are updated when relevant.
