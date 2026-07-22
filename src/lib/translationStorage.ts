export const RECOVERABLE_LOGICAL_TRANSACTION =
  "RECOVERABLE_LOGICAL_TRANSACTION" as const;

export const translationStorageKeys = Object.freeze({
  selectedLanguage: "sakurava.language.selected.v1",
  customLanguages: "sakurava.customLanguages.v1",
  languageOverrides: "sakurava.languageOverrides.v1",
  transactionJournal: "sakurava.translationTransaction.v1",
} as const);

export type TranslationStateKey =
  | typeof translationStorageKeys.selectedLanguage
  | typeof translationStorageKeys.customLanguages
  | typeof translationStorageKeys.languageOverrides;

export type TranslationStorageKey =
  | TranslationStateKey
  | typeof translationStorageKeys.transactionJournal;

export interface TranslationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type RawTranslationState = Readonly<Record<TranslationStateKey, string | null>>;

export interface RawTranslationSnapshot {
  readonly state: RawTranslationState;
  readonly journal: string | null;
}

export interface StorageFailure {
  readonly operation: "getItem" | "setItem" | "removeItem";
  readonly key: string;
  readonly message: string;
}

export type SnapshotReadResult =
  | { readonly ok: true; readonly snapshot: RawTranslationSnapshot }
  | { readonly ok: false; readonly failure: StorageFailure };

export interface DuplicatePropertyDiagnostic {
  readonly code: "duplicate_json_property";
  readonly path: string;
  readonly propertyName: string;
}

export interface ParseErrorDiagnostic {
  readonly code: "json_parse_error";
  readonly key: TranslationStorageKey;
  readonly message: string;
}

export type TranslationStorageDiagnostic =
  | DuplicatePropertyDiagnostic
  | ParseErrorDiagnostic;

export interface InspectedRawValue {
  readonly raw: string | null;
  readonly present: boolean;
  readonly parsed?: unknown;
  readonly rejectedRaw?: string;
  readonly diagnostics: readonly TranslationStorageDiagnostic[];
}

export type StorageClassification =
  | "clean"
  | "recoverable"
  | "ambiguous"
  | "fatal"
  | "transaction_recovery_required";

export interface TranslationStorageInspection {
  readonly snapshot: RawTranslationSnapshot;
  readonly values: Readonly<Record<TranslationStorageKey, InspectedRawValue>>;
  readonly rejectedRawValues: Readonly<Partial<Record<TranslationStorageKey, string>>>;
  readonly diagnostics: readonly TranslationStorageDiagnostic[];
  readonly classification: StorageClassification;
}

export interface TranslationTransactionJournal {
  readonly schemaVersion: 1;
  readonly kind: typeof RECOVERABLE_LOGICAL_TRANSACTION;
  readonly transactionId: string;
  readonly requestedKeys: readonly TranslationStateKey[];
  readonly before: RawTranslationState;
  readonly after: RawTranslationState;
}

export interface TranslationTransactionPlan {
  readonly journal: TranslationTransactionJournal;
  readonly serializedJournal: string;
}

export type TransactionPlanResult =
  | { readonly ok: true; readonly plan: TranslationTransactionPlan }
  | {
      readonly ok: false;
      readonly code:
        | "invalid_transaction_id"
        | "no_requested_writes"
        | "unknown_storage_key"
        | "journal_write_forbidden"
        | "invalid_requested_value";
      readonly key?: string;
    };

export type TransactionCommitResult =
  | {
      readonly ok: true;
      readonly status: "committed";
      readonly kind: typeof RECOVERABLE_LOGICAL_TRANSACTION;
      readonly transactionId: string;
    }
  | {
      readonly ok: false;
      readonly status: "stale_snapshot";
      readonly expected: RawTranslationState;
      readonly observed: RawTranslationState;
      readonly stateKeyMutationPerformed: false;
    }
  | {
      readonly ok: false;
      readonly status: "failed" | "transaction_recovery_required";
      readonly stage: string;
      readonly failure: StorageFailure | { readonly message: string };
      readonly rollback: "not_attempted" | "succeeded" | "failed";
      readonly journalPreserved: boolean;
    };

