import { selectDetailSaveAsDestination } from "./dialogCommands";
import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export type DetailFileActionResult = {
  sourcePath: string;
  destinationPath?: string;
  folderPath?: string;
  success: boolean;
  message: string;
};

export async function saveDetailSourceFileAs(
  sourcePath: string,
): Promise<DetailFileActionResult> {
  const trimmedPath = sourcePath.trim();

  if (!trimmedPath) {
    return {
      sourcePath: "",
      success: false,
      message: "No source file available",
    };
  }

  if (!isTauriRuntimeAvailable()) {
    return {
      sourcePath: trimmedPath,
      success: false,
      message: "Available in desktop runtime",
    };
  }

  const destinationPath = await selectDetailSaveAsDestination(trimmedPath);
  if (!destinationPath) {
    return {
      sourcePath: trimmedPath,
      success: false,
      message: "Save canceled",
    };
  }

  try {
    return await invokeTauriCommand<DetailFileActionResult>(
      "detail_source_file_copy_as",
      {
        sourcePath: trimmedPath,
        destinationPath,
      },
    );
  } catch {
    return {
      sourcePath: trimmedPath,
      destinationPath,
      success: false,
      message: "Source file could not be saved",
    };
  }
}

export async function openDetailSourceFolder(
  sourcePath: string,
): Promise<DetailFileActionResult> {
  const trimmedPath = sourcePath.trim();

  if (!trimmedPath) {
    return {
      sourcePath: "",
      success: false,
      message: "No source folder available",
    };
  }

  if (!isTauriRuntimeAvailable()) {
    return {
      sourcePath: trimmedPath,
      success: false,
      message: "Available in desktop runtime",
    };
  }

  try {
    return await invokeTauriCommand<DetailFileActionResult>(
      "detail_source_folder_reveal",
      { sourcePath: trimmedPath },
    );
  } catch {
    return {
      sourcePath: trimmedPath,
      success: false,
      message: "Source folder could not be opened",
    };
  }
}
