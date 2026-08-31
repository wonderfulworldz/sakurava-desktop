import { invokeTauriCommand } from "./tauriClient";

export type GlobalOutputCategory =
  | "backupExport"
  | "export"
  | "videoScreenshot"
  | "contactSheet";

export type GlobalOutputPaths = {
  parentPath: string;
  childPaths: Record<GlobalOutputCategory, string>;
};

export type PreparedOutputDirectory = {
  category: GlobalOutputCategory;
  directoryPath: string;
};

export function validateGlobalOutputParent(parentPath: string) {
  return invokeTauriCommand<GlobalOutputPaths>("global_output_validate_parent", {
    parentPath,
  });
}

export function prepareGlobalOutputDirectory(
  parentPath: string,
  category: GlobalOutputCategory,
) {
  return invokeTauriCommand<PreparedOutputDirectory>(
    "global_output_prepare_category",
    { parentPath, category },
  );
}

export function globalOutputDefaultFilePath(
  parentPath: string,
  category: GlobalOutputCategory,
  fileName: string,
) {
  return invokeTauriCommand<string>("global_output_default_file_path", {
    parentPath,
    category,
    fileName,
  });
}

export function revealGlobalOutputFile(filePath: string) {
  return invokeTauriCommand<{ filePath: string; folderPath: string; opened: boolean }>(
    "global_output_reveal_file",
    { filePath },
  );
}
