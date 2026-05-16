import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export { isTauriRuntimeAvailable as isMediaOpenRuntimeAvailable };

export type MediaOpenResult = {
  path: string;
  opened: boolean;
  message: string;
};

export async function openMediaPath(path: string): Promise<MediaOpenResult> {
  const trimmedPath = path.trim();

  if (!trimmedPath) {
    return {
      path: "",
      opened: false,
      message: "Media path is required",
    };
  }

  if (!isTauriRuntimeAvailable()) {
    return {
      path: trimmedPath,
      opened: false,
      message: "Available in desktop runtime",
    };
  }

  try {
    return await invokeTauriCommand<MediaOpenResult>("open_media_path", {
      path: trimmedPath,
    });
  } catch {
    return {
      path: trimmedPath,
      opened: false,
      message: "Media file could not be opened",
    };
  }
}