export type PendingTransactionState =
  | "no_pending_transaction"
  | "invalid_journal"
  | "before_state"
  | "after_state"
  | "mixed_state"
  | "diverged_state";

export interface PendingTransactionInspection {
  readonly state: PendingTransactionState;
  readonly recoveryRequired: boolean;
  readonly rawJournal: string | null;
  readonly journal?: TranslationTransactionJournal;
  readonly diagnostics: readonly TranslationStorageDiagnostic[];
}

export type RecoveryDirection = "rollback" | "complete";

export type RecoveryResult =
  | {
      readonly ok: true;
      readonly status: "recovered";
      readonly direction: RecoveryDirection;
    }
  | {
      readonly ok: false;
      readonly status: "no_pending_transaction" | "invalid_journal" | "transaction_recovery_required";
      readonly failure?: StorageFailure | { readonly message: string };
      readonly journalPreserved: boolean;
    };

export interface TranslationRecoveryExport {
  readonly schemaVersion: 1;
  readonly transactionKind: typeof RECOVERABLE_LOGICAL_TRANSACTION;
  readonly snapshot: RawTranslationSnapshot;
  readonly rawJournal: string | null;
  readonly inspection: TranslationStorageInspection;
  readonly pendingTransaction: PendingTransactionInspection;
  readonly rejectedRawValues: Readonly<Partial<Record<TranslationStorageKey, string>>>;
  readonly diagnostics: readonly TranslationStorageDiagnostic[];
  readonly requestedRecoveryDirection?: RecoveryDirection;
}

const stateKeys = Object.freeze([
  translationStorageKeys.selectedLanguage,
  translationStorageKeys.customLanguages,
  translationStorageKeys.languageOverrides,
] as const);

const allKeys = Object.freeze([...stateKeys, translationStorageKeys.transactionJournal]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getExact(storage: TranslationStorage, key: string):
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly failure: StorageFailure } {
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch (error) {
    return {
      ok: false,
      failure: { operation: "getItem", key, message: errorMessage(error) },
    };
  }
}

function setExact(storage: TranslationStorage, key: string, value: string | null):
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: StorageFailure } {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      failure: {
        operation: value === null ? "removeItem" : "setItem",
        key,
        message: errorMessage(error),
      },
    };
  }
}

function readState(storage: TranslationStorage):
  | { readonly ok: true; readonly state: RawTranslationState }
  | { readonly ok: false; readonly failure: StorageFailure } {
  const values: Partial<Record<TranslationStateKey, string | null>> = {};
  for (const key of stateKeys) {
    const result = getExact(storage, key);
    if (!result.ok) return result;
    values[key] = result.value;
  }
  return { ok: true, state: values as RawTranslationState };
}

export function readRawTranslationSnapshot(storage: TranslationStorage): SnapshotReadResult {
  const stateResult = readState(storage);
  if (!stateResult.ok) return stateResult;
  const journalResult = getExact(storage, translationStorageKeys.transactionJournal);
  if (!journalResult.ok) return journalResult;
  return {
    ok: true,
    snapshot: Object.freeze({
      state: Object.freeze({ ...stateResult.state }),
      journal: journalResult.value,
    }),
  };
}

function pathString(path: readonly (string | number)[]): string {
  return path.reduce<string>((result, part) => {
    if (typeof part === "number") return `${result}[${part}]`;
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part)
      ? `${result}.${part}`
      : `${result}[${JSON.stringify(part)}]`;
  }, "$");
}

