import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export { isTauriRuntimeAvailable as isPathStatusRuntimeAvailable };

export type PathStatusKind =
  | "notSet"
  | "exists"
  | "missing"
  | "inaccessible"
  | "unknown";

export type PathKind = "file" | "folder" | "unknown";

export type PathStatusResult = {
  path: string;
  status: PathStatusKind;
  kind: PathKind;
  message: string;
};

export async function checkPathStatus(path: string): Promise<PathStatusResult> {
  const trimmedPath = path.trim();

  if (!trimmedPath) {
    return {
      path: "",
      status: "notSet",
      kind: "unknown",
      message: "Path is not set",
    };
  }

  if (!isTauriRuntimeAvailable()) {
    return {
      path: trimmedPath,
      status: "unknown",
      kind: "unknown",
      message: "Available in desktop runtime",
    };
  }

  try {
    return await invokeTauriCommand<PathStatusResult>("path_status_check", {
      path: trimmedPath,
    });
  } catch {
    return {
      path: trimmedPath,
      status: "unknown",
      kind: "unknown",
      message: "Path status could not be checked",
    };
  }
}
