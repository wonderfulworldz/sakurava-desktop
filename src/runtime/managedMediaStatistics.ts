import { invokeTauriCommand } from "./tauriClient";

export type ManagedMediaStatistics = {
  readyCount: number;
  sourceCount: number;
  pendingCount: number;
  publishedStorageBytes: number;
};

export async function getManagedMediaStatistics(): Promise<ManagedMediaStatistics> {
  const statistics = await invokeTauriCommand<ManagedMediaStatistics>(
    "managed_media_statistics_get",
  );
  if (
    !Number.isSafeInteger(statistics.readyCount) ||
    !Number.isSafeInteger(statistics.sourceCount) ||
    !Number.isSafeInteger(statistics.pendingCount) ||
    !Number.isSafeInteger(statistics.publishedStorageBytes) ||
    statistics.readyCount < 0 ||
    statistics.sourceCount < 0 ||
    statistics.pendingCount < 0 ||
    statistics.publishedStorageBytes < 0 ||
    statistics.readyCount > statistics.sourceCount ||
    statistics.pendingCount > statistics.sourceCount
  ) {
    throw new Error("Managed media statistics are invalid.");
  }
  return statistics;
}