function findDuplicateJsonProperties(raw: string): readonly DuplicatePropertyDiagnostic[] {
  JSON.parse(raw);
  let index = 0;
  const diagnostics: DuplicatePropertyDiagnostic[] = [];

  const whitespace = () => {
    while (/\s/.test(raw[index] ?? "")) index += 1;
  };
  const stringToken = (): string => {
    const start = index;
    index += 1;
    let escaped = false;
    while (index < raw.length) {
      const character = raw[index];
      index += 1;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') break;
    }
    return JSON.parse(raw.slice(start, index)) as string;
  };
  const value = (path: readonly (string | number)[]): void => {
    whitespace();
    if (raw[index] === "{") {
      index += 1;
      whitespace();
      const seen = new Set<string>();
      if (raw[index] === "}") {
        index += 1;
        return;
      }
      while (index < raw.length) {
        whitespace();
        const propertyName = stringToken();
        if (seen.has(propertyName)) {
          diagnostics.push({
            code: "duplicate_json_property",
            path: pathString(path),
            propertyName,
          });
        }
        seen.add(propertyName);
        whitespace();
        index += 1;
        value([...path, propertyName]);
        whitespace();
        if (raw[index] === "}") {
          index += 1;
          return;
        }
        index += 1;
      }
      return;
    }
    if (raw[index] === "[") {
      index += 1;
      whitespace();
      if (raw[index] === "]") {
        index += 1;
        return;
      }
      let itemIndex = 0;
      while (index < raw.length) {
        value([...path, itemIndex]);
        itemIndex += 1;
        whitespace();
        if (raw[index] === "]") {
          index += 1;
          return;
        }
        index += 1;
      }
      return;
    }
    if (raw[index] === '"') {
      stringToken();
      return;
    }
    while (index < raw.length && !/[\s,}\]]/.test(raw[index])) index += 1;
  };

  value([]);
  return diagnostics;
}

function inspectJsonValue(key: TranslationStorageKey, raw: string | null): InspectedRawValue {
  if (raw === null) return { raw, present: false, diagnostics: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    return {
      raw,
      present: true,
      parsed,
      diagnostics: findDuplicateJsonProperties(raw),
    };
  } catch (error) {
    const diagnostic: ParseErrorDiagnostic = {
      code: "json_parse_error",
      key,
      message: errorMessage(error),
    };
    return { raw, present: true, rejectedRaw: raw, diagnostics: [diagnostic] };
  }
}

export function inspectRawTranslationSnapshot(
  snapshot: RawTranslationSnapshot,
): TranslationStorageInspection {
  const selectedRaw = snapshot.state[translationStorageKeys.selectedLanguage];
  const selected: InspectedRawValue = {
    raw: selectedRaw,
    present: selectedRaw !== null,
    ...(selectedRaw === null ? {} : { parsed: selectedRaw }),
    diagnostics: [],
  };
  const custom = inspectJsonValue(
    translationStorageKeys.customLanguages,
    snapshot.state[translationStorageKeys.customLanguages],
  );
  const overrides = inspectJsonValue(
    translationStorageKeys.languageOverrides,
    snapshot.state[translationStorageKeys.languageOverrides],
  );
  const journal = inspectJsonValue(translationStorageKeys.transactionJournal, snapshot.journal);
  const values = Object.freeze({
    [translationStorageKeys.selectedLanguage]: selected,
    [translationStorageKeys.customLanguages]: custom,
    [translationStorageKeys.languageOverrides]: overrides,
    [translationStorageKeys.transactionJournal]: journal,
  }) as Readonly<Record<TranslationStorageKey, InspectedRawValue>>;
  const diagnostics = allKeys.flatMap((key) => values[key].diagnostics);
  const rejectedRawValues: Partial<Record<TranslationStorageKey, string>> = {};
  for (const key of allKeys) {
    if (values[key].rejectedRaw !== undefined) rejectedRawValues[key] = values[key].rejectedRaw;
  }
  const malformedStateCount = [custom, overrides].filter(
    (entry) => entry.rejectedRaw !== undefined,
  ).length;
  const duplicateCount = diagnostics.filter(
    (diagnostic) => diagnostic.code === "duplicate_json_property",
  ).length;
  let classification: StorageClassification = "clean";
  if (snapshot.journal !== null) classification = "transaction_recovery_required";
  else if (malformedStateCount === 2) classification = "fatal";
  else if (duplicateCount > 0) classification = "ambiguous";
  else if (malformedStateCount === 1) classification = "recoverable";
  return {
    snapshot,
    values,
    rejectedRawValues: Object.freeze(rejectedRawValues),
    diagnostics,
    classification,
  };
}

