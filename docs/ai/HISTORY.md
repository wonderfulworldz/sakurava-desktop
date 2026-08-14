# Execution History

This is compact historical evidence. It never authorizes current work. Statuses
and evidence labels are retained as supported by the legacy authority; unknown
or incomplete evidence is not upgraded.

## Project Brain V2 Closure

### PROJECT-BRAIN-V2

Status: `COMPLETED_AND_ACCEPTED`

Outcome: The legacy multi-file Project OS was replaced with the seven-file
Project Brain V2 authority set: `AGENTS.md`, `PROJECT.md`, `STATE.md`,
`DECISIONS.md`, `LESSONS.md`, `HISTORY.md`, and `BACKLOG.md`. Session-diary and
overflow-ledger mechanics were retired while meaningful history, lessons,
decisions, safety contracts, and backlog were preserved. Project ChatGPT uses a
generated `CHATGPT-BRAIN` snapshot; repository Project Brain files remain
authoritative.

Evidence: repository migration `REPORTED_BY_CODEX`; Project ChatGPT source
replacement `OBSERVED_BY_OPERATOR`.

Reference: migration commit
`c82a02f17732ccea941ee072b5842907f32b6057`.

## Simple Statistics

### SIMPLE-STATISTICS

Status: `COMPLETED_AND_ACCEPTED_WITH_RUNTIME_LIMITATION`

Outcome: Added an additive, read-only, on-demand Simple Statistics surface in
Settings → Library for logical managed mini-image/source count, recorded
published managed-mini storage, pending processing count, and concise overall
status. No schema/index, dependency, package, Backup/Restore, or managed-media
lifecycle changes were made.

Verification: focused Rust tests `6 passed / 0 failed`; focused frontend tests
`2 files / 5 tests passed`. Both remain `REPORTED_BY_CODEX`.

Runtime acceptance: `NOT_MEASURABLE_IN_CURRENT_ENVIRONMENT`. The built-in
disposable runtime mechanism required a sentinel-marked
`manual-smoke/runtime-data` path, which could not be used under the protected
`manual-smoke/` boundary. This is an environment/harness limitation, not a
production defect.

Reference: delivery commit
`02ff01080708e492a173aa38cdd6a930f5c08354`.

## Automatic Mini Images

### AUTOMATIC-MINI-IMAGES

Status: `COMPLETED_AND_ACCEPTED_WITH_RUNTIME_LIMITATION`

Outcome: Delivered persistent ON/OFF Automatic Mini Images with an ON default
and defensive fallback, a safe backend startup synchronization gate, durable
OFF behavior for automatic Generate and Retire work, independent Manual
Regenerate, and OFF → ON resumption through the existing bounded runtime wake.
Only selected/populated source slots participate; catalog-wide regeneration was
not introduced. Backup/Restore feature-state wiring was additive.

Verification: Rust automatic-action gate PASS; focused frontend tests `4 files /
16 tests PASS`; frontend build PASS; and focused running-work Rust test `1
passed / 0 failed`. All remain `REPORTED_BY_CODEX`.

Runtime acceptance: `UNKNOWN`; desktop runtime was not run. No schema,
migration, dependency, or package-format changes were made.

Reference: delivery commit
`f1d92c3a81fd357964542ecffbffbf7d6e19524a`.

## Remove Mini Images

### REMOVE-MINI-IMAGES

Status: `COMPLETED_AND_ACCEPTED_WITH_RUNTIME_LIMITATION`

Outcome: Delivered guarded destructive Remove Mini Images with
`GUARDED_REMOVE_WITH_EXPLICIT_REGENERATION`. Preview remains available in any
Automatic Mini Images state, while execution requires synchronized Automatic
Mini Images `OFF` and never changes the preference. Originals are never
deletion targets; unavailable-original managed outputs are preserved. Stale
Preview protection, exact-path quarantine, journal/recovery, coherent database
and lifecycle reconciliation, retained regeneration eligibility, and the
bounded Manual Regenerate override were delivered. Claimed/running work is not
cancelled or superseded. Retire and orphan cleanup remain separate. No Backup
exclusion preference or disposable managed-mini cache was added; Backup/Restore
source and `.skv` format remain unchanged.

Verification: Remove Mini Images Rust tests `16 passed / 0 failed`; automatic
action regression `1 passed / 0 failed`; running-work regression `1 passed / 0
failed`; focused frontend `3 files / 7 tests PASS`; frontend build PASS; direct
acquisition helper `1 passed / 0 failed`. All remain `REPORTED_BY_CODEX`.

Runtime acceptance: `UNKNOWN`; desktop runtime was not run.

Reference: delivery commit
`dda21f1e9934f19085aadf7763a94685547aea25`.

