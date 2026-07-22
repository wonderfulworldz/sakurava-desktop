import {
  commitTranslationTransaction,
  createTranslationTransactionPlan,
  inspectRawTranslationSnapshot,
  readRawTranslationSnapshot,
  translationStorageKeys,
  type RawTranslationSnapshot,
  type TranslationStorage,
} from "./translationStorage";

export const customLanguagesStorageKey = translationStorageKeys.customLanguages;
export const maxCustomLanguages = 25;

export type CustomLanguageMeta = {
  code: string;
  label: string;
  baseLanguage: string;
};

export type CustomLanguageDiagnostic = {
  readonly code:
    | "invalid_top_level"
    | "invalid_entry"
    | "protected_identity"
    | "duplicate_identity"
    | "duplicate_label"
    | "storage_read_failed";
  readonly index?: number;
  readonly identity?: string;
  readonly message: string;
};

export type CustomLanguageInspection = {
  readonly classification:
    | "clean"
    | "recoverable"
    | "ambiguous"
    | "fatal"
    | "transaction_recovery_required";
  readonly raw: string | null;
  readonly languages: readonly CustomLanguageMeta[];
  readonly rejectedRaw: string | null;
  readonly diagnostics: readonly CustomLanguageDiagnostic[];
  readonly ambiguousIdentities: readonly string[];
  readonly sourceEntries: readonly unknown[] | null;
  readonly snapshot: RawTranslationSnapshot | null;
};

export type CustomLanguageMutationResult =
  | { readonly ok: true; readonly status: "committed" }
  | {
      readonly ok: false;
      readonly error: string;
      readonly status:
        | "storage_unavailable"
        | "invalid_metadata"
        | "protected_identity"
        | "duplicate_label"
        | "maximum_reached"
        | "not_found"
        | "unsafe_stored_state"
        | "stale_snapshot"
        | "storage_failure"
        | "transaction_recovery_required";
      readonly recoveryRequired?: boolean;
    };

function browserStorage(): TranslationStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

/**
 * Produces the sole runtime identity for a language code. Recognition is not
 * required: every non-empty custom code is permitted and remains otherwise
 * unchanged after trim, underscore-to-hyphen conversion, and lowercasing.
 */
export function normalizeLanguageIdentity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const identity = value.trim().replace(/_/g, "-").toLowerCase();
  return identity.length > 0 ? identity : null;
}

/**
 * Retains the current CSV-facing validation contract until the dedicated CSV
 * compatibility stage. Runtime identity comparisons use normalizeLanguageIdentity.
 */
export function normalizeCustomLanguageCode(value: unknown): string | null {
  const identity = normalizeLanguageIdentity(value);
  return identity && /^[a-z][a-z0-9-]{1,15}$/.test(identity) ? identity : null;
}

export function normalizeCustomLanguageLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ");
  return label.length >= 2 && label.length <= 60 ? label : null;
}

export function isProtectedLanguageCode(code: string): boolean {
  return normalizeLanguageIdentity(code) === "en";
}

