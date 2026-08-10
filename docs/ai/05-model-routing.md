# Sakurava Model Routing

## Purpose

This file defines how to select a Codex model, reasoning level, and execution mode for Sakurava work.

The objective is to minimize total delivery cost:

- quota usage;
- correction cycles;
- regression risk;
- operator effort;
- verification effort;
- time required to reach a proven result.

The newest or strongest model is not automatically the best choice.

A cheaper model is inefficient when it repeatedly fails.

A stronger model is inefficient when it expands scope, introduces unnecessary changes, or requires additional correction.

---

## 1. Core Routing Principle

Choose the least expensive model that has a high probability of completing the approved task correctly in one controlled cycle.

Model selection must consider:

1. task ambiguity;
2. blast radius;
3. reversibility;
4. data and architecture risk;
5. verification strength;
6. previous verified Sakurava performance;
7. expected correction cycles.

Older models may be preferred when they are:

- still available;
- proven stable for the task class;
- easier to control;
- more quota-efficient;
- supported by strong verification.

Model capability does not grant additional implementation authority.

### Causal-Terrain Routing Rule

Unresolved causal terrain routes work to `AUDIT ONLY`, even when the visible
symptom appears narrow or the requested correction appears easy. Select
reasoning strength from causal complexity and coupling, not perceived task
importance. Do not route to `IMPLEMENT` until the
`TERRAIN_COMPLETENESS_GATE` passes and no material UNKNOWN could change the
solution. Do not escalate the model merely to compensate for an incomplete
audit scope; first complete the bounded causal-depth work with the smallest
relevant evidence set.

Executor continuity follows the same evidence boundary. Reporting-only
noncompliance does not justify a technical rerun or model escalation. Omitted
mandatory audit or verification work normally routes to bounded `AUDIT ONLY` or
`VERIFY` completion while preserving valid accepted evidence. Repeated
comprehension failure may justify a smaller scope, clearer prompt, or reasoning
reassessment. A stronger model does not substitute for objective alignment,
complete scope, or the terrain gate.

Concrete findings discovered outside the current scope must be captured and
deferred in the Feedback Log. They do not change routing unless they invalidate
the current evidence, safety, approval, or expected-success path.

### Quota-Aware Routing Control

There is no fixed numeric execution-attempt limit. Select the least costly
model and reasoning level likely to complete the approved task safely. Escalate
only when complexity, risk, expected information gain, and remaining project
value justify the additional quota cost.

Reuse accepted evidence while relevant. Avoid repeated expensive suites,
commands, or corrections when they are unlikely to change a decision or
increase confidence. Executor noncompliance, lost output, or incorrect approval
interpretation should first trigger clearer and shorter instructions, not an
automatic expensive rerun.

Every substantial recommendation and result must report:

- batch outcome progress with a stable denominator and percentage;
- current-stage task progress with a predefined stable denominator and percentage;
- current-execution gate progress with a predefined denominator and percentage;
- quota posture: `CONSERVATIVE`, `NORMAL`, `HIGH_COST`, or `CRITICAL`;
- the next highest-value action.

Commands, retries, prompts, and test counts are not progress tasks. If a
denominator must change, report the previous and new denominators, the reason,
previous progress, and rebased progress.

---

## 2. Routing Inputs

### Ambiguity

#### Low

- expected behavior is exact;
- scope is narrow;
- relevant files are known;
- protected contracts are clear;
- verification is deterministic.

#### High

- product behavior is not approved;
- current architecture is unclear;
- requirements conflict;
- root cause is unknown;
- migration requirements are uncertain.

### Blast Radius

#### Low

- documentation;
- Git inspection;
- isolated helper;
- focused test;
- one narrow UI behavior.

#### High

- shared architecture;
- database;
- migration;
- Restore or Backup;
- translation;
- public references;
- package compatibility;
- stored user data.

### Reversibility

#### Easy

- documentation;
- tests;
- isolated frontend behavior;
- temporary scripts;
- non-persistent output.

#### Difficult

- database migration;
- stored-data conversion;
- public identity changes;
- package-format changes;
- destructive cleanup;
- compatibility changes.

### Verification Strength

#### Strong

- focused automated tests;
- deterministic output;
- disposable fixtures;
- database inspector;
- restart verification;
- clearly measurable results.