function isStateKey(key: string): key is TranslationStateKey {
  return (stateKeys as readonly string[]).includes(key);
}

function sameState(left: RawTranslationState, right: RawTranslationState): boolean {
  return stateKeys.every((key) => left[key] === right[key]);
}

export function createTranslationTransactionPlan(
  snapshot: RawTranslationSnapshot,
  transactionId: string,
  requested: Readonly<Record<string, string | null | undefined>>,
): TransactionPlanResult {
  if (typeof transactionId !== "string" || transactionId.length === 0) {
    return { ok: false, code: "invalid_transaction_id" };
  }
  const requestedEntries = Object.entries(requested);
  if (requestedEntries.length === 0) return { ok: false, code: "no_requested_writes" };
  for (const [key, value] of requestedEntries) {
    if (key === translationStorageKeys.transactionJournal) {
      return { ok: false, code: "journal_write_forbidden", key };
    }
    if (!isStateKey(key)) return { ok: false, code: "unknown_storage_key", key };
    if (value !== null && typeof value !== "string") {
      return { ok: false, code: "invalid_requested_value", key };
    }
  }
  const before = Object.freeze({ ...snapshot.state });
  const afterValues: Record<TranslationStateKey, string | null> = { ...snapshot.state };
  const requestedKeys = stateKeys.filter((key) => Object.prototype.hasOwnProperty.call(requested, key));
  for (const key of requestedKeys) afterValues[key] = requested[key] ?? null;
  const after = Object.freeze(afterValues);
  const journal: TranslationTransactionJournal = Object.freeze({
    schemaVersion: 1,
    kind: RECOVERABLE_LOGICAL_TRANSACTION,
    transactionId,
    requestedKeys: Object.freeze([...requestedKeys]),
    before,
    after,
  });
  return {
    ok: true,
    plan: Object.freeze({ journal, serializedJournal: JSON.stringify(journal) }),
  };
}

function restoreState(storage: TranslationStorage, state: RawTranslationState):
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: StorageFailure } {
  let firstFailure: StorageFailure | null = null;
  for (const key of stateKeys) {
    const write = setExact(storage, key, state[key]);
    if (!write.ok && firstFailure === null) firstFailure = write.failure;
  }
  const observed = readState(storage);
  if (!observed.ok) return observed;
  if (!sameState(state, observed.state)) {
    return {
      ok: false,
      failure:
        firstFailure ??
        { operation: "getItem", key: "translation-state", message: "Exact state verification failed." },
    };
  }
  return { ok: true };
}

function preserveJournal(storage: TranslationStorage, rawJournal: string): boolean {
  const write = setExact(storage, translationStorageKeys.transactionJournal, rawJournal);
  if (!write.ok) return false;
  const read = getExact(storage, translationStorageKeys.transactionJournal);
  return read.ok && read.value === rawJournal;
}

function cleanJournal(storage: TranslationStorage): boolean {
  const removal = setExact(storage, translationStorageKeys.transactionJournal, null);
  if (!removal.ok) return false;
  const read = getExact(storage, translationStorageKeys.transactionJournal);
  return read.ok && read.value === null;
}

function inspectJournalPresence(storage: TranslationStorage): boolean {
  const read = getExact(storage, translationStorageKeys.transactionJournal);
  return !read.ok || read.value !== null;
}

