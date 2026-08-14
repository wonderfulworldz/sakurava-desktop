import { invokeTauriCommand } from "./tauriClient";

export async function synchronizeAutomaticMiniImagesPolicy(enabled: boolean) {
  await invokeTauriCommand("managed_media_automatic_actions_sync", { enabled });
}