#### Weak

- broad visual behavior;
- hidden cross-system effects;
- no existing tests;
- unclear migration outcomes;
- subjective acceptance criteria.

---

## 3. Capability Tiers

Model names may change over time.

Use capability tiers as the stable routing system.

### Tier A — Economical and Focused

Use for:

- Git and worktree inspection;
- documentation;
- narrow read-only audits;
- focused verification;
- focused test correction;
- deterministic single-file changes;
- closure checks;
- small scripts.

Typical candidates:

- Luna;
- another economical stable model;
- a verified previous-generation model.

Default reasoning:

- `Light` for deterministic inspection or documentation;
- `Medium` when repository context must be understood.

### Tier B — Standard Implementation

Use for:

- normal multi-file frontend work;
- React and Tauri integration;
- parser changes;
- Import or Export logic;
- localized workflow changes;
- moderate Rust changes;
- features with strong verification.

Typical candidates:

- Terra;
- a stable equivalent model;
- a verified previous-generation implementation model.

Default reasoning:

`Medium`

Use `High` when:

- several systems interact;
- existing behavior is difficult to preserve;
- data paths are affected;
- verification is incomplete.

### Tier C — High-Risk Reasoning

Use for:

- architecture decisions;
- database transactions;
- migrations;
- Restore or Backup;
- translation architecture;
- public-reference behavior;
- stored-data integrity;
- complex cross-system regressions;
- unresolved Tier B failures.

Typical candidates:

- Sol;
- Terra with High reasoning;
- the strongest suitable available model.

Default reasoning:

`High`

Tier C should normally begin with:

`AUDIT ONLY`

when current behavior or architecture is uncertain.

---

## 4. Reasoning Levels

### Light

Use when:

- the task is deterministic;
- scope is very narrow;
- expected output is exact;
- verification is simple;
- little architectural interpretation is required.

### Medium

Use when:

- several files may be involved;
- normal implementation reasoning is required;
- risk is low or medium;
- verification is strong.

This is the default level for standard implementation.

### High

Use when:

- architecture is involved;
- data integrity is involved;
- migration is possible;
- several systems interact;
- the root cause is unclear;
- a previous focused attempt failed;
- protected behavior is difficult to preserve.

### Extra or Maximum

Use only when:

- the option exists;
- High reasoning was insufficient;
- the problem is genuinely complex;
- scope is already tightly controlled;
- additional quota is justified.

Do not use Extra or Maximum only because the batch is important.

---

## 5. Codex Modes

Every model recommendation must include one execution mode.

### AUDIT ONLY

Use to:

- inspect current behavior;
- identify risks;
- locate relevant files;
- report inconsistencies;
- compare code with approved contracts;
- propose options.

File modification is prohibited.

### PLAN ONLY

Use to:

- design an implementation sequence;
- identify likely files;
- define tests;
- define migration requirements;
- define rollback or recovery needs.

File modification is prohibited.

### IMPLEMENT

Use to:

- modify only approved scope;
- add or update relevant tests;
- preserve protected contracts;
- report unexpected file requirements before expanding scope.

### VERIFY

Use to:

- inspect the diff;
- run focused checks;
- confirm expected behavior;
- identify regressions;
- compare implementation against the approved scope.

Do not introduce unrelated fixes.

### CLOSURE

Use to:

- run final relevant verification;
- update approved documentation;
- report final worktree and Git state;
- prepare controlled commit or release closure.

Do not add product features.

### RECOVERY

Use when repository, implementation, or data state is unsafe or unclear.

Prioritize:

- read-only inspection;
- worktree preservation;
- data preservation;
- evidence collection;
- controlled recovery planning.

---

## 6. Default Routing Matrix