function inspectSnapshot(snapshot: RawTranslationSnapshot): CustomLanguageInspection {
  const foundation = inspectRawTranslationSnapshot(snapshot);
  const raw = snapshot.state[customLanguagesStorageKey];
  if (foundation.classification === "transaction_recovery_required") {
    return {
      classification: "transaction_recovery_required",
      raw,
      languages: [],
      rejectedRaw: raw,
      diagnostics: [],
      ambiguousIdentities: [],
      sourceEntries: null,
      snapshot,
    };
  }

  const inspected = foundation.values[customLanguagesStorageKey];
  if (raw === null) {
    return {
      classification: foundation.classification,
      raw,
      languages: [],
      rejectedRaw: null,
      diagnostics: [],
      ambiguousIdentities: [],
      sourceEntries: [],
      snapshot,
    };
  }
  if (inspected.rejectedRaw !== undefined || !Array.isArray(inspected.parsed)) {
    return {
      classification: inspected.rejectedRaw !== undefined ? "recoverable" : "fatal",
      raw,
      languages: [],
      rejectedRaw: raw,
      diagnostics: inspected.rejectedRaw === undefined
        ? [{ code: "invalid_top_level", message: "Custom-language storage must be a JSON array." }]
        : [],
      ambiguousIdentities: [],
      sourceEntries: null,
      snapshot,
    };
  }

  const candidates: Array<{ meta: CustomLanguageMeta; identity: string }> = [];
  const diagnostics: CustomLanguageDiagnostic[] = [];
  const identityCounts = new Map<string, number>();
  const labelCounts = new Map<string, number>();
  inspected.parsed.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      diagnostics.push({ code: "invalid_entry", index, message: "Custom-language entry must be an object." });
      return;
    }
    const candidate = item as Partial<CustomLanguageMeta>;
    const identity = normalizeLanguageIdentity(candidate.code);
    const validLabel = normalizeCustomLanguageLabel(candidate.label);
    if (!identity || typeof candidate.code !== "string" || !validLabel || typeof candidate.label !== "string") {
      diagnostics.push({ code: "invalid_entry", index, message: "Custom-language code or label is invalid." });
      return;
    }
    if (isProtectedLanguageCode(identity)) {
      diagnostics.push({ code: "protected_identity", index, identity, message: "English cannot be stored as a custom language." });
      return;
    }
    identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
    const labelIdentity = validLabel.toLocaleLowerCase();
    labelCounts.set(labelIdentity, (labelCounts.get(labelIdentity) ?? 0) + 1);
    candidates.push({
      identity,
      meta: {
        code: candidate.code,
        label: candidate.label,
        baseLanguage: typeof candidate.baseLanguage === "string" ? candidate.baseLanguage : "en",
      },
    });
  });

  const ambiguousIdentities = [...identityCounts]
    .filter(([, count]) => count > 1)
    .map(([identity]) => identity);
  for (const identity of ambiguousIdentities) {
    diagnostics.push({ code: "duplicate_identity", identity, message: `Multiple custom-language records normalize to ${identity}.` });
  }
  const duplicateLabels = new Set([...labelCounts].filter(([, count]) => count > 1).map(([label]) => label));
  for (const label of duplicateLabels) {
    diagnostics.push({ code: "duplicate_label", message: `Multiple custom-language records use the label ${label}.` });
  }
  const languages = candidates
    .filter(({ identity, meta }) =>
      !ambiguousIdentities.includes(identity) &&
      !duplicateLabels.has(normalizeCustomLanguageLabel(meta.label)!.toLocaleLowerCase()),
    )
    .slice(0, maxCustomLanguages)
    .map(({ meta }) => meta);
  if (candidates.length > maxCustomLanguages) {
    diagnostics.push({ code: "invalid_entry", message: `More than ${maxCustomLanguages} custom languages are stored.` });
  }
  return {
    classification: ambiguousIdentities.length > 0 || foundation.classification === "ambiguous"
      ? "ambiguous"
      : diagnostics.length > 0 || foundation.classification === "recoverable"
        ? "recoverable"
        : foundation.classification,
    raw,
    languages,
    rejectedRaw: diagnostics.length > 0 ? raw : null,
    diagnostics,
    ambiguousIdentities,
    sourceEntries: inspected.parsed,
    snapshot,
  };
}

export function inspectStoredCustomLanguages(
  storage: TranslationStorage | null = browserStorage(),
): CustomLanguageInspection {
  if (!storage) {
    return {
      classification: "fatal",
      raw: null,
      languages: [],
      rejectedRaw: null,
      diagnostics: [{ code: "storage_read_failed", message: "Custom languages require browser storage." }],
      ambiguousIdentities: [],
      sourceEntries: null,
      snapshot: null,
    };
  }
  const read = readRawTranslationSnapshot(storage);
  if (!read.ok) {
    return {
      classification: "fatal",
      raw: null,
      languages: [],
      rejectedRaw: null,
      diagnostics: [{ code: "storage_read_failed", message: read.failure.message }],
      ambiguousIdentities: [],
      sourceEntries: null,
      snapshot: null,
    };
  }
  return inspectSnapshot(read.snapshot);
}

export function getStoredCustomLanguages(
  storage: TranslationStorage | null = browserStorage(),
): CustomLanguageMeta[] {
  const inspection = inspectStoredCustomLanguages(storage);
  return inspection.classification === "ambiguous" ||
    inspection.classification === "fatal" ||
    inspection.classification === "transaction_recovery_required"
    ? []
    : [...inspection.languages];
}

function unsafeInspection(inspection: CustomLanguageInspection): boolean {
  return inspection.classification === "ambiguous" ||
    inspection.classification === "fatal" ||
    inspection.classification === "transaction_recovery_required" ||
    inspection.rejectedRaw !== null ||
    inspection.sourceEntries === null ||
    inspection.snapshot === null;
}

function commitCustomLanguages(
  storage: TranslationStorage,
  inspection: CustomLanguageInspection,
  entries: readonly unknown[],
  transactionId: string,
): CustomLanguageMutationResult {
  if (!inspection.snapshot) {
    return { ok: false, status: "storage_failure", error: "Custom-language storage could not be read." };
  }
  const raw = entries.length === 0 ? null : JSON.stringify(entries);
  const plan = createTranslationTransactionPlan(inspection.snapshot, transactionId, {
    [customLanguagesStorageKey]: raw,
  });
  if (!plan.ok) {
    return { ok: false, status: "storage_failure", error: `Custom-language transaction plan failed: ${plan.code}.` };
  }
  const committed = commitTranslationTransaction(storage, plan.plan);
  if (committed.ok) return { ok: true, status: "committed" };
  if (committed.status === "stale_snapshot") {
    return { ok: false, status: "stale_snapshot", error: "Custom languages changed before the operation could be committed." };
  }
  const recoveryRequired = committed.status === "transaction_recovery_required";
  return {
    ok: false,
    status: recoveryRequired ? "transaction_recovery_required" : "storage_failure",
    error: recoveryRequired
      ? "Custom-language storage requires explicit transaction recovery."
      : "Custom-language storage is unavailable.",
    recoveryRequired,
  };
}

