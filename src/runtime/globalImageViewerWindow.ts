import { supportsMultipleWindows } from "@tauri-apps/api/app";
import { emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { GlobalImageViewerItem } from "../components/gallery/GlobalImageViewer";
import { isTauriRuntimeAvailable } from "./tauriClient";

export const GLOBAL_IMAGE_VIEWER_WINDOW_LABEL = "image-viewer";
const GLOBAL_IMAGE_VIEWER_MAIN_WINDOW_LABEL = "main";
export const GLOBAL_IMAGE_VIEWER_PAYLOAD_EVENT = "global-image-viewer:payload";
export const GLOBAL_IMAGE_VIEWER_PAYLOAD_ACK_EVENT =
  "global-image-viewer:payload-ack";
export const GLOBAL_IMAGE_VIEWER_PAYLOAD_REFRESH_EVENT =
  "global-image-viewer:payload-refresh";
export const GLOBAL_IMAGE_VIEWER_PAYLOAD_STORAGE_KEY =
  "sakurava.globalImageViewer.payload.v1";

export type GlobalImageViewerWindowPayload = {
  ariaLabel?: string;
  images: GlobalImageViewerItem[];
  initialIndex: number;
  openRequestId: string;
};

export type GlobalImageViewerWindowPayloadInput = Omit<
  GlobalImageViewerWindowPayload,
  "openRequestId"
> & {
  openRequestId?: string;
};

export type GlobalImageViewerWindowResult =
  | { mode: "window" }
  | { mode: "fallback"; reason: string };
type ViewerPayloadDeliveryAttempt =
  | { ok: true }
  | { ok: false; reason: string };

const VIEWER_WINDOW_CREATE_TIMEOUT_MS = 4000;
const VIEWER_PAYLOAD_ACK_TIMEOUT_MS = 150;

export async function openGlobalImageViewerWindow(
  payloadInput: GlobalImageViewerWindowPayloadInput,
): Promise<GlobalImageViewerWindowResult> {
  const payload = createGlobalImageViewerWindowPayload(payloadInput);
  const tauriRuntimeDetected = isTauriRuntimeAvailable();
  logViewerDiagnostic("runtime", {
    tauriRuntimeDetected,
    webviewWindowApiExists: typeof WebviewWindow === "function",
    getByLabelApiExists: typeof WebviewWindow.getByLabel === "function",
  });

  if (!tauriRuntimeDetected) {
    return viewerFallback("tauri-runtime-unavailable");
  }

  try {
    const multipleWindowsSupported = await supportsMultipleWindows();
    logViewerDiagnostic("supportsMultipleWindows", {
      multipleWindowsSupported,
    });

    if (!multipleWindowsSupported) {
      return viewerFallback("multiple-windows-unsupported");
    }

    storeViewerPayload(payload);
    logViewerDiagnostic("payloadStored", getPayloadDiagnostic(payload));

    const existingWindow = await WebviewWindow.getByLabel(
      GLOBAL_IMAGE_VIEWER_WINDOW_LABEL,
    );
    logViewerDiagnostic("existingWindowLookup", {
      foundExistingWindow: Boolean(existingWindow),
      label: GLOBAL_IMAGE_VIEWER_WINDOW_LABEL,
    });

    if (existingWindow) {
      try {
        await existingWindow.setFocus();
        logViewerDiagnostic("existingWindowFocus", { ok: true });
      } catch (error) {
        logViewerDiagnostic("existingWindowFocus", {
          ok: false,
          reason: `viewer-window-focus-failed: ${formatViewerError(error)}`,
        });
      }

      const deliveryResult = await deliverPayloadToExistingWindow(payload);
      logViewerDiagnostic("existingWindowPayloadDelivery", deliveryResult);

      if (!deliveryResult.ok) {
        logViewerDiagnostic("existingWindowPayloadDeliveryIgnored", {
          reason: deliveryResult.reason,
        });
      }

      return { mode: "window" };
    }

    const viewerWindowUrl = "/?sakuravaWindow=image-viewer";
    logViewerDiagnostic("createWindowCalled", {
      label: GLOBAL_IMAGE_VIEWER_WINDOW_LABEL,
      url: viewerWindowUrl,
    });

    const viewerWindow = new WebviewWindow(GLOBAL_IMAGE_VIEWER_WINDOW_LABEL, {
      center: true,
      decorations: true,
      focus: true,
      height: 820,
      minHeight: 560,
      minWidth: 760,
      resizable: true,
      title: "Sakurava Image Viewer",
      url: viewerWindowUrl,
      width: 1180,
    });

    return await new Promise<GlobalImageViewerWindowResult>((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        settle(viewerFallback("viewer-window-create-timeout"));
      }, VIEWER_WINDOW_CREATE_TIMEOUT_MS);

      function settle(result: GlobalImageViewerWindowResult) {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        resolve(result);
      }

      void viewerWindow.once("tauri://created", () => {
        void (async () => {
          logViewerDiagnostic("createWindowResult", { ok: true });

          try {
            await viewerWindow.setFocus();
            logViewerDiagnostic("createdWindowFocus", { ok: true });
          } catch (error) {
            logViewerDiagnostic("createdWindowFocus", {
              ok: false,
              reason: `viewer-window-focus-failed: ${formatViewerError(error)}`,
            });
          }

          const deliveryResult = await deliverPayloadToCreatedWindow(payload);
          logViewerDiagnostic("createdWindowPayloadDelivery", deliveryResult);

          if (!deliveryResult.ok) {
            logViewerDiagnostic("createdWindowPayloadDeliveryIgnored", {
              reason: deliveryResult.reason,
            });
          }

          settle({ mode: "window" });
        })();
      });

      void viewerWindow.once<string>("tauri://error", (event) => {
        const reason = `viewer-window-create-failed: ${formatViewerError(
          event.payload,
        )}`;
        logViewerDiagnostic("createWindowResult", {
          ok: false,
          reason,
        });
        settle(viewerFallback(reason));
      });
    });
  } catch (error) {
    return viewerFallback(`viewer-window-open-failed: ${formatViewerError(error)}`);
  }
}

