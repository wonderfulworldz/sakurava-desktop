import { isCustomLanguageCode, normalizeLanguageIdentity } from "./customLanguages";
import type { LanguageCode } from "./language";
import {
  commitTranslationTransaction,
  createTranslationTransactionPlan,
  inspectRawTranslationSnapshot,
  readRawTranslationSnapshot,
  translationStorageKeys,
  type RawTranslationSnapshot,
  type TranslationStorage,
} from "./translationStorage";

export const languageOverridesStorageKey = translationStorageKeys.languageOverrides;

export type LanguageOverrides = Partial<Record<LanguageCode, Record<string, string>>>;

export type LanguageOverrideDiagnostic = {
  readonly code: "invalid_top_level" | "invalid_language_entry" | "invalid_translation_value" | "duplicate_identity" | "storage_read_failed";
  readonly languageCode?: string;
  readonly key?: string;
  readonly identity?: string;
  readonly message: string;
};

export type LanguageOverridesInspection = {
  readonly classification: "clean" | "recoverable" | "ambiguous" | "fatal" | "transaction_recovery_required";
  readonly raw: string | null;
  readonly overrides: LanguageOverrides;
  readonly rejectedRaw: string | null;
  readonly diagnostics: readonly LanguageOverrideDiagnostic[];
  readonly ambiguousIdentities: readonly string[];
  readonly sourceObject: Readonly<Record<string, unknown>> | null;
  readonly snapshot: RawTranslationSnapshot | null;
};

export type LanguageOverrideMutationResult =
  | { readonly ok: true; readonly status: "committed" | "unchanged" }
  | {
      readonly ok: false;
      readonly status: "storage_unavailable" | "invalid_input" | "unsafe_stored_state" | "stale_snapshot" | "storage_failure" | "transaction_recovery_required";
      readonly error: string;
      readonly recoveryRequired?: boolean;
    };

function browserStorage(): TranslationStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function inspectSnapshot(snapshot: RawTranslationSnapshot): LanguageOverridesInspection {
  const foundation = inspectRawTranslationSnapshot(snapshot);
  const raw = snapshot.state[languageOverridesStorageKey];
  if (foundation.classification === "transaction_recovery_required") {
    return {
      classification: "transaction_recovery_required",
      raw,
      overrides: {},
      rejectedRaw: raw,
      diagnostics: [],
      ambiguousIdentities: [],
      sourceObject: null,
      snapshot,
    };
  }
  const inspected = foundation.values[languageOverridesStorageKey];
  if (raw === null) {
    return {
      classification: foundation.classification,
      raw,
      overrides: {},
      rejectedRaw: null,
      diagnostics: [],
      ambiguousIdentities: [],
      sourceObject: {},
      snapshot,
    };
  }
  if (inspected.rejectedRaw !== undefined || !inspected.parsed || typeof inspected.parsed !== "object" || Array.isArray(inspected.parsed)) {
    return {
      classification: inspected.rejectedRaw !== undefined ? "recoverable" : "fatal",
      raw,
      overrides: {},
      rejectedRaw: raw,
      diagnostics: inspected.rejectedRaw === undefined
        ? [{ code: "invalid_top_level", message: "Language-override storage must be a JSON object." }]
        : [],
      ambiguousIdentities: [],
      sourceObject: null,
      snapshot,
    };
  }

  const sourceObject = inspected.parsed as Record<string, unknown>;
  const identityKeys = new Map<string, string[]>();
  for (const rawCode of Object.keys(sourceObject)) {
    const identity = normalizeLanguageIdentity(rawCode);
    if (!identity) continue;
    identityKeys.set(identity, [...(identityKeys.get(identity) ?? []), rawCode]);
  }
  const ambiguousIdentities = [...identityKeys]
    .filter(([, keys]) => keys.length > 1)
    .map(([identity]) => identity);
  const diagnostics: LanguageOverrideDiagnostic[] = ambiguousIdentities.map((identity) => ({
    code: "duplicate_identity",
    identity,
    message: `Multiple override records normalize to ${identity}.`,
  }));
  const overrides: LanguageOverrides = {};
  for (const [rawCode, values] of Object.entries(sourceObject)) {
    const identity = normalizeLanguageIdentity(rawCode);
    if (!identity || ambiguousIdentities.includes(identity)) continue;
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      diagnostics.push({ code: "invalid_language_entry", languageCode: rawCode, message: "Language overrides must be a JSON object." });
      continue;
    }
    const valid: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "string") valid[key] = value;
      else diagnostics.push({ code: "invalid_translation_value", languageCode: rawCode, key, message: "Translation override values must be strings." });
    }
    if (Object.keys(valid).length > 0) overrides[rawCode] = valid;
  }
  return {
    classification: ambiguousIdentities.length > 0 || foundation.classification === "ambiguous"
      ? "ambiguous"
      : diagnostics.length > 0 || foundation.classification === "recoverable"
        ? "recoverable"
        : foundation.classification,
    raw,
    overrides,
    rejectedRaw: diagnostics.length > 0 ? raw : null,
    diagnostics,
    ambiguousIdentities,
    sourceObject,
    snapshot,
  };
}