export function addCustomLanguage(
  meta: CustomLanguageMeta,
  storage: TranslationStorage | null = browserStorage(),
): CustomLanguageMutationResult {
  if (!storage) return { ok: false, status: "storage_unavailable", error: "Custom languages require browser storage." };
  const identity = normalizeLanguageIdentity(meta.code);
  const validLabel = normalizeCustomLanguageLabel(meta.label);
  if (!identity || !validLabel) {
    return { ok: false, status: "invalid_metadata", error: "Language code or name is invalid." };
  }
  if (isProtectedLanguageCode(identity)) {
    return { ok: false, status: "protected_identity", error: "English cannot be replaced." };
  }
  const inspection = inspectStoredCustomLanguages(storage);
  if (unsafeInspection(inspection)) {
    return {
      ok: false,
      status: inspection.classification === "transaction_recovery_required" ? "transaction_recovery_required" : "unsafe_stored_state",
      error: "Existing custom-language storage must be resolved before it can be changed.",
      recoveryRequired: inspection.classification === "transaction_recovery_required",
    };
  }
  const existingIndex = inspection.languages.findIndex(
    (language) => normalizeLanguageIdentity(language.code) === identity,
  );
  if (existingIndex < 0 && inspection.languages.length >= maxCustomLanguages) {
    return { ok: false, status: "maximum_reached", error: `Up to ${maxCustomLanguages} custom languages can be installed.` };
  }
  if (inspection.languages.some((language) =>
    normalizeLanguageIdentity(language.code) !== identity &&
    normalizeCustomLanguageLabel(language.label)?.toLocaleLowerCase() === validLabel.toLocaleLowerCase(),
  )) {
    return { ok: false, status: "duplicate_label", error: "A custom language with this name already exists." };
  }
  const entries = [...(inspection.sourceEntries ?? [])];
  if (existingIndex >= 0) {
    const originalIndex = entries.findIndex((entry) =>
      !!entry && typeof entry === "object" && !Array.isArray(entry) &&
      normalizeLanguageIdentity((entry as { code?: unknown }).code) === identity,
    );
    entries[originalIndex] = {
      ...(entries[originalIndex] as Record<string, unknown>),
      code: meta.code,
      label: meta.label,
      baseLanguage: "en",
    };
  } else {
    entries.push({ code: meta.code, label: meta.label, baseLanguage: "en" });
  }
  return commitCustomLanguages(storage, inspection, entries, `custom-language:add:${identity}`);
}

export function removeCustomLanguage(
  code: string,
  storage: TranslationStorage | null = browserStorage(),
): CustomLanguageMutationResult {
  if (!storage) return { ok: false, status: "storage_unavailable", error: "Custom languages require browser storage." };
  const identity = normalizeLanguageIdentity(code);
  if (!identity) return { ok: false, status: "invalid_metadata", error: "Language code is invalid." };
  if (isProtectedLanguageCode(identity)) {
    return { ok: false, status: "protected_identity", error: "English cannot be removed." };
  }
  const inspection = inspectStoredCustomLanguages(storage);
  if (unsafeInspection(inspection)) {
    return {
      ok: false,
      status: inspection.classification === "transaction_recovery_required" ? "transaction_recovery_required" : "unsafe_stored_state",
      error: "Existing custom-language storage must be resolved before it can be changed.",
      recoveryRequired: inspection.classification === "transaction_recovery_required",
    };
  }
  const entries = inspection.sourceEntries ?? [];
  const next = entries.filter((entry) =>
    !entry || typeof entry !== "object" || Array.isArray(entry) ||
    normalizeLanguageIdentity((entry as { code?: unknown }).code) !== identity,
  );
  if (next.length === entries.length) {
    return { ok: false, status: "not_found", error: "Custom language was not found." };
  }
  return commitCustomLanguages(storage, inspection, next, `custom-language:remove:${identity}`);
}

export function isCustomLanguageCode(
  code: string,
  storage: TranslationStorage | null = browserStorage(),
): boolean {
  const identity = normalizeLanguageIdentity(code);
  return identity !== null && getStoredCustomLanguages(storage).some(
    (language) => normalizeLanguageIdentity(language.code) === identity,
  );
}