export function createGlobalImageViewerWindowPayload(
  payload: GlobalImageViewerWindowPayloadInput,
): GlobalImageViewerWindowPayload {
  return {
    ...payload,
    openRequestId: payload.openRequestId ?? createOpenRequestId(),
  };
}

export type GlobalImageViewerPayloadAck = {
  openRequestId: string;
};

export type GlobalImageViewerPayloadRefreshRequest = {
  openRequestId: string;
};

function createOpenRequestId() {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `image-open-${Date.now().toString(36)}-${randomPart}`;
}

async function emitViewerPayload(payload: GlobalImageViewerWindowPayload) {
  logViewerDiagnostic("viewer-payload-send", getPayloadDiagnostic(payload));
  await emitTo(
    { kind: "WebviewWindow", label: GLOBAL_IMAGE_VIEWER_WINDOW_LABEL },
    GLOBAL_IMAGE_VIEWER_PAYLOAD_EVENT,
    payload,
  );
}

async function emitViewerPayloadRefreshRequest(openRequestId: string) {
  logViewerDiagnostic("viewer-payload-refresh", { openRequestId });
  await emitTo(
    { kind: "WebviewWindow", label: GLOBAL_IMAGE_VIEWER_WINDOW_LABEL },
    GLOBAL_IMAGE_VIEWER_PAYLOAD_REFRESH_EVENT,
    { openRequestId } satisfies GlobalImageViewerPayloadRefreshRequest,
  );
}

export async function emitViewerPayloadAck(openRequestId: string) {
  logViewerDiagnostic("viewer-payload-ack", { openRequestId });
  await emitTo(
    { kind: "WebviewWindow", label: GLOBAL_IMAGE_VIEWER_MAIN_WINDOW_LABEL },
    GLOBAL_IMAGE_VIEWER_PAYLOAD_ACK_EVENT,
    { openRequestId } satisfies GlobalImageViewerPayloadAck,
  );
}

async function deliverPayloadToExistingWindow(
  payload: GlobalImageViewerWindowPayload,
) {
  const directDelivery = await sendWithAck(payload, () =>
    tryEmitViewerPayload(payload),
  );

  if (directDelivery.ok) {
    return directDelivery;
  }

  logViewerDiagnostic("viewer-payload-ack-timeout", {
    openRequestId: payload.openRequestId,
    phase: "direct",
    reason: directDelivery.reason,
  });

  storeViewerPayload(payload);
  const refreshDelivery = await sendWithAck(payload, () =>
    tryEmitViewerPayloadRefreshRequest(payload.openRequestId),
  );

  if (!refreshDelivery.ok) {
    logViewerDiagnostic("viewer-payload-ack-timeout", {
      openRequestId: payload.openRequestId,
      phase: "refresh",
      reason: refreshDelivery.reason,
    });
  }

  return refreshDelivery;
}

async function deliverPayloadToCreatedWindow(
  payload: GlobalImageViewerWindowPayload,
) {
  const directDelivery = await sendWithAck(payload, () =>
    tryEmitViewerPayload(payload),
  );

  if (directDelivery.ok) {
    return directDelivery;
  }

  logViewerDiagnostic("viewer-payload-ack-timeout", {
    openRequestId: payload.openRequestId,
    phase: "created-direct",
    reason: directDelivery.reason,
  });

  const refreshDelivery = await sendWithAck(payload, () =>
    tryEmitViewerPayloadRefreshRequest(payload.openRequestId),
  );

  if (!refreshDelivery.ok) {
    logViewerDiagnostic("viewer-payload-ack-timeout", {
      openRequestId: payload.openRequestId,
      phase: "created-refresh",
      reason: refreshDelivery.reason,
    });
  }

  return refreshDelivery;
}

