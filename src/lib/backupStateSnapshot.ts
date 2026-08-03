import {
  appearanceAccentStorageKey,
  appearanceDensityStorageKey,
  appearanceThemeStorageKey,
  appearanceUiScaleStorageKey,
  normalizeAppearanceAccent,
  normalizeCustomAccentColor,
} from "./appearanceTheme";
import { BACKUP_RECOVERY_STORAGE_KEY } from "./automaticBackup";
import { CATALOG_PREFERENCES_STORAGE_KEY } from "./catalogPreferences";
import { CATALOG_PAGE_SIZE_OPTIONS } from "./catalogPagination";
import { inspectStoredCustomLanguages } from "./customLanguages";
import {
  inspectRawTranslationSnapshot,
  readRawTranslationSnapshot,
  translationStorageKeys,
  type TranslationStorage,
} from "./translationStorage";
import { MEDIA_ASSET_ROOTS_STORAGE_KEY } from "../runtime/mediaAssetScope";
import {
  PROTECTED_STATE_SNAPSHOT_FORMAT,
  PROTECTED_STATE_SNAPSHOT_VERSION,
  type FeatureStateSnapshot,
  type OwnedStorageSnapshot,
  type PreparedProtectedStateImport,
  type ProtectedStateApplyReceipt,
  type ProtectedStateSnapshotV1,
  type RawOwnedStorageValue,
} from "../shared/backupStateSnapshot";

export const PROTECTED_STATE_ENTRY_PATH =
  "state/protected-state.v1.json" as const;

const appearanceKeys = Object.freeze([
  appearanceThemeStorageKey,
  appearanceAccentStorageKey,
  appearanceDensityStorageKey,
  appearanceUiScaleStorageKey,
] as const);
const automaticBackupKeys = Object.freeze([BACKUP_RECOVERY_STORAGE_KEY] as const);
const catalogPreferenceKeys = Object.freeze([
  CATALOG_PREFERENCES_STORAGE_KEY,
] as const);
const mediaAssetScopeKeys = Object.freeze([
  MEDIA_ASSET_ROOTS_STORAGE_KEY,
] as const);
const translationKeys = Object.freeze([
  translationStorageKeys.selectedLanguage,
  translationStorageKeys.customLanguages,
  translationStorageKeys.languageOverrides,
  translationStorageKeys.transactionJournal,
] as const);

export type BackupStateReadStorage = Pick<TranslationStorage, "getItem">;
export type BackupStateWriteStorage = Pick<
  TranslationStorage,
  "getItem" | "setItem" | "removeItem"
>;

export type ProtectedStateExportOptions = {
  readonly paginationStorageKeys?: readonly string[];
  readonly featureState?: Readonly<Record<string, boolean>>;
};

export type ProtectedStateAdapterResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string; readonly message: string };

function fail<T>(code: string, message: string): ProtectedStateAdapterResult<T> {
  return { ok: false, code, message };
}

function rawValue(storage: BackupStateReadStorage, key: string): RawOwnedStorageValue {
  const raw = storage.getItem(key);
  return { present: raw !== null, raw };
}

function ownedSnapshot(
  storage: BackupStateReadStorage,
  keys: readonly string[],
): OwnedStorageSnapshot {
  return {
    version: 1,
    values: Object.fromEntries(keys.map((key) => [key, rawValue(storage, key)])),
  };
}

function featureSnapshot(
  values: Readonly<Record<string, boolean>> = {},
): FeatureStateSnapshot {
  return { version: 1, values: { ...values } };
}

