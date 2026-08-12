import { invokeTauriCommand } from "./tauriClient";

export type ManagedMediaProgressStatus = {
  ready: number;
  total: number;
  processing: boolean;
};

export async function getManagedMediaProgressStatus(): Promise<ManagedMediaProgressStatus> {
  const status = await invokeTauriCommand<ManagedMediaProgressStatus>(
    "managed_media_progress_get",
  );
  if (
    !Number.isSafeInteger(status.ready) ||
    !Number.isSafeInteger(status.total) ||
    status.ready < 0 ||
    status.total < 0 ||
    status.ready > status.total ||
    typeof status.processing !== "boolean"
  ) {
    throw new Error("Managed media progress status is invalid.");
  }
  return status;
}