async function sendWithAck(
  payload: GlobalImageViewerWindowPayload,
  send: () => Promise<ViewerPayloadDeliveryAttempt>,
) {
  const ackWaiter = await createPayloadAckWaiter(payload.openRequestId);
  const sendResult = await send();

  if (!sendResult.ok) {
    ackWaiter.cancel();
    return sendResult;
  }

  return ackWaiter.wait();
}

async function createPayloadAckWaiter(openRequestId: string) {
  let settled = false;
  let unlisten: (() => void) | undefined;
  let timeoutId: ReturnType<typeof window.setTimeout> | undefined;
  let resolveWait:
    | ((result: { ok: true } | { ok: false; reason: string }) => void)
    | undefined;

  const waitPromise = new Promise<
    { ok: true } | { ok: false; reason: string }
  >((resolve) => {
    resolveWait = resolve;
  });

  function settle(result: { ok: true } | { ok: false; reason: string }) {
    if (settled) {
      return;
    }

    settled = true;
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    unlisten?.();
    resolveWait?.(result);
  }

  unlisten = await listen<GlobalImageViewerPayloadAck>(
    GLOBAL_IMAGE_VIEWER_PAYLOAD_ACK_EVENT,
    (event) => {
      if (event.payload.openRequestId !== openRequestId) {
        return;
      }

      logViewerDiagnostic("viewer-payload-ack", { openRequestId });
      settle({ ok: true });
    },
  );

  timeoutId = window.setTimeout(() => {
    settle({
      ok: false,
      reason: "viewer-payload-ack-timeout",
    });
  }, VIEWER_PAYLOAD_ACK_TIMEOUT_MS);

  return {
    cancel: () =>
      settle({
        ok: false,
        reason: "viewer-payload-send-cancelled",
      }),
    wait: () => waitPromise,
  };
}

async function tryEmitViewerPayload(payload: GlobalImageViewerWindowPayload) {
  try {
    await emitViewerPayload(payload);
    return { ok: true } as const;
  } catch (error) {
    return {
      ok: false,
      reason: `viewer-window-payload-emit-failed: ${formatViewerError(error)}`,
    } as const;
  }
}

async function tryEmitViewerPayloadRefreshRequest(openRequestId: string) {
  try {
    await emitViewerPayloadRefreshRequest(openRequestId);
    return { ok: true } as const;
  } catch (error) {
    return {
      ok: false,
      reason: `viewer-window-payload-refresh-emit-failed: ${formatViewerError(
        error,
      )}`,
    } as const;
  }
}

export function readStoredViewerPayload() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawPayload = window.localStorage.getItem(
      GLOBAL_IMAGE_VIEWER_PAYLOAD_STORAGE_KEY,
    );

    if (!rawPayload) {
      return null;
    }

    return createGlobalImageViewerWindowPayload(
      JSON.parse(rawPayload) as GlobalImageViewerWindowPayloadInput,
    );
  } catch {
    return null;
  }
}

function storeViewerPayload(payload: GlobalImageViewerWindowPayload) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      GLOBAL_IMAGE_VIEWER_PAYLOAD_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // The emitted event still covers the normal desktop path.
  }
}

function viewerFallback(reason: string): GlobalImageViewerWindowResult {
  if (shouldLogViewerFallback()) {
    console.warn(`Global image viewer using overlay fallback: ${reason}`);
  }

  return { mode: "fallback", reason };
}

function logViewerDiagnostic(
  step: string,
  details: Record<string, unknown>,
) {
  if (!shouldLogViewerFallback()) {
    return;
  }

  console.info(`[GlobalImageViewerWindow] ${step}`, details);
}

function getPayloadDiagnostic(payload: GlobalImageViewerWindowPayload) {
  const activeImage = payload.images[payload.initialIndex];

  return {
    activeFilename: activeImage?.filename,
    activePath: activeImage?.path,
    imageCount: payload.images.length,
    initialIndex: payload.initialIndex,
    openRequestId: payload.openRequestId,
    resolution: activeImage?.resolution,
  };
}

function shouldLogViewerFallback() {
  const meta = import.meta as ImportMeta & { env?: { MODE?: string } };

  return (
    typeof import.meta !== "undefined" &&
    meta.env?.MODE !== "production" &&
    meta.env?.MODE !== "test"
  );
}

function formatViewerError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