| Task | Tier | Reasoning | Mode |
|---|---:|---:|---|
| Git or worktree inspection | A | Light | AUDIT ONLY |
| Documentation update | A | Light | IMPLEMENT |
| Focused result verification | A | Medium | VERIFY |
| Focused test correction | A | Medium | IMPLEMENT |
| Small isolated bug | A or B | Medium | IMPLEMENT |
| Normal frontend feature | B | Medium | IMPLEMENT |
| Import or Export parser | B | Medium | IMPLEMENT |
| Multi-file workflow | B | Medium or High | IMPLEMENT |
| Moderate Rust command change | B | Medium or High | IMPLEMENT |
| Database transaction | C | High | AUDIT ONLY, then IMPLEMENT |
| Migration | C | High | AUDIT ONLY, then PLAN ONLY |
| Restore or Backup | C | High | AUDIT ONLY |
| Translation architecture | C | High | AUDIT ONLY |
| Difficult unexplained regression | B or C | High | AUDIT ONLY |
| Batch closure | A or B | Medium | CLOSURE |
| Unsafe repository state | B or C | High | RECOVERY |

This matrix is guidance, not an automatic decision.

Adjust the recommendation using:

- actual scope;
- applicable Active Locks;
- reversibility;
- verification strength;
- previous verified evidence.

---

## 7. Escalation Rules

Escalate to a stronger model or higher reasoning when:

- the current model misunderstands approved scope;
- one focused correction fails;
- the root cause remains unknown;
- actual blast radius is larger than expected;
- several systems conflict;
- verification is nondeterministic;
- data integrity risk appears;
- migration risk appears;
- Restore or Backup behavior is involved;
- protected contracts are difficult to reconcile with current code.

Do not escalate only because:

- a stronger model is available;
- the task is important but technically simple;
- the first response is concise;
- the model is not the newest;
- the operator has unused quota.

When escalating:

- preserve the approved scope;
- preserve applicable Active Locks;
- state why escalation is justified;
- do not silently broaden the task.

---

## 8. Strong-Model Guardrails

When using Tier C or an initiative-heavy model:

- begin with `AUDIT ONLY` when architecture is uncertain;
- list applicable Active Lock IDs;
- define exact In Scope;
- define exact Out of Scope;
- identify likely files;
- prohibit unrelated refactoring;
- prohibit unapproved UI redesign;
- prohibit dependency changes;
- prohibit package-version changes;
- require disclosure before modifying unexpected files;
- require a concise changed-file report;
- require verification against protected behavior.

Strong reasoning must increase accuracy, not implementation authority.

---

## 9. Required Recommendation Header

Every Codex prompt must begin with:

```text
MODEL RECOMMENDATION

Model:
Reasoning:
Capability Tier:
Codex Mode:
Risk Level:
Why this model:
```

`Why this model` must be one concise sentence based on:

- scope;
- risk;
- blast radius;
- reversibility;
- verification strength;
- expected correction cost.

The prompt and final report must accompany model metadata with Batch, current
Stage-task, and current-execution gate progress, including percentages and
quota posture. Model selection must remain subordinate to approval, scope,
Active Locks, and expected-value execution control.

Example:

```text
MODEL RECOMMENDATION

Model: Terra
Reasoning: Medium
Capability Tier: B
Codex Mode: IMPLEMENT
Risk Level: Medium
Why this model: The task is a controlled multi-file implementation with strong focused tests and no migration or stored-data change.
```

---

## 10. Verified Performance Registry

No verified model-performance entries are currently recorded.

Add an entry only when all of the following are explicitly available:

- model name;
- reasoning level;
- Codex mode;
- task class;
- result;
- correction-cycle count;
- regression result;
- evidence source.

Do not infer the model used from:

- task difficulty;
- batch history;
- output quality;
- previous chat assumptions;
- general routing recommendations.

### Entry Template

#### Short Task Name

task_class:  
model:  
reasoning:  
mode:  
result: PASSED / FAILED / PARTIAL  
correction_cycles:  
regression: NONE_RECORDED / FOUND / UNKNOWN  
evidence_source:  
future_recommendation: REUSE / REUSE_WITH_GUARDRAILS / DO_NOT_REUSE / INSUFFICIENT_EVIDENCE  

Only retain entries that meaningfully improve future model selection.

---

## 11. Maintenance

Update this file only when:

- available model names materially change;
- repeated verified evidence changes a routing recommendation;
- a model proves consistently reliable or unreliable for a task class;
- quota behavior changes materially;
- a new routing pattern is proven.

Do not update routing policy from one minor impression.

Do not record unverified assumptions as model-performance evidence.

Archive obsolete registry entries when they no longer improve future routing.
