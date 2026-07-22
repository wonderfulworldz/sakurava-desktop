import { describe, expect, it } from "vitest";
import {
  RECOVERABLE_LOGICAL_TRANSACTION,
  commitTranslationTransaction,
  createTranslationRecoveryExport,
  createTranslationTransactionPlan,
  inspectPendingTranslationTransaction,
  inspectRawTranslationSnapshot,
  readRawTranslationSnapshot,
  recoverTranslationTransaction,
  translationStorageKeys,
  type RawTranslationSnapshot,
  type TranslationStorage,
} from "./translationStorage";

type Operation = { op: "getItem" | "setItem" | "removeItem"; key: string; value?: string };

class FakeStorage implements TranslationStorage {
  readonly values = new Map<string, string>();
  readonly operations: Operation[] = [];
  private readonly failures = new Map<string, Set<number>>();
  private readonly mismatches = new Map<string, Map<number, string | null>>();
  private readonly counts = new Map<string, number>();

  constructor(initial: Readonly<Record<string, string>> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }

  fail(operation: Operation["op"], key: string, occurrence = 1): void {
    const id = `${operation}:${key}`;
    const values = this.failures.get(id) ?? new Set<number>();
    values.add(occurrence);
    this.failures.set(id, values);
  }

  mismatchGet(key: string, value: string | null, occurrence = 1): void {
    const values = this.mismatches.get(key) ?? new Map<number, string | null>();
    values.set(occurrence, value);
    this.mismatches.set(key, values);
  }

  private occurrence(operation: Operation["op"], key: string): number {
    const id = `${operation}:${key}`;
    const next = (this.counts.get(id) ?? 0) + 1;
    this.counts.set(id, next);
    if (this.failures.get(id)?.has(next)) throw new Error(`${id}:${next}`);
    return next;
  }

  getItem(key: string): string | null {
    this.operations.push({ op: "getItem", key });
    const occurrence = this.occurrence("getItem", key);
    const mismatch = this.mismatches.get(key);
    if (mismatch?.has(occurrence)) return mismatch.get(occurrence) ?? null;
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.operations.push({ op: "setItem", key, value });
    this.occurrence("setItem", key);
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.operations.push({ op: "removeItem", key });
    this.occurrence("removeItem", key);
    this.values.delete(key);
  }
}

const keys = translationStorageKeys;

function snapshot(
  selected: string | null = "en",
  custom: string | null = "[]",
  overrides: string | null = "{}",
  journal: string | null = null,
): RawTranslationSnapshot {
  return {
    state: {
      [keys.selectedLanguage]: selected,
      [keys.customLanguages]: custom,
      [keys.languageOverrides]: overrides,
    },
    journal,
  };
}

function storageFrom(value: RawTranslationSnapshot): FakeStorage {
  const initial: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value.state)) {
    if (raw !== null) initial[key] = raw;
  }
  if (value.journal !== null) initial[keys.transactionJournal] = value.journal;
  return new FakeStorage(initial);
}

function planFor(
  before = snapshot(),
  requested: Readonly<Record<string, string | null>> = { [keys.selectedLanguage]: "id" },
) {
  const result = createTranslationTransactionPlan(before, "transaction-1", requested);
  if (!result.ok) throw new Error(`Unexpected plan error: ${result.code}`);
  return result.plan;
}

function stateWriteOperations(storage: FakeStorage): Operation[] {
  return storage.operations.filter(
    (operation) =>
      operation.op !== "getItem" && operation.key !== keys.transactionJournal,
  );
}

