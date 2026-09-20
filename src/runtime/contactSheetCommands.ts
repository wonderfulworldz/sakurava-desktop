import { invokeTauriCommand } from "./tauriClient";

export type ContactSheetFormat = "jpeg" | "png";
export type ContactSheetTheme = "light" | "dark";

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
  rows: number;
  columns: number;
  width: number;
  quality: number;
  timestamp: boolean;
  header: boolean;
  subtitles: boolean;
  subtitleId: number | null;
  subtitlePath: string | null;
  theme: ContactSheetTheme;
  format: ContactSheetFormat;
}) {
  return invokeTauriCommand<ContactSheetGenerationResult>(
    "video_contact_sheet_generate",
    { input },
  );
}

export function getContactSheetProgress() {
  return invokeTauriCommand<{ completed: number; total: number }>("video_contact_sheet_progress");
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
