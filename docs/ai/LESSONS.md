# Durable Lessons

These entries preserve prevention knowledge. They do not grant authorization.

### Category Resurrection

Problem: Removed or changed Category state could return in SQLite.

Root Cause: A legacy localStorage snapshot reverse-writer rehydrated stale
Category state into the database.

Resolution: The correction removed the autonomous reverse-writer behavior and
added focused regression guards; runtime acceptance remained operator-reported.

Prevention Rule: Managed Category UI configuration must not silently write
record or database state, and Category mutation must be explicit and scoped.

Evidence: `PROVEN_BY_STATIC_SOURCE`; runtime acceptance `OBSERVED_BY_OPERATOR`.

Reference: Category corrective delivery `73e58d0b544cb20f34ce6e381ccab0e91bbb1e2e`.

### Backup/Restore Database Identity

Problem: Physical SQLite byte identity after Restore was treated as the proof
of correctness.

Root Cause: SQLite serialization can differ while logical records and schema
are equivalent.

Resolution: Restore validation was corrected to deterministic logical database
equivalence with populated/empty snapshots, mismatch rejection, rollback, and
safety-backup coverage.

Prevention Rule: Distinguish physical byte identity from logical equivalence;
define the accepted identity contract before asserting Restore correctness.

Evidence: `PROVEN_BY_STATIC_SOURCE`; focused result `REPORTED_BY_CODEX` and
real-app acceptance `OBSERVED_BY_OPERATOR`.

Reference: Backup correction commit `19580084575f0c388304ae039bd2f5fb9d9161d7`.

### Windows Managed-Media Extended Paths

Problem: Manual Regenerate could fail for Windows extended/reparse paths.

Root Cause: Path handling and reparse/symlink policy were not preserved across
the source validation boundary.

Resolution: The delivered correction preserved UNC policy and added the
required path handling; operator runtime evidence accepted the result.

Prevention Rule: Validate Windows paths at the boundary, preserve reparse
policy, and keep original/managed fallback behavior explicit.

Evidence: `PROVEN_BY_STATIC_SOURCE` and `OBSERVED_BY_OPERATOR`.

Reference: Manual Regenerate delivery `2992b69c7d5dad68ad8698eabeefdaf9f837ac1b`.

### Fixture or Harness Failure Is Not Automatically a Product Defect

Problem: A failing test or measurement was initially capable of being read as
a production failure.

Root Cause: Fixture provenance, disposable roots, setup, or harness boundaries
were not yet proven equivalent to production.

Resolution: Classify fixture/harness validity before changing application code.

Prevention Rule: Preserve `UNKNOWN`, `PARTIAL`, or audit-only status until the
fixture, environment, and causal path are established.

Evidence: `REPORTED_HISTORICAL`.

Reference: Batch 42.3 and managed-media measurement records.

### Detail Performance Harness Conflict

Problem: Detail failure/waterfall observations could be mistaken for a product
performance defect.

Root Cause: The Detail fixture/harness and realistic image-load conditions were
not sufficiently proven.

Resolution: Keep the conflict and waterfall as incomplete evidence.

Prevention Rule: Do not authorize performance changes until fixture validity,
page size, image decode/load, phase memory, and repeated-request behavior are
measured with a production-equivalent method.

Evidence: `NOT_MEASURABLE_IN_CURRENT_ENVIRONMENT` / `UNKNOWN`.

Reference: Batch 42.3-2 measurement limitations.

### XLSX Stale Expectation

Problem: Old tests expected a prior sheet/section contract after the contract
changed.

Root Cause: Test expectations were stale, not necessarily evidence of a
production defect.

Resolution: The stale expectation was classified and the authorized header
correction was preserved in the technical handoff.

Prevention Rule: Reconcile test expectations against the current approved
contract before changing runtime behavior.

Evidence: `PROVEN_BY_STATIC_SOURCE` / `REPORTED_BY_CODEX`.

Reference: XLSX causal audit and commit `276b55f900e94955740af9f49d53e6439d5dd348`.

### XLSX Performer Fixture or Reference Gap

Problem: A Videos XLSX verification expected a Performer relationship that was
missing from the mock/reference data.

Root Cause: The fixture relationship was incomplete.

Resolution: The mock relationship gap was classified; no unsupported production
defect was inferred.

Prevention Rule: Verify fixture/reference completeness before changing import or
relationship code.

Evidence: `PROVEN_BY_STATIC_SOURCE`.

Reference: Batch 42.8 corrective audit.

### XLSX Re-export Destination Behavior

Problem: Re-exporting to an existing XLSX destination failed.

Root Cause: The disk writer used create-new-only behavior.

Resolution: Safe replacement and deterministic replacement-failure handling
were delivered while preserving the prior destination on failure.

Prevention Rule: Define existing-destination and replacement/file-lock semantics
before changing export behavior.

Evidence: `PROVEN_BY_STATIC_SOURCE`; operator failure `OBSERVED_BY_OPERATOR`.

Reference: XLSX delivery `276b55f900e94955740af9f49d53e6439d5dd348`.

### Excel-held-file Behavior

Problem: The actual behavior when Excel holds a file was not directly tested.

Root Cause: No valid direct Excel-lock measurement was available.

Resolution: Retain the condition as `UNKNOWN`.

Prevention Rule: Never convert replacement-failure coverage into a measured
Excel-lock claim.

Evidence: `UNKNOWN`.

Reference: Current XLSX authority.

### Isolated Async Tests

Problem: A combined timeout/failure did not reproduce in focused isolation.

Root Cause: The exact combined execution cause was not statically determinable.

Resolution: The isolated passing evidence was retained without unrelated product
mutation.

Prevention Rule: Do not change application behavior for an async failure until
focused reproduction and causal evidence exist.

Evidence: `REPORTED_BY_CODEX` / `UNKNOWN`.

Reference: XLSX multi-type workbook isolation.

### Measurement Governance

Problem: Repeating expensive measurements can consume quota without new value.

Root Cause: Repetition boundaries and expected information gain were not kept
explicit.

Resolution: Bounded repetition, causal-depth gates, and stop conditions became
part of the execution discipline.

Prevention Rule: Repeat only when new evidence, causal narrowing, or an approved
delivery depends on it.

Evidence: `REPORTED_HISTORICAL`.

Reference: Operating Contract and Batch 42.3/42.5 records.

### Protected Manual-Smoke Evidence

Problem: Local smoke evidence can be mistaken for ordinary generated waste.

Root Cause: Broad status, search, or cleanup commands can enumerate or mutate
protected evidence.

Resolution: `manual-smoke/` remains untracked and protected.

Prevention Rule: Use top-level-safe status only; never enumerate children merely
to prove a count or status.

Evidence: `OBSERVED_BY_OPERATOR` / `REPORTED_BY_CODEX`.

Reference: `LOCK-EVIDENCE-001` and Project Brain migration boundary.