export function commitTranslationTransaction(
  storage: TranslationStorage,
  plan: TranslationTransactionPlan,
): TransactionCommitResult {
  const current = readState(storage);
  if (!current.ok) {
    return {
      ok: false,
      status: "failed",
      stage: "read_current_state",
      failure: current.failure,
      rollback: "not_attempted",
      journalPreserved: false,
    };
  }
  if (!sameState(current.state, plan.journal.before)) {
    return {
      ok: false,
      status: "stale_snapshot",
      expected: plan.journal.before,
      observed: current.state,
      stateKeyMutationPerformed: false,
    };
  }
  const journalWrite = setExact(
    storage,
    translationStorageKeys.transactionJournal,
    plan.serializedJournal,
  );
  if (!journalWrite.ok) {
    const cleaned = cleanJournal(storage);
    return {
      ok: false,
      status: cleaned ? "failed" : "transaction_recovery_required",
      stage: "write_journal",
      failure: journalWrite.failure,
      rollback: "not_attempted",
      journalPreserved: !cleaned && inspectJournalPresence(storage),
    };
  }
  const journalRead = getExact(storage, translationStorageKeys.transactionJournal);
  if (!journalRead.ok || journalRead.value !== plan.serializedJournal) {
    const cleaned = cleanJournal(storage);
    return {
      ok: false,
      status: cleaned ? "failed" : "transaction_recovery_required",
      stage: "verify_journal",
      failure: journalRead.ok
        ? { message: "Exact journal verification failed." }
        : journalRead.failure,
      rollback: "not_attempted",
      journalPreserved: !cleaned && inspectJournalPresence(storage),
    };
  }

  let stateFailure: StorageFailure | { readonly message: string } | null = null;
  for (const key of plan.journal.requestedKeys) {
    const write = setExact(storage, key, plan.journal.after[key]);
    if (!write.ok) {
      stateFailure = write.failure;
      break;
    }
    const read = getExact(storage, key);
    if (!read.ok || read.value !== plan.journal.after[key]) {
      stateFailure = read.ok ? { message: `Exact readback verification failed for ${key}.` } : read.failure;
      break;
    }
  }
  if (stateFailure) {
    const rollback = restoreState(storage, plan.journal.before);
    if (rollback.ok) {
      const removed = cleanJournal(storage);
      return {
        ok: false,
        status: removed ? "failed" : "transaction_recovery_required",
        stage: "apply_state",
        failure: stateFailure,
        rollback: "succeeded",
        journalPreserved: !removed && preserveJournal(storage, plan.serializedJournal),
      };
    }
    return {
      ok: false,
      status: "transaction_recovery_required",
      stage: "rollback",
      failure: rollback.failure,
      rollback: "failed",
      journalPreserved: preserveJournal(storage, plan.serializedJournal),
    };
  }

  const finalState = readState(storage);
  if (!finalState.ok || !sameState(finalState.state, plan.journal.after)) {
    const rollback = restoreState(storage, plan.journal.before);
    if (rollback.ok) {
      const removed = cleanJournal(storage);
      return {
        ok: false,
        status: removed ? "failed" : "transaction_recovery_required",
        stage: "verify_complete_state",
        failure: finalState.ok
          ? { message: "Complete after-state verification failed." }
          : finalState.failure,
        rollback: "succeeded",
        journalPreserved: !removed && preserveJournal(storage, plan.serializedJournal),
      };
    }
    return {
      ok: false,
      status: "transaction_recovery_required",
      stage: "rollback",
      failure: rollback.failure,
      rollback: "failed",
      journalPreserved: preserveJournal(storage, plan.serializedJournal),
    };
  }
  if (!cleanJournal(storage)) {
    return {
      ok: false,
      status: "transaction_recovery_required",
      stage: "remove_journal",
      failure: { message: "After-state is complete but journal finalization failed." },
      rollback: "not_attempted",
      journalPreserved: preserveJournal(storage, plan.serializedJournal),
    };
  }
  return {
    ok: true,
    status: "committed",
    kind: RECOVERABLE_LOGICAL_TRANSACTION,
    transactionId: plan.journal.transactionId,
  };
}

function isRawState(value: unknown): value is RawTranslationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return stateKeys.every((key) => record[key] === null || typeof record[key] === "string");
}

