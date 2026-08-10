# Sakurava Feedback Log

active_count: 11
last_updated: 2026-08-10

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
batch: PRE_42_9_PRODUCT_ACCEPTANCE_CORRECTIVE_SCOPE
type: PROBLEM_REPORT
status: BLOCKING
risk: MEDIUM
placement: CURRENT_CORRECTIVE_AUDIT_SCOPE

accepted_audit_status: ROOT_CAUSE_PROVEN

### Operator Feedback

When a selected XLSX Export section has zero records, it must not block the
whole Export. The selected sheet must still be produced with valid headers and
zero data rows, while populated selected sections export normally and no fake
rows are created.

### Decision

This is current pre-42.9 corrective Product Acceptance scope. No
implementation or automatic deselection is authorized here, and no data may be
fabricated. Preserve Credits and public-reference contracts.

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

### FEEDBACK-2026-08-10-BACKUP-RESTORE-SNAPSHOT — Backup/Restore Snapshot Failure

date: 2026-08-10
batch: PRE_42_9_PRODUCT_ACCEPTANCE_CORRECTIVE_SCOPE
type: PROBLEM_REPORT
status: BLOCKING
risk: HIGH
placement: CURRENT_CORRECTIVE_AUDIT_SCOPE
evidence: OBSERVED_BY_OPERATOR

The backend defect was proven at physical post-Restore SQLite identity
validation: a logically correct Restore could be rejected when physical SQLite
bytes differed from the staged target. The production correction in commit
`19580084575f0c388304ae039bd2f5fb9d9161d7` now validates deterministic logical
database equivalence. Populated and empty exact-snapshot backend regressions
pass, backend reopen-equivalent checks pass, and meaningful same-count logical
mismatch remains rejected. Rollback, safety snapshot, journal recovery, legacy
V1, and V2 focused coverage remain valid as `REPORTED_BY_CODEX`.

Real Tauri/WebView Restore workflow, frontend refresh, true process restart,
and operator-environment behavior remain pending safe disposable manual
verification. No live AppData is authorized. This feedback remains blocking
Product Acceptance until real-app acceptance is completed; this does not
rewrite Batch 42.7 technical closure.

### FEEDBACK-2026-08-10-MEDIA-COVER — Image Detail Cover Missing

date: 2026-08-10
batch: PRE_42_9_PRODUCT_ACCEPTANCE_CORRECTIVE_SCOPE
type: PROBLEM_REPORT
status: PLANNED
risk: MEDIUM-HIGH
placement: CURRENT_CORRECTIVE_AUDIT_SCOPE
evidence: OBSERVED_BY_OPERATOR

A valid image path was visible in the Image form and Gallery images rendered,
but Image Detail Cover rendered a placeholder. Other media surfaces remain
`UNKNOWN`; no path ownership is inferred.

### FEEDBACK-2026-08-10-EXPORT-REEXPORT — Re-export Same XLSX Failure

date: 2026-08-10
batch: PRE_42_9_PRODUCT_ACCEPTANCE_CORRECTIVE_SCOPE
type: PROBLEM_REPORT
status: PLANNED
risk: MEDIUM
placement: CURRENT_CORRECTIVE_AUDIT_SCOPE
evidence: OBSERVED_BY_OPERATOR

Export to `skv-all-master.xlsx` succeeded once, then failed after bulk deletion
when exporting to the same name. Accepted audit status is `ROOT_CAUSE_PROVEN`:
the current XLSX disk writer uses create-new-only behavior and rejects an
already-existing destination. Future correction must safely replace an
existing destination when permitted and return a clear actionable error when
replacement is prevented, such as by a file lock. Actual Excel-lock behavior
has not been measured.

### FEEDBACK-2026-08-10-XLSX-SHEET-SELECTION — Select Sheets Before Preview

date: 2026-08-10
batch: PRE_42_9_PRODUCT_ACCEPTANCE_CORRECTIVE_SCOPE
type: NEW_REQUEST
status: APPROVED
risk: MEDIUM
placement: FUTURE_CORRECTIVE_WORKFLOW_AFTER_AUDIT