## Dependency Security Hygiene

### DEPENDENCY-SECURITY-HYGIENE

Status: `COMPLETED_AND_ACCEPTED_WITH_RESIDUAL_FINDINGS`

Outcome: Controlled Dependabot/security triage completed without establishing
an emergency Sakurava production exploit path. Targeted npm security hygiene
was delivered in commit `13bb52a17d061b920ab25b70947b6c4b3b9aae64` for React
Router, PostCSS, nanoid, brace-expansion, and Babel. Rust security hygiene was
delivered in commit `0e092e9ec6fe67339bf27816e9a678f4f5c3d930`, updating
`serde_with` and `serde_with_macros` to `3.21.0` without changing Tauri,
manifests, or application source.

Verification: routing test, spreadsheet test, frontend `tsc -b && vite build`,
and `cargo check --locked` passed; all remain `REPORTED_BY_CODEX`. `uuid` via
ExcelJS remains deferred because affected APIs were not found and remediation
would require a broader compatibility/security decision. The audited esbuild
use did not warrant remediation.

Residual posture: final GitHub output reported 3 remaining vulnerabilities (2
Moderate, 1 Low), `REPORTED_BY_CODEX`; exact current identities are `UNKNOWN`
and require current applicability evidence before further remediation. The
repository is not represented as vulnerability-free.

Governance limitation: an initial Vitest discovery reached protected
`manual-smoke/` because discovery defaulted to the repository root; execution
stopped without further inspection. Static recovery established `--dir src`
as a safe boundary, and later focused verification passed without rediscovery
or contact with protected evidence.

## Execution Index

