import { invokeTauriCommand } from "./tauriClient";

export type ContactSheetGrid = 3 | 4 | 5;
export type ContactSheetFormat = "jpeg" | "png";

export type ContactSheetGenerationResult = {
  requestId: string;
  previewPath: string;
  format: ContactSheetFormat;
  width: number;
  height: number;
  frameCount: number;
  sampleSeconds: number[];
};

export function generateContactSheet(input: {
  sourceIdentity: string;
  grid: ContactSheetGrid;
  width: number;
  quality: number;
  timestamp: boolean;
  header: boolean;
  format: ContactSheetFormat;
}) {
  return invokeTauriCommand<ContactSheetGenerationResult>(
    "video_contact_sheet_generate",
    { input },
  );
}

export function saveContactSheet(previewPath: string, destinationPath: string) {
  return invokeTauriCommand<{ destinationPath: string; bytesWritten: number; success: boolean }>(
    "video_contact_sheet_save",
    { previewPath, destinationPath },
  );
}

export function cancelContactSheet(requestId: string | null) {
  return invokeTauriCommand<{ cancelled: boolean }>("video_contact_sheet_cancel", {
    requestId,
  });
}

export function cleanupContactSheet(previewPath: string | null) {
  return invokeTauriCommand<{ cleaned: boolean }>("video_contact_sheet_cleanup", {
    previewPath,
  });
}