The operator requests Choose XLSX -> choose sheets/sections -> build Preview
for those sections -> validate -> Apply. Preview, blocking validation, stale
Preview protection, safety Backup, atomic Apply, rollback, and integrity
contracts must remain intact.

### FEEDBACK-2026-08-10-SAFEFILTER-CONTRACT — Safe Filter/R+ Contract Correction

date: 2026-08-10
batch: PRE_42_9_PRODUCT_ACCEPTANCE_CORRECTIVE_SCOPE
type: CORRECTION
status: APPROVED
risk: HIGH
placement: PRE_42_9_CORRECTIVE_IMPLEMENTATION_AFTER_APPROVED_EXECUTION_GATE
evidence: OBSERVED_BY_OPERATOR

The approved replacement contract makes R+ direct-only on Video, Image,
Performer, Category, and Glossary, with no Category or Glossary inheritance.
Safe Filter hides directly R+ records and the Censorship, Measurements, and
Cup Size surfaces while remaining non-destructive. Body Type is not
automatically sensitive; Height, Weight, Gender, Age, and Attraction Rating
remain normal by default. Import/Export follows the approved safe-visibility
contract, Backup/Restore remains complete, and implementation has NOT occurred.

### FEEDBACK-2026-08-10-CATALOG-COLUMNS — Minimal Consistent Catalog Columns

date: 2026-08-10
batch: FUTURE_UI_WORK
type: NEW_REQUEST
status: APPROVED
risk: MEDIUM
placement: FUTURE_UI_WORK_AFTER_CORRECTIVE_FOUNDATION

The operator requests simpler, more minimal, and more consistent visible
columns for Video, Image, Performer, Category, Glossary, and Credits. Exact
columns are intentionally deferred.

### FEEDBACK-2026-08-10-VIDEO-PLAYER — Built-in Video Player and Contact Sheet

date: 2026-08-10
batch: FUTURE_SEPARATE_FEATURE_BATCH
type: NEW_REQUEST
status: APPROVED
risk: HIGH
placement: ROADMAP_REVIEW_REQUIRED

The operator requests a separate lightweight Sakurava Video Player with
playback controls, 0.25x–16x speed, seek jumps, looping, per-Video resume, and
Video Contact Sheet generation with timestamps and safely available metadata.
No dependency or library is selected; audit must establish platform, codec,
security, multi-window, persistence, performance, licensing, packaging, and
accessibility facts first.

## Resolved Feedback

### DISCOVERED-2026-08-10-XLSX-COUPLED-TEST-COVERAGE — Coupled Export Test Classification Gap

date: 2026-08-10
batch: PRE_42_9_PRODUCT_ACCEPTANCE_CORRECTIVE_WORK
stage_received: XLSX Export Complete Affected-Workflow Causal Audit
type: DISCOVERED_FINDING
status: RESOLVED
risk: MEDIUM
placement: RESOLVED / XLSX_TERRAIN_COMPLETION
discovery_source: CODEX_CAUSAL_AUDIT
evidence: PROVEN_BY_STATIC_SOURCE
origin: CODEX_AUDIT
authorization: NO_IMPLEMENTATION_AUTHORIZED

The accepted XLSX causal audit found that the Videos, Categories, and Glossary
CSV App tests remain materially coupled to the older five-section assumptions
and incomplete Credits fixture coverage. The missing `credit_list` mock is a
fixture/harness gap; it does not cause the stale disabled-button assertion, but
the coupled tests were not individually classified in the completed audit.

This finding did not invalidate the accepted XLSX evidence. The omitted
coupled-test classification was completed and accepted through ChatGPT Result
Review:

completion_evidence:
ALL_MATERIALLY_COUPLED_EXPORT_TESTS_CLASSIFIED;
TERRAIN_COMPLETENESS_GATE: PASS

Resolving this audit finding does not mean the XLSX production correction is
implemented or accepted. The separately gated next action is
`XLSX_EXPORT_COMPLETE_WORKFLOW_CORRECTION_AND_FOCUSED_VERIFICATION`.

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