| ID | Status | Outcome | Evidence / Reference |
|---|---|---|---|
| 41.8.5C | COMPLETED | Credits Spreadsheet CRUD was the prior feature baseline; detailed verification was recorded. | REPORTED_HISTORICAL |
| 41.9 | COMPLETED_AND_CLOSED | Translation containment and architecture corrections completed; later 42.2 work is continuation, not duplicate correction. | REPORTED_HISTORICAL |
| 42.0 | COMPLETED | Master roadmap and Project OS baseline established. | REPORTED_HISTORICAL |
| 42.1 | COMPLETED_AND_CLOSED | Repository/GitHub health triage and controlled Project OS tracking closed; security remediation deferred. | REPORTED_HISTORICAL |
| 42.13A | COMPLETED | Targeted Vite security prerequisite delivered; remaining dependency/security work deferred to 42.13. | REPORTED_HISTORICAL |
| 42.2-1 | COMPLETED_AND_CLOSED | Translation audit and product boundary completed. | REPORTED_HISTORICAL |
| 42.2A | COMPLETED | Lossless Translation storage foundation delivered without caller/runtime integration. | REPORTED_HISTORICAL |
| 42.2B | COMPLETED | English-only built-in identity, custom-language preservation, fallback, and recoverable persistence reported complete. | REPORTED_HISTORICAL |
| 42.2C | COMPLETED | CSV compatibility, English editing/reset, Preview, stale protection, atomic apply, and rollback reported complete. | REPORTED_HISTORICAL |
| 42.2D1 | COMPLETED | Five-column user CSV contract, automatic state derivation, Category terminology, and design continuity recorded. | REPORTED_HISTORICAL; commit `4c14990a666efde80972ec74973f1bdd5974a9a1` |
| 42.2E | COMPLETED_OBSERVED | Disposable Translation smoke reported English-only built-in behavior, preserved custom identity, and restart persistence. | OBSERVED_BY_OPERATOR |
| 42.3A-1 | COMPLETED | Catalog reference integrity and deletion failure audit identified the corrective prerequisite; no implementation in the audit. | REPORTED_HISTORICAL |
| 42.3A-2 | COMPLETED | Catalog deletion/reference correction delivered and accepted before performance work resumed. | REPORTED_HISTORICAL |
| 42.3-1 | COMPLETED | Catalog, media, query, startup, memory, and missing-source architecture mapped without mutation. | REPORTED_HISTORICAL |
| 42.3-2 | PARTIAL_AUDIT_ACCEPTED | Baseline measurements captured on datasets S (~32 Works), M (~256), and A (~1,000). | REPORTED_HISTORICAL; MEASURED as recorded |
| 42.3-2A | PARTIAL_RESULT_ACCEPTED_AND_CLOSED | Targeted measurement completion retained limitations and did not authorize optimization. | REPORTED_HISTORICAL |
| 42.3-2A-R3-R1 | PARTIAL | Generator contract/startup instrumentation boundary remained incomplete. | REPORTED_HISTORICAL |
| 42.3-2A-R3-R2 | PARTIAL_RESULT_ACCEPTED_AND_CLOSED | Final bounded retry preserved protocol deviations and incomplete Detail evidence. | REPORTED_HISTORICAL |
| 42.4-0 | COMPLETED_AND_CLOSED | Batch activation and managed-media product boundary reconciled. | REPORTED_HISTORICAL |
| 42.4-1 | COMPLETED_AND_ACCEPTED | Managed mini-image slot/profile/lifecycle audit completed with decision gaps. | REPORTED_HISTORICAL |
| 42.4-2 | COMPLETED_AND_ACCEPTED | Ratio and standard-variant direction reconciled. | REPORTED_HISTORICAL |
| 42.4-3 | PARTIAL_RESULT_ACCEPTED_AND_CLOSED | Canonical slot measurement retained host/window and routed-helper limitations; no implementation authorization. | REPORTED_HISTORICAL |
| 42.4-3C | COMPLETED_AND_CLOSED | Measurement result and standard-dimension reconciliation superseded by later foundation decisions. | REPORTED_HISTORICAL |
| 42.4-4 | COMPLETED_AND_ACCEPTED | Managed-media architecture and implementation plan accepted. | REPORTED_HISTORICAL |
| 42.4-5 | COMPLETED_AND_ACCEPTED | Contract, schema, protected storage, and inert foundation accepted. | REPORTED_HISTORICAL |
| 42.4-5C | COMPLETED_AND_CLOSED | Foundation result and baseline reconciliation closed. | REPORTED_HISTORICAL |
| 42.4-5D | COMPLETED_AND_CLOSED | Scope consistency correction preserved the separate 42.4-6 boundary. | REPORTED_HISTORICAL |
| 42.4-6 | COMPLETED_AND_ACCEPTED | Pure managed-media processor foundation delivered; no operational integration. | REPORTED_HISTORICAL; commit `a6a629dd39175a77ec6f96d62ac222a672a7640c` |
| 42.4-6C | COMPLETED_AND_CLOSED | Processor foundation documentation closure completed. | REPORTED_HISTORICAL |
| 42.4-7 | COMPLETED_AND_ACCEPTED | Journaled publication and recovery foundation accepted. | REPORTED_HISTORICAL |
| 42.4-7P | COMPLETED_AND_CLOSED | Remote synchronization closure completed. | REPORTED_HISTORICAL |
| 42.4-7C | COMPLETED_AND_CLOSED | Publication foundation closure completed. | REPORTED_HISTORICAL |
| 42.4-8A | COMPLETED_AND_ACCEPTED | Lifecycle architecture guardrail baseline accepted. | REPORTED_HISTORICAL |
| 42.4-8B | COMPLETED_AND_ACCEPTED | Lifecycle architecture comparison/guardrail work accepted. | REPORTED_HISTORICAL |
| 42.4-8C | COMPLETED_AND_CLOSED | Architecture guardrail closure completed. | REPORTED_HISTORICAL |
| 42.4-8D | COMPLETED_AND_ACCEPTED | Lifecycle architecture revalidation accepted. | REPORTED_HISTORICAL |
| 42.4-8E | COMPLETED_AND_CLOSED | Administrative architecture decision closure completed. | REPORTED_HISTORICAL |
| 42.4-9A / 9A-R1 / 9A-C | COMPLETED_AND_CLOSED | Additive lifecycle schema foundation and correction closed. | REPORTED_HISTORICAL |
| 42.4-9B / 9B-C / 9B-C-R1 | COMPLETED_AND_CLOSED | Catalog lifecycle intent integration and reconciliation closed. | REPORTED_HISTORICAL |
| 42.4-9C-A / 9C-I1 / 9C-I1-P / 9C-I1-C | COMPLETED_AND_CLOSED | Bounded executor core, implementation, publication, and reconciliation delivered. | REPORTED_HISTORICAL |
| 42.4-9C-I2 / 9C-I2-C | COMPLETED_AND_CLOSED | Fourteen-path source acquisition/processing/publication/recovery foundation delivered and reconciled. | REPORTED_HISTORICAL |
| 42.4-9C-I3-D2 / 9C-I3-D2-C | COMPLETED_AND_CLOSED | Phased publication/recovery scope and architecture decision closed; runtime remained inert. | REPORTED_HISTORICAL |
| 42.4-9C-I3-I2 / 9C-I3-I2-C | COMPLETED_AND_CLOSED | Phased publication, recovery, and inert runtime completion accepted. | REPORTED_HISTORICAL |
| 42.4-9D / 9D-R1 / 9D-R2 / 9D-R3 / 9D-C | COMPLETED_AND_CLOSED | Descriptor resolution, fallback, and reconciliation delivered; external UI smoke remained partial. | REPORTED_HISTORICAL |
| 42.4-9E-FINAL / 42.4-CLOSE | COMPLETED_AND_CLOSED | Managed Mini Media Foundation closed with evidence-first limitations. | REPORTED_HISTORICAL; commit `682ad3905a0acf2c5ca975b34f5488af70bcd171` |
| 42.5-1 | COMPLETED_WITH_LIMITATION | Catalog/database audit supported a narrow correction; measurement evidence did not authorize broad optimization. | REPORTED_HISTORICAL |
| 42.5-2 | COMPLETED_WITH_LIMITATION | Narrow implementation and verification delivered with documented limits. | REPORTED_HISTORICAL |
| 42.5-3 | COMPLETED_AND_CLOSED | Final validation and closure completed. | REPORTED_HISTORICAL |
| 42.6-1 | COMPLETED_AND_CLOSED_WITH_LIMITATIONS | Backup/Restore audit closed; package and runtime boundaries remained explicit. | REPORTED_HISTORICAL |
| 42.7-1 | COMPLETED_AND_ACCEPTED | Versioned `.skv` package and compatibility foundation accepted. | REPORTED_HISTORICAL; commit `e90e30d9c25f71087c7d7074015f8950cba22ab1` |
| 42.7-2 | COMPLETED_AND_ACCEPTED | Staged Restore, rollback, and crash recovery delivered with environment limitations. | REPORTED_HISTORICAL; commit `d96d0d0d167d8ee6f35425cb2420fa79391c6204` |
| 42.7-3 | COMPLETED_WITH_LIMITATIONS | Final validation and closure completed; no source mutation was required. | REPORTED_HISTORICAL |
| 42.8-1 | COMPLETED_AND_ACCEPTED | Safe Filter/R+ audit and direct-only implementation direction accepted with plan corrections. | REPORTED_HISTORICAL |
| 42.8-2 | COMPLETED_AND_ACCEPTED_WITH_GOVERNANCE_LIMITATION | Implementation/verification accepted; executor noncompliance was recorded separately. | REPORTED_HISTORICAL |
| 42.8-3 | COMPLETED_WITH_LIMITATION | Final Safe Filter/R+ closure completed; Tauri/WebView stale-content behavior remained not measurable. | REPORTED_HISTORICAL |

