import { invokeTauriCommand } from "./tauriClient";

export type ManagedMediaRegenerationResult = {
  queuedCount: number;
  alreadyActiveCount: number;
};

export async function regenerateMissingOrOutdatedManagedMedia(): Promise<ManagedMediaRegenerationResult> {
  const result = await invokeTauriCommand<ManagedMediaRegenerationResult>(
    "managed_media_regenerate_missing_or_outdated",
  );
  if (
    !Number.isSafeInteger(result.queuedCount) ||
    !Number.isSafeInteger(result.alreadyActiveCount) ||
    result.queuedCount < 0 ||
    result.alreadyActiveCount < 0
  ) {
    throw new Error("Managed media regeneration result is invalid.");
  }
  return result;
}
