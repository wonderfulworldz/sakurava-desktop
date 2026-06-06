import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import GlobalImageViewer from "./GlobalImageViewer";
import {
  GLOBAL_IMAGE_VIEWER_PAYLOAD_REFRESH_EVENT,
  GLOBAL_IMAGE_VIEWER_PAYLOAD_EVENT,
  type GlobalImageViewerPayloadRefreshRequest,
  createGlobalImageViewerWindowPayload,
  emitViewerPayloadAck,
  type GlobalImageViewerWindowPayload,
  readStoredViewerPayload,
} from "../../runtime/globalImageViewerWindow";
import { MediaAssetScopeReadyContext } from "../../runtime/MediaAssetScopeContext";

function GlobalImageViewerWindow() {
  const [payload, setPayload] = useState<GlobalImageViewerWindowPayload | null>(
    () => readStoredViewerPayload(),
  );
  const [payloadEpoch, setPayloadEpoch] = useState(0);
  const payloadRef = useRef<GlobalImageViewerWindowPayload | null>(payload);

  function applyPayload(
    nextPayload: GlobalImageViewerWindowPayload,
    source: "event" | "refresh",
    expectedOpenRequestId?: string,
  ) {
    if (
      expectedOpenRequestId &&
      nextPayload.openRequestId !== expectedOpenRequestId
    ) {
      logViewerWindowDiagnostic("viewer-payload-refresh", {
        expectedOpenRequestId,
        ignoredOpenRequestId: nextPayload.openRequestId,
        reason: "open-request-id-mismatch",
      });
      return;
    }

    if (!isPayloadAtLeastCurrent(nextPayload, payloadRef.current)) {
      logViewerWindowDiagnostic("viewer-payload-received", {
        currentOpenRequestId: payloadRef.current?.openRequestId,
        ignoredOpenRequestId: nextPayload.openRequestId,
        reason: "stale-open-request-id",
        source,
      });
      return;
    }

    payloadRef.current = nextPayload;
    logViewerWindowDiagnostic("viewer-payload-received", {
      imageCount: nextPayload.images.length,
      initialIndex: nextPayload.initialIndex,
      openRequestId: nextPayload.openRequestId,
      source,
    });
    setPayload(nextPayload);
    setPayloadEpoch((current) => current + 1);
    void emitViewerPayloadAck(nextPayload.openRequestId);
  }

  useEffect(() => {
    let disposed = false;
    let unlistenPayload: (() => void) | undefined;
    let unlistenRefresh: (() => void) | undefined;

    void listen<GlobalImageViewerWindowPayload>(
      GLOBAL_IMAGE_VIEWER_PAYLOAD_EVENT,
      (event) => {
        applyPayload(
          createGlobalImageViewerWindowPayload(event.payload),
          "event",
        );
      },
    ).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
        return;
      }

      unlistenPayload = nextUnlisten;
    });

    void listen<GlobalImageViewerPayloadRefreshRequest>(
      GLOBAL_IMAGE_VIEWER_PAYLOAD_REFRESH_EVENT,
      (event) => {
        const storedPayload = readStoredViewerPayload();
        logViewerWindowDiagnostic("viewer-payload-refresh", {
          openRequestId: event.payload.openRequestId,
          storedOpenRequestId: storedPayload?.openRequestId,
        });

        if (!storedPayload) {
          return;
        }

        applyPayload(storedPayload, "refresh", event.payload.openRequestId);
      },
    ).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
        return;
      }

      unlistenRefresh = nextUnlisten;
    });

    return () => {
      disposed = true;
      unlistenPayload?.();
      unlistenRefresh?.();
    };
  }, []);

  async function closeViewerWindow() {
    try {
      await getCurrentWindow().close();
    } catch {
      setPayload(null);
      window.close();
    }
  }

  return (
    <MediaAssetScopeReadyContext.Provider value={true}>
      {payload ? (
        <GlobalImageViewer
          key={payloadKey(payload)}
          ariaLabel={payload.ariaLabel}
          images={payload.images}
          initialIndex={payload.initialIndex}
          isSeparateWindow
          onClose={() => void closeViewerWindow()}
          openRequestId={payload.openRequestId}
          viewerEpoch={payloadEpoch}
        />
      ) : (
        <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-sm font-semibold text-slate-300">
          No image selected.
        </div>
      )}
    </MediaAssetScopeReadyContext.Provider>
  );
}

function payloadKey(payload: GlobalImageViewerWindowPayload) {
  return JSON.stringify({
    ariaLabel: payload.ariaLabel,
    images: payload.images.map((image) => ({
      filename: image.filename,
      path: image.path,
      resolution: image.resolution,
      title: image.title,
    })),
    initialIndex: payload.initialIndex,
    openRequestId: payload.openRequestId,
  });
}

function isPayloadAtLeastCurrent(
  nextPayload: GlobalImageViewerWindowPayload,
  currentPayload: GlobalImageViewerWindowPayload | null,
) {
  if (!currentPayload) {
    return true;
  }

  if (nextPayload.openRequestId === currentPayload.openRequestId) {
    return true;
  }

  const nextTimestamp = parseOpenRequestTimestamp(nextPayload.openRequestId);
  const currentTimestamp = parseOpenRequestTimestamp(currentPayload.openRequestId);

  if (nextTimestamp === null || currentTimestamp === null) {
    return true;
  }

  return nextTimestamp >= currentTimestamp;
}

function parseOpenRequestTimestamp(openRequestId: string) {
  const match = /^image-open-([a-z0-9]+)-/.exec(openRequestId);
  if (!match) {
    return null;
  }

  const timestamp = Number.parseInt(match[1], 36);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function logViewerWindowDiagnostic(
  step: string,
  details: Record<string, unknown>,
) {
  const meta = import.meta as ImportMeta & { env?: { MODE?: string } };
  if (meta.env?.MODE === "production" || meta.env?.MODE === "test") {
    return;
  }

  console.info(`[GlobalImageViewerWindow] ${step}`, details);
}

export default GlobalImageViewerWindow;