function parseJournal(rawJournal: string):
  | { readonly ok: true; readonly journal: TranslationTransactionJournal; readonly diagnostics: readonly TranslationStorageDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly TranslationStorageDiagnostic[] } {
  const inspected = inspectJsonValue(translationStorageKeys.transactionJournal, rawJournal);
  if (inspected.rejectedRaw !== undefined || inspected.diagnostics.length > 0) {
    return { ok: false, diagnostics: inspected.diagnostics };
  }
  const value = inspected.parsed;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, diagnostics: [] };
  const candidate = value as Partial<TranslationTransactionJournal>;
  if (
    candidate.schemaVersion !== 1 ||
    candidate.kind !== RECOVERABLE_LOGICAL_TRANSACTION ||
    typeof candidate.transactionId !== "string" ||
    !Array.isArray(candidate.requestedKeys) ||
    candidate.requestedKeys.length === 0 ||
    !candidate.requestedKeys.every((key) => typeof key === "string" && isStateKey(key)) ||
    !isRawState(candidate.before) ||
    !isRawState(candidate.after)
  ) {
    return { ok: false, diagnostics: [] };
  }
  return { ok: true, journal: candidate as TranslationTransactionJournal, diagnostics: [] };
}

export function inspectPendingTranslationTransaction(
  snapshot: RawTranslationSnapshot,
): PendingTransactionInspection {
  if (snapshot.journal === null) {
    return { state: "no_pending_transaction", recoveryRequired: false, rawJournal: null, diagnostics: [] };
  }
  const parsed = parseJournal(snapshot.journal);
  if (!parsed.ok) {
    return {
      state: "invalid_journal",
      recoveryRequired: true,
      rawJournal: snapshot.journal,
      diagnostics: parsed.diagnostics,
    };
  }
  const beforeMatches = stateKeys.map((key) => snapshot.state[key] === parsed.journal.before[key]);
  const afterMatches = stateKeys.map((key) => snapshot.state[key] === parsed.journal.after[key]);
  let state: PendingTransactionState;
  if (afterMatches.every(Boolean)) state = "after_state";
  else if (beforeMatches.every(Boolean)) state = "before_state";
  else if (stateKeys.every((_, index) => beforeMatches[index] || afterMatches[index])) state = "mixed_state";
  else state = "diverged_state";
  return {
    state,
    recoveryRequired: true,
    rawJournal: snapshot.journal,
    journal: parsed.journal,
    diagnostics: parsed.diagnostics,
  };
}

export function recoverTranslationTransaction(
  storage: TranslationStorage,
  direction: RecoveryDirection,
): RecoveryResult {
  const snapshotResult = readRawTranslationSnapshot(storage);
  if (!snapshotResult.ok) {
    return {
      ok: false,
      status: "transaction_recovery_required",
      failure: snapshotResult.failure,
      journalPreserved: false,
    };
  }
  const pending = inspectPendingTranslationTransaction(snapshotResult.snapshot);
  if (pending.state === "no_pending_transaction") {
    return { ok: false, status: "no_pending_transaction", journalPreserved: false };
  }
  if (!pending.journal || pending.rawJournal === null) {
    return { ok: false, status: "invalid_journal", journalPreserved: true };
  }
  const target = direction === "rollback" ? pending.journal.before : pending.journal.after;
  const restored = restoreState(storage, target);
  if (!restored.ok) {
    return {
      ok: false,
      status: "transaction_recovery_required",
      failure: restored.failure,
      journalPreserved: preserveJournal(storage, pending.rawJournal),
    };
  }
  if (!cleanJournal(storage)) {
    return {
      ok: false,
      status: "transaction_recovery_required",
      failure: { message: "Recovery state verified but journal finalization failed." },
      journalPreserved: preserveJournal(storage, pending.rawJournal),
    };
  }
  return { ok: true, status: "recovered", direction };
}

export function createTranslationRecoveryExport(
  snapshot: RawTranslationSnapshot,
  requestedRecoveryDirection?: RecoveryDirection,
): TranslationRecoveryExport {
  const inspection = inspectRawTranslationSnapshot(snapshot);
  const pendingTransaction = inspectPendingTranslationTransaction(snapshot);
  return {
    schemaVersion: 1,
    transactionKind: RECOVERABLE_LOGICAL_TRANSACTION,
    snapshot,
    rawJournal: snapshot.journal,
    inspection,
    pendingTransaction,
    rejectedRawValues: inspection.rejectedRawValues,
    diagnostics: inspection.diagnostics,
    ...(requestedRecoveryDirection === undefined ? {} : { requestedRecoveryDirection }),
  };
}
