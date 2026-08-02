export const PROTECTED_STATE_SNAPSHOT_FORMAT =
  "sakurava-protected-state" as const;
export const PROTECTED_STATE_SNAPSHOT_VERSION = 1 as const;

export type RawOwnedStorageValue = {
  readonly present: boolean;
  readonly raw: string | null;
};

export type OwnedStorageSnapshot = {
  readonly version: 1;
  readonly values: Readonly<Record<string, RawOwnedStorageValue>>;
};

export type FeatureStateSnapshot = {
  readonly version: 1;
  readonly values: Readonly<Record<string, boolean>>;
};

export type ProtectedStateSnapshotV1 = {
  readonly format: typeof PROTECTED_STATE_SNAPSHOT_FORMAT;
  readonly version: typeof PROTECTED_STATE_SNAPSHOT_VERSION;
  readonly appearance: OwnedStorageSnapshot;
  readonly automaticBackup: OwnedStorageSnapshot;
  readonly catalogPreferences: OwnedStorageSnapshot;
  readonly catalogPagination: OwnedStorageSnapshot;
  readonly mediaAssetScope: OwnedStorageSnapshot;
  readonly featureState: FeatureStateSnapshot;
  readonly translation: OwnedStorageSnapshot;
};

export type ProtectedStateEntry = {
  readonly key: string;
  readonly value: string | null;
};

export type PreparedProtectedStateImport = {
  readonly version: 1;
  readonly storageEntries: readonly ProtectedStateEntry[];
  readonly featureState: Readonly<Record<string, boolean>>;
};