function parseJson(raw: string, key: string): ProtectedStateAdapterResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return fail("malformed_json", `${key} must contain valid JSON.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateAppearance(snapshot: OwnedStorageSnapshot) {
  const values = snapshot.values;
  const theme = values[appearanceThemeStorageKey]?.raw;
  if (theme !== null && theme !== "light" && theme !== "dark" && theme !== "system") {
    return fail("invalid_appearance", "Appearance theme is invalid.");
  }
  const density = values[appearanceDensityStorageKey]?.raw;
  if (density !== null && density !== "comfortable" && density !== "compact") {
    return fail("invalid_appearance", "Appearance density is invalid.");
  }
  const scale = values[appearanceUiScaleStorageKey]?.raw;
  if (scale !== null && scale !== "90" && scale !== "100" && scale !== "110") {
    return fail("invalid_appearance", "Appearance scale is invalid.");
  }
  const accentRaw = values[appearanceAccentStorageKey]?.raw;
  if (accentRaw !== null) {
    const parsed = parseJson(accentRaw, appearanceAccentStorageKey);
    if (!parsed.ok || !isRecord(parsed.value) || typeof parsed.value.type !== "string") {
      return fail("invalid_appearance", "Appearance accent is invalid.");
    }
    if (
      parsed.value.type !== "sakura" &&
      parsed.value.type !== "blue" &&
      parsed.value.type !== "purple" &&
      !(
        parsed.value.type === "custom" &&
        typeof parsed.value.color === "string" &&
        normalizeCustomAccentColor(parsed.value.color) !== null
      )
    ) {
      return fail("invalid_appearance", "Appearance accent is invalid.");
    }
    normalizeAppearanceAccent(parsed.value);
  }
  return { ok: true as const };
}

function validateAutomaticBackup(snapshot: OwnedStorageSnapshot) {
  const raw = snapshot.values[BACKUP_RECOVERY_STORAGE_KEY]?.raw;
  if (raw === null) return { ok: true as const };
  const parsed = parseJson(raw, BACKUP_RECOVERY_STORAGE_KEY);
  if (!parsed.ok || !isRecord(parsed.value) || parsed.value.version !== 1) {
    return fail("invalid_automatic_backup", "Automatic Backup state is invalid.");
  }
  const automatic = parsed.value.automaticBackup;
  if (!isRecord(automatic) || typeof automatic.enabled !== "boolean") {
    return fail("invalid_automatic_backup", "Automatic Backup state is invalid.");
  }
  if (
    automatic.frequency !== "daily" &&
    automatic.frequency !== "weekly" &&
    automatic.frequency !== "monthly"
  ) {
    return fail("invalid_automatic_backup", "Automatic Backup frequency is invalid.");
  }
  for (const key of [
    "lastSuccessfulAutomaticBackupAt",
    "lastAutomaticBackupPackageName",
  ]) {
    if (automatic[key] !== null && typeof automatic[key] !== "string") {
      return fail("invalid_automatic_backup", "Automatic Backup history is invalid.");
    }
  }
  return { ok: true as const };
}

function validateCatalogPreferences(snapshot: OwnedStorageSnapshot) {
  const raw = snapshot.values[CATALOG_PREFERENCES_STORAGE_KEY]?.raw;
  if (raw === null) return { ok: true as const };
  const parsed = parseJson(raw, CATALOG_PREFERENCES_STORAGE_KEY);
  if (!parsed.ok || !isRecord(parsed.value) || parsed.value.version !== 1) {
    return fail("invalid_catalog_preferences", "Catalog preferences are invalid.");
  }
  if (!isRecord(parsed.value.toggles) || !isRecord(parsed.value.pages)) {
    return fail("invalid_catalog_preferences", "Catalog preferences are invalid.");
  }
  for (const key of ["rememberView", "rememberSort", "rememberFilters"]) {
    if (typeof parsed.value.toggles[key] !== "boolean") {
      return fail("invalid_catalog_preferences", "Catalog preference toggles are invalid.");
    }
  }
  return { ok: true as const };
}

function validatePagination(snapshot: OwnedStorageSnapshot) {
  for (const [key, value] of Object.entries(snapshot.values)) {
    if (
      !/^sakurava\.catalog\.(videos|images|performers|categories|categoryManagement|glossary)\.pageSize\.v1$/.test(
        key,
      )
    ) {
      return fail("invalid_pagination_key", `Pagination key ${key} is not stable.`);
    }
    if (value.raw !== null && !CATALOG_PAGE_SIZE_OPTIONS.includes(value.raw as never)) {
      return fail("invalid_pagination", `Pagination value for ${key} is invalid.`);
    }
  }
  return { ok: true as const };
}

function validateMediaAssetScope(snapshot: OwnedStorageSnapshot) {
  const raw = snapshot.values[MEDIA_ASSET_ROOTS_STORAGE_KEY]?.raw;
  if (raw === null) return { ok: true as const };
  const parsed = parseJson(raw, MEDIA_ASSET_ROOTS_STORAGE_KEY);
  if (!parsed.ok || !Array.isArray(parsed.value) || !parsed.value.every((item) => typeof item === "string")) {
    return fail("invalid_media_asset_scope", "Media asset-scope state is invalid.");
  }
  return { ok: true as const };
}

function storageFromSnapshot(snapshot: OwnedStorageSnapshot): TranslationStorage {
  const state = new Map(
    Object.entries(snapshot.values).map(([key, value]) => [key, value.raw]),
  );
  return {
    getItem: (key) => state.get(key) ?? null,
    setItem: () => {
      throw new Error("Snapshot validation storage is read-only.");
    },
    removeItem: () => {
      throw new Error("Snapshot validation storage is read-only.");
    },
  };
}

function validateTranslation(snapshot: OwnedStorageSnapshot) {
  const storage = storageFromSnapshot(snapshot);
  const read = readRawTranslationSnapshot(storage);
  if (!read.ok) return fail("invalid_translation", read.failure.message);
  const inspection = inspectRawTranslationSnapshot(read.snapshot);
  if (inspection.classification !== "clean") {
    return fail("invalid_translation", `Translation state is ${inspection.classification}.`);
  }
  const languages = inspectStoredCustomLanguages(storage);
  if (languages.classification !== "clean") {
    return fail("invalid_translation", `Custom-language state is ${languages.classification}.`);
  }
  return { ok: true as const };
}

function validateRawValue(value: unknown): value is RawOwnedStorageValue {
  return (
    isRecord(value) &&
    typeof value.present === "boolean" &&
    (value.raw === null || typeof value.raw === "string") &&
    value.present === (value.raw !== null) &&
    Object.keys(value).every((key) => key === "present" || key === "raw")
  );
}

function validateOwnedSnapshot(value: unknown): value is OwnedStorageSnapshot {
  return (
    isRecord(value) &&
    value.version === 1 &&
    isRecord(value.values) &&
    Object.values(value.values).every(validateRawValue) &&
    Object.keys(value).every((key) => key === "version" || key === "values")
  );
}

function hasExactKeys(snapshot: OwnedStorageSnapshot, expected: readonly string[]) {
  const actual = Object.keys(snapshot.values).sort();
  const allowed = [...expected].sort();
  return actual.length === allowed.length && actual.every((key, index) => key === allowed[index]);
}

function validateFeatureSnapshot(value: unknown): value is FeatureStateSnapshot {
  return (
    isRecord(value) &&
    value.version === 1 &&
    isRecord(value.values) &&
    Object.entries(value.values).every(
      ([key, enabled]) => /^[A-Za-z][A-Za-z0-9._-]*$/.test(key) && typeof enabled === "boolean",
    ) &&
    Object.keys(value).every((key) => key === "version" || key === "values")
  );
}

export function validateProtectedStateSnapshot(
  value: unknown,
): ProtectedStateAdapterResult<ProtectedStateSnapshotV1> {
  if (!isRecord(value)) return fail("invalid_snapshot", "Protected state must be an object.");
  const exactKeys = [
    "format",
    "version",
    "appearance",
    "automaticBackup",
    "catalogPreferences",
    "catalogPagination",
    "mediaAssetScope",
    "featureState",
    "translation",
  ];
  if (
    value.format !== PROTECTED_STATE_SNAPSHOT_FORMAT ||
    value.version !== PROTECTED_STATE_SNAPSHOT_VERSION ||
    Object.keys(value).length !== exactKeys.length ||
    !exactKeys.every((key) => key in value) ||
    !validateOwnedSnapshot(value.appearance) ||
    !validateOwnedSnapshot(value.automaticBackup) ||
    !validateOwnedSnapshot(value.catalogPreferences) ||
    !validateOwnedSnapshot(value.catalogPagination) ||
    !validateOwnedSnapshot(value.mediaAssetScope) ||
    !validateFeatureSnapshot(value.featureState) ||
    !validateOwnedSnapshot(value.translation)
  ) {
    return fail("invalid_snapshot", "Protected state shape or version is unsupported.");
  }
  const snapshot = value as unknown as ProtectedStateSnapshotV1;
  if (
    !hasExactKeys(snapshot.appearance, appearanceKeys) ||
    !hasExactKeys(snapshot.automaticBackup, automaticBackupKeys) ||
    !hasExactKeys(snapshot.catalogPreferences, catalogPreferenceKeys) ||
    !hasExactKeys(snapshot.mediaAssetScope, mediaAssetScopeKeys) ||
    !hasExactKeys(snapshot.translation, translationKeys)
  ) {
    return fail("invalid_snapshot", "Protected state contains an unknown owner key.");
  }
  for (const validation of [
    validateAppearance(snapshot.appearance),
    validateAutomaticBackup(snapshot.automaticBackup),
    validateCatalogPreferences(snapshot.catalogPreferences),
    validatePagination(snapshot.catalogPagination),
    validateMediaAssetScope(snapshot.mediaAssetScope),
    validateTranslation(snapshot.translation),
  ]) {
    if (!validation.ok) return validation;
  }
  return { ok: true, value: snapshot };
}

export function exportProtectedStateSnapshot(
  storage: TranslationStorage,
  options: ProtectedStateExportOptions = {},
): ProtectedStateAdapterResult<ProtectedStateSnapshotV1> {
  let snapshot: ProtectedStateSnapshotV1;
  try {
    snapshot = {
      format: PROTECTED_STATE_SNAPSHOT_FORMAT,
      version: PROTECTED_STATE_SNAPSHOT_VERSION,
      appearance: ownedSnapshot(storage, appearanceKeys),
      automaticBackup: ownedSnapshot(storage, automaticBackupKeys),
      catalogPreferences: ownedSnapshot(storage, catalogPreferenceKeys),
      catalogPagination: ownedSnapshot(storage, options.paginationStorageKeys ?? []),
      mediaAssetScope: ownedSnapshot(storage, mediaAssetScopeKeys),
      featureState: featureSnapshot(options.featureState),
      translation: ownedSnapshot(storage, translationKeys),
    };
  } catch (error) {
    return fail(
      "storage_read_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
  return validateProtectedStateSnapshot(snapshot);
}

export function encodeProtectedStateSnapshot(
  snapshot: ProtectedStateSnapshotV1,
): ProtectedStateAdapterResult<string> {
  const validated = validateProtectedStateSnapshot(snapshot);
  return validated.ok
    ? { ok: true, value: JSON.stringify(validated.value) }
    : validated;
}

export function decodeProtectedStateSnapshot(
  serialized: string,
): ProtectedStateAdapterResult<ProtectedStateSnapshotV1> {
  const parsed = parseJson(serialized, PROTECTED_STATE_ENTRY_PATH);
  return parsed.ok ? validateProtectedStateSnapshot(parsed.value) : parsed;
}

export function prepareProtectedStateImport(
  snapshot: ProtectedStateSnapshotV1,
): ProtectedStateAdapterResult<PreparedProtectedStateImport> {
  const validated = validateProtectedStateSnapshot(snapshot);
  if (!validated.ok) return validated;
  const storageEntries = [
    validated.value.appearance,
    validated.value.automaticBackup,
    validated.value.catalogPreferences,
    validated.value.catalogPagination,
    validated.value.mediaAssetScope,
    validated.value.translation,
  ].flatMap((owner) =>
    Object.entries(owner.values).map(([key, value]) => ({
      key,
      value: value.raw,
    })),
  );
  return {
    ok: true,
    value: {
      version: 1,
      storageEntries,
      featureState: { ...validated.value.featureState.values },
    },
  };
}

export type ProtectedStateApplyOptions = {
  readonly expectedStateSha256: string;
  readonly applyFeatureState?: (
    values: Readonly<Record<string, boolean>>,
  ) => void;
};

export function applyPreparedProtectedStateImport(
  storage: BackupStateWriteStorage,
  prepared: PreparedProtectedStateImport,
  options: ProtectedStateApplyOptions,
): ProtectedStateAdapterResult<ProtectedStateApplyReceipt> {
  if (!/^[0-9a-f]{64}$/.test(options.expectedStateSha256)) {
    return fail("invalid_state_identity", "Protected-state identity is invalid.");
  }
  const featureEntries = Object.entries(prepared.featureState);
  if (featureEntries.length > 0 && !options.applyFeatureState) {
    return fail(
      "feature_state_owner_unavailable",
      "The protected feature-state owner is unavailable.",
    );
  }
  const previous = new Map<string, string | null>();
  try {
    for (const entry of prepared.storageEntries) {
      if (previous.has(entry.key)) {
        throw new Error(`Duplicate protected-state key: ${entry.key}`);
      }
      previous.set(entry.key, storage.getItem(entry.key));
    }
    for (const entry of prepared.storageEntries) {
      if (entry.value === null) storage.removeItem(entry.key);
      else storage.setItem(entry.key, entry.value);
    }
    options.applyFeatureState?.(prepared.featureState);
    for (const entry of prepared.storageEntries) {
      if (storage.getItem(entry.key) !== entry.value) {
        throw new Error(`Protected-state verification failed for ${entry.key}.`);
      }
    }
  } catch (error) {
    try {
      for (const [key, value] of previous) {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      }
    } catch {
      return fail(
        "state_apply_and_rollback_failed",
        "Protected state could not be applied or rolled back.",
      );
    }
    return fail(
      "state_apply_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
  return {
    ok: true,
    value: {
      version: 1,
      expectedStateSha256: options.expectedStateSha256,
      appliedStorageEntryCount: prepared.storageEntries.length,
      appliedFeatureStateCount: featureEntries.length,
    },
  };
}

export function applyProtectedStateSnapshot(
  storage: BackupStateWriteStorage,
  serialized: string,
  options: ProtectedStateApplyOptions,
): ProtectedStateAdapterResult<ProtectedStateApplyReceipt> {
  const decoded = decodeProtectedStateSnapshot(serialized);
  if (!decoded.ok) return decoded;
  const prepared = prepareProtectedStateImport(decoded.value);
  return prepared.ok
    ? applyPreparedProtectedStateImport(storage, prepared.value, options)
    : prepared;
}