export function inspectStoredLanguageOverrides(
  storage: TranslationStorage | null = browserStorage(),
): LanguageOverridesInspection {
  if (!storage) {
    return {
      classification: "fatal",
      raw: null,
      overrides: {},
      rejectedRaw: null,
      diagnostics: [{ code: "storage_read_failed", message: "Language overrides require browser storage." }],
      ambiguousIdentities: [],
      sourceObject: null,
      snapshot: null,
    };
  }
  const read = readRawTranslationSnapshot(storage);
  if (!read.ok) {
    return {
      classification: "fatal",
      raw: null,
      overrides: {},
      rejectedRaw: null,
      diagnostics: [{ code: "storage_read_failed", message: read.failure.message }],
      ambiguousIdentities: [],
      sourceObject: null,
      snapshot: null,
    };
  }
  return inspectSnapshot(read.snapshot);
}

export function getStoredLanguageOverrides(
  storage: TranslationStorage | null = browserStorage(),
): LanguageOverrides {
  const inspection = inspectStoredLanguageOverrides(storage);
  return inspection.classification === "ambiguous" ||
    inspection.classification === "fatal" ||
    inspection.classification === "transaction_recovery_required"
    ? {}
    : { ...inspection.overrides };
}

export function getOverridesForLanguage(
  languageCode: LanguageCode,
  storage: TranslationStorage | null = browserStorage(),
): Record<string, string> {
  const identity = normalizeLanguageIdentity(languageCode);
  if (!identity) return {};
  const inspection = inspectStoredLanguageOverrides(storage);
  if (inspection.classification === "ambiguous" || inspection.classification === "fatal" || inspection.classification === "transaction_recovery_required") {
    return {};
  }
  const matchingKeys = Object.keys(inspection.overrides).filter(
    (code) => normalizeLanguageIdentity(code) === identity,
  );
  return matchingKeys.length === 1 ? { ...inspection.overrides[matchingKeys[0]] } : {};
}

function unsafeInspection(inspection: LanguageOverridesInspection): boolean {
  return inspection.classification === "ambiguous" ||
    inspection.classification === "fatal" ||
    inspection.classification === "transaction_recovery_required" ||
    inspection.rejectedRaw !== null ||
    inspection.sourceObject === null ||
    inspection.snapshot === null;
}

