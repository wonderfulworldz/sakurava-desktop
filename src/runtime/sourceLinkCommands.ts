import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export type SourceLinkOpenResult = {
  url: string;
  opened: boolean;
  message: string;
};

export function normalizeHttpSourceUrl(url: string): string | null {
  const trimmedUrl = url.trim();

  try {
    const parsed = new URL(trimmedUrl);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname
    ) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export async function openSourceLink(url: string): Promise<SourceLinkOpenResult> {
  const safeUrl = normalizeHttpSourceUrl(url);
  if (!safeUrl) {
    return {
      url: url.trim(),
      opened: false,
      message: "Source Link URL is invalid",
    };
  }

  if (!isTauriRuntimeAvailable()) {
    return {
      url: safeUrl,
      opened: false,
      message: "Available in desktop runtime",
    };
  }

  try {
    return await invokeTauriCommand<SourceLinkOpenResult>("open_source_link", {
      url: safeUrl,
    });
  } catch {
    return {
      url: safeUrl,
      opened: false,
      message: "Source Link could not be opened",
    };
  }
}
