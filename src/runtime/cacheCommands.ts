import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export { isTauriRuntimeAvailable as isCacheRuntimeAvailable };

export type ClearCacheResult = {
  success: boolean;
  message: string;
  filesRemoved: number;
  bytesRemoved: number;
  clearedPaths: string[];
};

export function clearAppCache() {
  return invokeTauriCommand<ClearCacheResult>("clear_app_cache");
}
