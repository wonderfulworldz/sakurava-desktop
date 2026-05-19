import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export type MediaMetadataProbeResult = {
  path: string;
  status: "notSet" | "exists" | "missing" | "inaccessible" | "unknown";
  kind: "file" | "folder" | "unknown";
  fileSizeBytes: number | null;
  fileType: string;
  durationMinutes?: number | null;
  width: number | null;
  height: number | null;
  resolution: string;
  message: string;
};

export async function probeMediaMetadata(path: string): Promise<MediaMetadataProbeResult> {
  const trimmedPath = path.trim();

  if (!trimmedPath) {
    return emptyProbe("Path is not set", "notSet");
  }

  if (!isTauriRuntimeAvailable()) {
    return {
      ...emptyProbe("Available in desktop runtime", "unknown"),
      path: trimmedPath,
    };
  }

  try {
    return await invokeTauriCommand<MediaMetadataProbeResult>("media_metadata_probe", {
      path: trimmedPath,
    });
  } catch {
    return {
      ...emptyProbe("Metadata could not be checked", "unknown"),
      path: trimmedPath,
    };
  }
}

function emptyProbe(
  message: string,
  status: MediaMetadataProbeResult["status"],
): MediaMetadataProbeResult {
  return {
    path: "",
    status,
    kind: "unknown",
    fileSizeBytes: null,
    fileType: "",
    durationMinutes: null,
    width: null,
    height: null,
    resolution: "",
    message,
  };
}