function commitOverrides(
  storage: TranslationStorage,
  inspection: LanguageOverridesInspection,
  nextObject: Readonly<Record<string, unknown>>,
  transactionId: string,
): LanguageOverrideMutationResult {
  if (!inspection.snapshot) return { ok: false, status: "storage_failure", error: "Language-override storage could not be read." };
  const raw = Object.keys(nextObject).length === 0 ? null : JSON.stringify(nextObject);
  const plan = createTranslationTransactionPlan(inspection.snapshot, transactionId, {
    [languageOverridesStorageKey]: raw,
  });
  if (!plan.ok) return { ok: false, status: "storage_failure", error: `Override transaction plan failed: ${plan.code}.` };
  const committed = commitTranslationTransaction(storage, plan.plan);
  if (committed.ok) return { ok: true, status: "committed" };
  if (committed.status === "stale_snapshot") {
    return { ok: false, status: "stale_snapshot", error: "Language overrides changed before the operation could be committed." };
  }
  const recoveryRequired = committed.status === "transaction_recovery_required";
  return {
    ok: false,
    status: recoveryRequired ? "transaction_recovery_required" : "storage_failure",
    error: recoveryRequired ? "Language-override storage requires explicit transaction recovery." : "Language-override storage is unavailable.",
    recoveryRequired,
  };
}

function mutateLanguageOverrides(
  languageCode: LanguageCode,
  key: string | null,
  value: string | null,
  storage: TranslationStorage | null,
): LanguageOverrideMutationResult {
  if (!storage) return { ok: false, status: "storage_unavailable", error: "Language overrides require browser storage." };
  const identity = normalizeLanguageIdentity(languageCode);
  if (!identity || (key !== null && key.length === 0)) {
    return { ok: false, status: "invalid_input", error: "Language code or Translation key is invalid." };
  }
  const inspection = inspectStoredLanguageOverrides(storage);
  if (unsafeInspection(inspection)) {
    return {
      ok: false,
      status: inspection.classification === "transaction_recovery_required" ? "transaction_recovery_required" : "unsafe_stored_state",
      error: "Existing language-override storage must be resolved before it can be changed.",
      recoveryRequired: inspection.classification === "transaction_recovery_required",
    };
  }
  const source = { ...(inspection.sourceObject ?? {}) };
  const rawLanguageCode = Object.keys(source).find((code) => normalizeLanguageIdentity(code) === identity) ?? identity;
  if (key === null && value === null && identity !== "en" && !isCustomLanguageCode(identity, storage)) {
    return { ok: true, status: "unchanged" };
  }
  const existing = source[rawLanguageCode];
  const languageValues = existing && typeof existing === "object" && !Array.isArray(existing)
    ? { ...(existing as Record<string, unknown>) }
    : {};
  if (key === null) {
    delete source[rawLanguageCode];
  } else if (value === null || value === "") {
    delete languageValues[key];
    if (Object.keys(languageValues).length === 0) delete source[rawLanguageCode];
    else source[rawLanguageCode] = languageValues;
  } else {
    languageValues[key] = value;
    source[rawLanguageCode] = languageValues;
  }
  const nextRaw = Object.keys(source).length === 0 ? null : JSON.stringify(source);
  if (nextRaw === inspection.raw) return { ok: true, status: "unchanged" };
  const action = key === null ? "reset-all" : value === null || value === "" ? "reset" : "set";
  return commitOverrides(storage, inspection, source, `language-override:${action}:${identity}${key === null ? "" : `:${key}`}`);
}

export function setOverrideForLanguage(
  languageCode: LanguageCode,
  key: string,
  value: string,
  storage: TranslationStorage | null = browserStorage(),
): LanguageOverrideMutationResult {
  return mutateLanguageOverrides(languageCode, key, value, storage);
}

export function resetOverrideForLanguage(
  languageCode: LanguageCode,
  key: string,
  storage: TranslationStorage | null = browserStorage(),
): LanguageOverrideMutationResult {
  return mutateLanguageOverrides(languageCode, key, null, storage);
}

export function resetAllOverridesForLanguage(
  languageCode: LanguageCode,
  storage: TranslationStorage | null = browserStorage(),
): LanguageOverrideMutationResult {
  return mutateLanguageOverrides(languageCode, null, null, storage);
}