describe("lossless Translation storage foundation", () => {
  it("preserves exact raw strings in snapshots", () => {
    const expected = snapshot(" ID ", '[\r\n {"x":" y "}\r\n]', '{"id":{"key":"a\\nb"}}');
    const result = readRawTranslationSnapshot(storageFrom(expected));
    expect(result).toEqual({ ok: true, snapshot: expected });
  });

  it("distinguishes null from an empty string", () => {
    const result = readRawTranslationSnapshot(storageFrom(snapshot(null, "", null)));
    expect(result.ok && result.snapshot.state[keys.selectedLanguage]).toBeNull();
    expect(result.ok && result.snapshot.state[keys.customLanguages]).toBe("");
  });

  it("snapshot reads perform no writes or removals", () => {
    const storage = storageFrom(snapshot());
    readRawTranslationSnapshot(storage);
    expect(storage.operations.every(({ op }) => op === "getItem")).toBe(true);
  });

  it("returns structured storage read failures", () => {
    const storage = storageFrom(snapshot());
    storage.fail("getItem", keys.customLanguages);
    expect(readRawTranslationSnapshot(storage)).toMatchObject({
      ok: false,
      failure: { operation: "getItem", key: keys.customLanguages },
    });
  });

  it("retains malformed custom-language JSON exactly", () => {
    const inspection = inspectRawTranslationSnapshot(snapshot("en", " {bad ", "{}"));
    expect(inspection.rejectedRawValues[keys.customLanguages]).toBe(" {bad ");
  });

  it("retains malformed override JSON exactly", () => {
    const inspection = inspectRawTranslationSnapshot(snapshot("en", "[]", "{oops"));
    expect(inspection.rejectedRawValues[keys.languageOverrides]).toBe("{oops");
  });

  it("parses valid JSON without rewriting raw text", () => {
    const raw = '{ "id" : { "k" : " v " } }';
    const inspection = inspectRawTranslationSnapshot(snapshot("en", "[]", raw));
    expect(inspection.values[keys.languageOverrides].raw).toBe(raw);
    expect(inspection.values[keys.languageOverrides].parsed).toEqual({ id: { k: " v " } });
  });

  it("diagnoses duplicate object properties", () => {
    const inspection = inspectRawTranslationSnapshot(snapshot("en", '[]{"bad":true}', '{"id":{"a":1,"a":2}}'));
    expect(inspection.diagnostics).toContainEqual({
      code: "duplicate_json_property",
      path: "$.id",
      propertyName: "a",
    });
  });

  it("does not classify repeated array values as duplicate properties", () => {
    const inspection = inspectRawTranslationSnapshot(snapshot("en", '["id","id"]', '{"x":["a","a"]}'));
    expect(inspection.diagnostics).toEqual([]);
  });

  it("handles escaped quotes and escaped property names", () => {
    const inspection = inspectRawTranslationSnapshot(
      snapshot("en", "[]", '{"a\\\"b":1,"a\\u0022b":2,"value":"a\\\"b"}'),
    );
    expect(inspection.diagnostics).toContainEqual({
      code: "duplicate_json_property",
      path: "$",
      propertyName: 'a"b',
    });
  });

  it("classifies clean storage", () => {
    expect(inspectRawTranslationSnapshot(snapshot()).classification).toBe("clean");
  });

  it("classifies one malformed state value as recoverable", () => {
    expect(inspectRawTranslationSnapshot(snapshot("en", "bad", "{}")).classification).toBe("recoverable");
  });

  it("classifies duplicate properties as ambiguous", () => {
    expect(
      inspectRawTranslationSnapshot(snapshot("en", "[]", '{"x":1,"x":2}')).classification,
    ).toBe("ambiguous");
  });

  it("classifies two malformed state values as fatal", () => {
    expect(inspectRawTranslationSnapshot(snapshot("en", "bad", "also bad")).classification).toBe("fatal");
  });

  it("classifies any pending journal as transaction recovery required", () => {
    expect(inspectRawTranslationSnapshot(snapshot("en", "[]", "{}", "bad")).classification).toBe(
      "transaction_recovery_required",
    );
  });

  it("plans complete exact before and after states", () => {
    const before = snapshot("en", "[]", '{"id":{"x":" y "}}');
    const plan = planFor(before, { [keys.selectedLanguage]: " id " });
    expect(plan.journal.before).toEqual(before.state);
    expect(plan.journal.after).toEqual({ ...before.state, [keys.selectedLanguage]: " id " });
  });

  it("rejects unknown transaction keys", () => {
    expect(createTranslationTransactionPlan(snapshot(), "x", { unknown: "x" })).toEqual({
      ok: false,
      code: "unknown_storage_key",
      key: "unknown",
    });
  });

  it("rejects direct journal writes", () => {
    expect(
      createTranslationTransactionPlan(snapshot(), "x", { [keys.transactionJournal]: "x" }),
    ).toEqual({ ok: false, code: "journal_write_forbidden", key: keys.transactionJournal });
  });

  it("rejects empty transaction identifiers and empty requests", () => {
    expect(createTranslationTransactionPlan(snapshot(), "", { [keys.selectedLanguage]: "id" })).toMatchObject({ ok: false });
    expect(createTranslationTransactionPlan(snapshot(), "x", {})).toEqual({ ok: false, code: "no_requested_writes" });
  });

  it("writes and verifies the journal before state keys", () => {
    const storage = storageFrom(snapshot());
    expect(commitTranslationTransaction(storage, planFor()).ok).toBe(true);
    const journalWrite = storage.operations.findIndex(({ op, key }) => op === "setItem" && key === keys.transactionJournal);
    const stateWrite = storage.operations.findIndex(({ op, key }) => op === "setItem" && key === keys.selectedLanguage);
    const journalRead = storage.operations.findIndex(({ op, key }, index) => index > journalWrite && op === "getItem" && key === keys.transactionJournal);
    expect(journalWrite).toBeLessThan(journalRead);
    expect(journalRead).toBeLessThan(stateWrite);
  });

  it("commits verified state and removes the journal", () => {
    const storage = storageFrom(snapshot());
    expect(commitTranslationTransaction(storage, planFor())).toMatchObject({ ok: true, status: "committed" });
    expect(storage.values.get(keys.selectedLanguage)).toBe("id");
    expect(storage.values.has(keys.transactionJournal)).toBe(false);
  });

  it("preserves exact strings during commit", () => {
    const storage = storageFrom(snapshot());
    const exact = "  ID\r\n";
    commitTranslationTransaction(storage, planFor(snapshot(), { [keys.selectedLanguage]: exact }));
    expect(storage.values.get(keys.selectedLanguage)).toBe(exact);
  });

  it("treats requested null as key removal", () => {
    const storage = storageFrom(snapshot());
    commitTranslationTransaction(storage, planFor(snapshot(), { [keys.customLanguages]: null }));
    expect(storage.values.has(keys.customLanguages)).toBe(false);
  });

  it("rejects stale snapshots before state-key mutation", () => {
    const storage = storageFrom(snapshot("id"));
    const result = commitTranslationTransaction(storage, planFor(snapshot("en")));
    expect(result).toMatchObject({ ok: false, status: "stale_snapshot", stateKeyMutationPerformed: false });
    expect(stateWriteOperations(storage)).toEqual([]);
  });

  it("journal write failure causes no state-key mutation", () => {
    const storage = storageFrom(snapshot());
    storage.fail("setItem", keys.transactionJournal);
    expect(commitTranslationTransaction(storage, planFor())).toMatchObject({ ok: false, stage: "write_journal" });
    expect(stateWriteOperations(storage)).toEqual([]);
  });

  it("journal readback mismatch causes no state-key mutation", () => {
    const storage = storageFrom(snapshot());
    storage.mismatchGet(keys.transactionJournal, "mismatch", 1);
    expect(commitTranslationTransaction(storage, planFor())).toMatchObject({ ok: false, stage: "verify_journal" });
    expect(stateWriteOperations(storage)).toEqual([]);
  });

  it("state-key write failure triggers exact rollback", () => {
    const before = snapshot();
    const storage = storageFrom(before);
    storage.fail("setItem", keys.selectedLanguage);
    const result = commitTranslationTransaction(storage, planFor(before));
    expect(result).toMatchObject({ ok: false, rollback: "succeeded" });
    expect(readRawTranslationSnapshot(storage)).toEqual({ ok: true, snapshot: before });
  });

  it("state-key removal failure triggers exact rollback", () => {
    const before = snapshot();
    const storage = storageFrom(before);
    storage.fail("removeItem", keys.customLanguages);
    const result = commitTranslationTransaction(storage, planFor(before, { [keys.customLanguages]: null }));
    expect(result).toMatchObject({ ok: false, rollback: "succeeded" });
    expect(readRawTranslationSnapshot(storage)).toEqual({ ok: true, snapshot: before });
  });

  it("state readback mismatch triggers exact rollback", () => {
    const before = snapshot();
    const storage = storageFrom(before);
    storage.mismatchGet(keys.selectedLanguage, "mismatch", 2);
    const result = commitTranslationTransaction(storage, planFor(before));
    expect(result).toMatchObject({ ok: false, rollback: "succeeded" });
    expect(storage.values.get(keys.selectedLanguage)).toBe("en");
  });

  it("successful rollback removes the journal", () => {
    const storage = storageFrom(snapshot());
    storage.fail("setItem", keys.selectedLanguage);
    commitTranslationTransaction(storage, planFor());
    expect(storage.values.has(keys.transactionJournal)).toBe(false);
  });

  it("rollback failure requires recovery and preserves the journal", () => {
    const storage = storageFrom(snapshot());
    storage.fail("setItem", keys.customLanguages, 1);
    storage.fail("setItem", keys.selectedLanguage, 2);
    const result = commitTranslationTransaction(
      storage,
      planFor(snapshot(), {
        [keys.selectedLanguage]: "id",
        [keys.customLanguages]: '[{"code":"id"}]',
      }),
    );
    expect(result).toMatchObject({ ok: false, status: "transaction_recovery_required", rollback: "failed", journalPreserved: true });
    expect(storage.values.has(keys.transactionJournal)).toBe(true);
  });

  it("recognizes complete after-state when journal removal fails", () => {
    const storage = storageFrom(snapshot());
    storage.fail("removeItem", keys.transactionJournal);
    const result = commitTranslationTransaction(storage, planFor());
    expect(result).toMatchObject({ ok: false, status: "transaction_recovery_required", stage: "remove_journal" });
    const current = readRawTranslationSnapshot(storage);
    expect(current.ok && inspectPendingTranslationTransaction(current.snapshot).state).toBe("after_state");
  });

  it("inspects no pending transaction", () => {
    expect(inspectPendingTranslationTransaction(snapshot()).state).toBe("no_pending_transaction");
  });

  it("inspects a pending before state", () => {
    const plan = planFor();
    expect(inspectPendingTranslationTransaction(snapshot("en", "[]", "{}", plan.serializedJournal)).state).toBe("before_state");
  });

  it("inspects a pending after state", () => {
    const plan = planFor();
    expect(inspectPendingTranslationTransaction(snapshot("id", "[]", "{}", plan.serializedJournal)).state).toBe("after_state");
  });

  it("inspects a mixed before and after state", () => {
    const before = snapshot();
    const plan = planFor(before, { [keys.selectedLanguage]: "id", [keys.customLanguages]: '[{"code":"id"}]' });
    const mixed = snapshot("id", "[]", "{}", plan.serializedJournal);
    expect(inspectPendingTranslationTransaction(mixed).state).toBe("mixed_state");
  });

  it("inspects a state divergent from both versions", () => {
    const plan = planFor();
    expect(inspectPendingTranslationTransaction(snapshot("jp", "[]", "{}", plan.serializedJournal)).state).toBe("diverged_state");
  });

  it("retains invalid journal raw text exactly", () => {
    const raw = " {not-journal ";
    expect(inspectPendingTranslationTransaction(snapshot("en", "[]", "{}", raw))).toMatchObject({ state: "invalid_journal", rawJournal: raw });
  });

  it("explicit rollback recovery restores exact before state", () => {
    const plan = planFor();
    const storage = storageFrom(snapshot("id", "[]", "{}", plan.serializedJournal));
    expect(recoverTranslationTransaction(storage, "rollback")).toEqual({ ok: true, status: "recovered", direction: "rollback" });
    expect(storage.values.get(keys.selectedLanguage)).toBe("en");
  });

  it("explicit completion recovery restores exact after state", () => {
    const plan = planFor();
    const storage = storageFrom(snapshot("en", "[]", "{}", plan.serializedJournal));
    expect(recoverTranslationTransaction(storage, "complete")).toEqual({ ok: true, status: "recovered", direction: "complete" });
    expect(storage.values.get(keys.selectedLanguage)).toBe("id");
  });

  it("recovery removes the journal only after state verification", () => {
    const plan = planFor();
    const storage = storageFrom(snapshot("en", "[]", "{}", plan.serializedJournal));
    recoverTranslationTransaction(storage, "complete");
    const removeIndex = storage.operations.findIndex(({ op, key }) => op === "removeItem" && key === keys.transactionJournal);
    const finalStateRead = storage.operations.reduce((last, operation, index) => operation.op === "getItem" && operation.key === keys.languageOverrides ? index : last, -1);
    expect(finalStateRead).toBeLessThan(removeIndex);
  });

  it("failed recovery preserves a recovery-required journal", () => {
    const plan = planFor();
    const storage = storageFrom(snapshot("en", "[]", "{}", plan.serializedJournal));
    storage.fail("setItem", keys.selectedLanguage);
    expect(recoverTranslationTransaction(storage, "complete")).toMatchObject({ ok: false, status: "transaction_recovery_required", journalPreserved: true });
  });

  it("rejects recovery for invalid journals without state mutation", () => {
    const storage = storageFrom(snapshot("en", "[]", "{}", "invalid"));
    expect(recoverTranslationTransaction(storage, "rollback")).toMatchObject({ ok: false, status: "invalid_journal" });
    expect(stateWriteOperations(storage)).toEqual([]);
  });

  it("creates a serializable exact recovery export", () => {
    const value = snapshot(" ID ", "{bad", '{"id":{"x":" y "}}', "bad journal");
    const exported = createTranslationRecoveryExport(value, "rollback");
    expect(exported.snapshot).toEqual(value);
    expect(exported.rawJournal).toBe("bad journal");
    expect(exported.requestedRecoveryDirection).toBe("rollback");
    expect(JSON.parse(JSON.stringify(exported)).snapshot).toEqual(value);
  });

  it("exports transaction strategy and immutable approved keys", () => {
    expect(RECOVERABLE_LOGICAL_TRANSACTION).toBe("RECOVERABLE_LOGICAL_TRANSACTION");
    expect(Object.isFrozen(translationStorageKeys)).toBe(true);
    expect(translationStorageKeys).toEqual({
      selectedLanguage: "sakurava.language.selected.v1",
      customLanguages: "sakurava.customLanguages.v1",
      languageOverrides: "sakurava.languageOverrides.v1",
      transactionJournal: "sakurava.translationTransaction.v1",
    });
  });

  it("module import and inspection cause no storage mutation", async () => {
    const storage = storageFrom(snapshot());
    await import("./translationStorage");
    const result = readRawTranslationSnapshot(storage);
    if (result.ok) inspectRawTranslationSnapshot(result.snapshot);
    expect(storage.operations.every(({ op }) => op === "getItem")).toBe(true);
  });
});