## Important Deliveries and Corrective Results

- Category resurrection correction: legacy localStorage reverse-writer behavior
  was corrected; runtime acceptance remained `OBSERVED_BY_OPERATOR`.
- Backup/Restore logical-equivalence correction: physical SQLite byte identity
  was replaced by deterministic logical equivalence; populated/empty snapshots,
  mismatch rejection, rollback, and safety backup were covered. Commit
  `19580084575f0c388304ae039bd2f5fb9d9161d7`.
- XLSX corrective delivery: stale header expectation, missing Performer mock
  relationship, selected-empty section behavior, and existing-destination
  replacement were classified/corrected. Commit
  `276b55f900e94955740af9f49d53e6439d5dd348`. Excel-held-file behavior remains
  `UNKNOWN`.
- Safe Image schema correction and Public Ref / Export roundtrip acceptance
  were accepted within the pre-42.9 corrective boundary.
- Manual Regenerate Missing / Outdated was accepted and delivered in commit
  `2992b69c7d5dad68ad8698eabeefdaf9f837ac1b`.
- Windows extended-path correction preserved reparse/symlink inspection and
  UNC policy; runtime evidence was operator-observed.

## 42.3-2 Measurement Limitations Preserved

The recorded performance baseline included approximately 32 Works in dataset S,
256 in M, and 1,000 in A; Dataset A preparation was around 34 seconds and Home
was usable around 35 seconds. Individual list queries were relatively small in
the tested datasets, collection route/frontend transformation was not dominant
in the recorded result, rapid search reran the pipeline, originals were much
larger than rendered thumbnails, no managed mini-image generation system
existed at that point, and no memory leak was evidenced in that record.

The following remained incomplete and did not authorize implementation:
startup reference-initialization breakdown; Detail fixture/harness conflict;
Detail waterfall; page size 256; gallery/realistic image load/decode;
phase-specific memory; missing-source repeated-request behavior; and final
fresh remote verification. Pagination, virtualization, broad memoization, final
thumbnail profile, and general cache were not sufficiently supported for
implementation.

## Historical Evidence Boundary

Legacy nested identifiers above are historical identifiers and must not be
reused for new stages. Historical reports remain `REPORTED_HISTORICAL` or
`REPORTED_BY_CODEX` unless the source explicitly records operator observation
or a measured/static classification. Chat chronology and repeated governance
boilerplate were intentionally compressed into this index.
