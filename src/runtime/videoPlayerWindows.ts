import { supportsMultipleWindows } from "@tauri-apps/api/app";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  currentMonitor,
  getCurrentWindow,
  LogicalPosition,
  LogicalSize,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export const VIDEO_PLAYER_WINDOW_LABEL = "video-player";
export const CONTACT_SHEET_WINDOW_LABEL = "contact-sheet";
export const MINI_PLAYER_WINDOW_LABEL = "mini-player";
export const VIDEO_PLAYER_WINDOW_KIND = "video-player";
export const CONTACT_SHEET_WINDOW_KIND = "contact-sheet";
export const MINI_PLAYER_WINDOW_KIND = "mini-player";

const VIDEO_PLAYER_PAYLOAD_EVENT = "video-player:payload";
const CONTACT_SHEET_PAYLOAD_EVENT = "contact-sheet:payload";
const MINI_PLAYER_PAYLOAD_EVENT = "mini-player:payload";
const VIDEO_PLAYER_PAYLOAD_STORAGE_KEY =
  "sakurava.videoPlayer.windowPayload.v1";
const CONTACT_SHEET_PAYLOAD_STORAGE_KEY =
  "sakurava.contactSheet.windowPayload.v1";
const MINI_PLAYER_PAYLOAD_STORAGE_KEY =
  "sakurava.miniPlayer.windowPayload.v1";

export type VideoPlayerWindowPayload = {
  displayName: string;
  resolution: string;
  durationLabel: string;
  requestId: string;
};

export type ProductionVideoPlayerOpenInput = Omit<VideoPlayerWindowPayload, "requestId"> & {
  sourceIdentity: string;
};

export type ContactSheetWindowPayload = VideoPlayerWindowPayload;
export type MiniPlayerWindowPayload = VideoPlayerWindowPayload;

export type VideoDimensions = {
  width: number;
  height: number;
};

export type LogicalWorkArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MiniPlayerResizeCorner =
  | "north-west"
  | "north-east"
  | "south-west"
  | "south-east";

export type MiniPlayerResizeSession = {
  corner: MiniPlayerResizeCorner;
  pointerX: number;
  pointerY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  ratio: number;
  minimum: VideoDimensions;
  workArea: LogicalWorkArea;
};

export type MiniPlayerWindowGeometry = VideoDimensions & {
  x: number;
  y: number;
};

type WindowPayloadInput = Omit<VideoPlayerWindowPayload, "requestId">;
export type AuxiliaryWindowOpenResult =
  | { mode: "window" }
  | { mode: "unavailable"; reason: string };

export function getSakuravaWindowKind() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("sakuravaWindow");
}

export async function openVideoPlayerWindow(
  input: ProductionVideoPlayerOpenInput,
): Promise<AuxiliaryWindowOpenResult> {
  if (!isTauriRuntimeAvailable()) {
    return { mode: "unavailable", reason: "tauri-runtime-unavailable" };
  }
  try {
    await invokeTauriCommand("video_player_open", { input });
    return { mode: "window" };
  } catch (error) {
    return { mode: "unavailable", reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function openContactSheetWindow(
  input: WindowPayloadInput,
): Promise<AuxiliaryWindowOpenResult> {
  const payload = createPayload("contact", input);
  return openAuxiliaryWindow({
    label: CONTACT_SHEET_WINDOW_LABEL,
    kind: CONTACT_SHEET_WINDOW_KIND,
    title: "Sakurava Contact Sheet",
    payload,
    payloadEvent: CONTACT_SHEET_PAYLOAD_EVENT,
    storageKey: CONTACT_SHEET_PAYLOAD_STORAGE_KEY,
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 560,
  });
}

export async function openMiniPlayerWindow(
  input: WindowPayloadInput,
): Promise<AuxiliaryWindowOpenResult> {
  const dimensions = parseVideoResolution(input.resolution);
  if (!dimensions) {
    return { mode: "unavailable", reason: "video-dimensions-unknown" };
  }
  const payload = createPayload("mini", input);
  const fallbackGeometry = calculateInitialMiniPlayerGeometry(dimensions);
  return openAuxiliaryWindow({
    label: MINI_PLAYER_WINDOW_LABEL,
    kind: MINI_PLAYER_WINDOW_KIND,
    title: "Sakurava Mini Player",
    payload,
    payloadEvent: MINI_PLAYER_PAYLOAD_EVENT,
    storageKey: MINI_PLAYER_PAYLOAD_STORAGE_KEY,
    width: fallbackGeometry.width,
    height: fallbackGeometry.height,
    minWidth: fallbackGeometry.minWidth,
    minHeight: fallbackGeometry.minHeight,
    alwaysOnTop: true,
    getCreationOptions: async () => {
      const monitor = await getPreferredMonitor();
      const geometry = calculateInitialMiniPlayerGeometry(
        dimensions,
        monitor ? logicalWorkAreaFromMonitor(monitor) : undefined,
      );
      return {
        center: false,
        decorations: false,
        height: geometry.height,
        minHeight: geometry.minHeight,
        minWidth: geometry.minWidth,
        preventOverflow: { width: 16, height: 16 },
        resizable: false,
        width: geometry.width,
        x: geometry.x,
        y: geometry.y,
      };
    },
  });
}

export function parseVideoResolution(value: string): VideoDimensions | null {
  const match = value.trim().match(/^(\d+)\s*[xX×]\s*(\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { width, height };
}

export function calculateInitialMiniPlayerGeometry(
  dimensions: VideoDimensions,
  workArea?: LogicalWorkArea,
  margin = 16,
) {
  const ratio = dimensions.width / dimensions.height;
  const target = sizeForLongEdge(ratio, 520);
  const minimum = sizeForShortEdge(ratio, 220);
  const availableWidth = workArea
    ? Math.max(1, workArea.width - margin * 2)
    : Number.POSITIVE_INFINITY;
  const availableHeight = workArea
    ? Math.max(1, workArea.height - margin * 2)
    : Number.POSITIVE_INFINITY;
  const fittedTarget = fitSize(target, availableWidth, availableHeight);
  const fittedMinimum = fitSize(minimum, availableWidth, availableHeight);
  const width = Math.max(1, Math.round(fittedTarget.width));
  const height = Math.max(1, Math.round(fittedTarget.height));
  const minWidth = Math.max(1, Math.round(fittedMinimum.width));
  const minHeight = Math.max(1, Math.round(fittedMinimum.height));

  return {
    width,
    height,
    minWidth,
    minHeight,
    x: workArea
      ? Math.round(workArea.x + workArea.width - width - margin)
      : undefined,
    y: workArea
      ? Math.round(workArea.y + workArea.height - height - margin)
      : undefined,
  };
}

export function calculateMiniPlayerResize(
  session: MiniPlayerResizeSession,
  pointerX: number,
  pointerY: number,
): MiniPlayerWindowGeometry {
  const isWest = session.corner.endsWith("west");
  const isNorth = session.corner.startsWith("north");
  const deltaX = pointerX - session.pointerX;
  const deltaY = pointerY - session.pointerY;
  const rawWidth = session.startWidth + (isWest ? -deltaX : deltaX);
  const rawHeight = session.startHeight + (isNorth ? -deltaY : deltaY);
  const widthChange = Math.abs(rawWidth - session.startWidth) / session.startWidth;
  const heightChange = Math.abs(rawHeight - session.startHeight) / session.startHeight;
  const proposedWidth =
    widthChange >= heightChange ? rawWidth : rawHeight * session.ratio;
  const anchorRight = session.startX + session.startWidth;
  const anchorBottom = session.startY + session.startHeight;
  const maximumWidth = Math.max(
    session.minimum.width,
    Math.min(
      isWest
        ? anchorRight - session.workArea.x
        : session.workArea.x + session.workArea.width - session.startX,
      (isNorth
        ? anchorBottom - session.workArea.y
        : session.workArea.y + session.workArea.height - session.startY) *
        session.ratio,
    ),
  );
  const width = clamp(proposedWidth, session.minimum.width, maximumWidth);
  const height = width / session.ratio;

  return {
    width,
    height,
    x: isWest ? anchorRight - width : session.startX,
    y: isNorth ? anchorBottom - height : session.startY,
  };
}

export async function startCurrentMiniPlayerDragging() {
  if (!isTauriRuntimeAvailable()) return false;
  try {
    await getCurrentWindow().startDragging();
    return true;
  } catch {
    return false;
  }
}

export async function createCurrentMiniPlayerResizeSession(
  corner: MiniPlayerResizeCorner,
  dimensions: VideoDimensions,
  pointerX: number,
  pointerY: number,
): Promise<MiniPlayerResizeSession | null> {
  if (!isTauriRuntimeAvailable()) return null;
  try {
    const appWindow = getCurrentWindow();
    const [scaleFactor, position, size, monitor] = await Promise.all([
      appWindow.scaleFactor(),
      appWindow.outerPosition(),
      appWindow.innerSize(),
      getPreferredMonitor(),
    ]);
    if (!monitor) return null;
    const logicalPosition = position.toLogical(scaleFactor);
    const logicalSize = size.toLogical(scaleFactor);
    return {
      corner,
      pointerX,
      pointerY,
      startX: logicalPosition.x,
      startY: logicalPosition.y,
      startWidth: logicalSize.width,
      startHeight: logicalSize.height,
      ratio: dimensions.width / dimensions.height,
      minimum: sizeForShortEdge(dimensions.width / dimensions.height, 220),
      workArea: logicalWorkAreaFromMonitor(monitor),
    };
  } catch {
    return null;
  }
}

export async function applyCurrentMiniPlayerGeometry(
  geometry: MiniPlayerWindowGeometry,
) {
  if (!isTauriRuntimeAvailable()) return false;
  try {
    const appWindow = getCurrentWindow();
    await Promise.all([
      appWindow.setPosition(
        new LogicalPosition(Math.round(geometry.x), Math.round(geometry.y)),
      ),
      appWindow.setSize(
        new LogicalSize(
          Math.max(1, Math.round(geometry.width)),
          Math.max(1, Math.round(geometry.height)),
        ),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function readStoredVideoPlayerPayload() {
  return readStoredPayload(VIDEO_PLAYER_PAYLOAD_STORAGE_KEY);
}

export function readStoredContactSheetPayload() {
  return readStoredPayload(CONTACT_SHEET_PAYLOAD_STORAGE_KEY);
}

export function readStoredMiniPlayerPayload() {
  return readStoredPayload(MINI_PLAYER_PAYLOAD_STORAGE_KEY);
}

export function listenForVideoPlayerPayload(
  handler: (payload: VideoPlayerWindowPayload) => void,
) {
  return listen<VideoPlayerWindowPayload>(VIDEO_PLAYER_PAYLOAD_EVENT, (event) =>
    handler(event.payload),
  );
}

export function listenForContactSheetPayload(
  handler: (payload: ContactSheetWindowPayload) => void,
) {
  return listen<ContactSheetWindowPayload>(
    CONTACT_SHEET_PAYLOAD_EVENT,
    (event) => handler(event.payload),
  );
}

export function listenForMiniPlayerPayload(
  handler: (payload: MiniPlayerWindowPayload) => void,
) {
  return listen<MiniPlayerWindowPayload>(MINI_PLAYER_PAYLOAD_EVENT, (event) =>
    handler(event.payload),
  );
}

export async function setCurrentPlayerFullscreen(enabled: boolean) {
  if (!isTauriRuntimeAvailable()) return false;
  try {
    await getCurrentWindow().setFullscreen(enabled);
    return true;
  } catch {
    return false;
  }
}

export async function setCurrentPlayerAlwaysOnTop(enabled: boolean) {
  if (!isTauriRuntimeAvailable()) return false;
  try {
    await getCurrentWindow().setAlwaysOnTop(enabled);
    return true;
  } catch {
    return false;
  }
}

export async function closeCurrentAuxiliaryWindow() {
  if (!isTauriRuntimeAvailable()) return false;
  try {
    await getCurrentWindow().close();
    return true;
  } catch {
    return false;
  }
}

export async function returnToVideoPlayerWindow() {
  if (!isTauriRuntimeAvailable()) return false;
  try {
    const videoPlayerWindow = await WebviewWindow.getByLabel(
      VIDEO_PLAYER_WINDOW_LABEL,
    );
    await videoPlayerWindow?.setFocus();
    await getCurrentWindow().close();
    return true;
  } catch {
    return false;
  }
}

function createPayload(prefix: string, input: WindowPayloadInput) {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return {
    ...input,
    requestId: `${prefix}-${Date.now().toString(36)}-${randomPart}`,
  } satisfies VideoPlayerWindowPayload;
}

async function openAuxiliaryWindow({
  label,
  kind,
  title,
  payload,
  payloadEvent,
  storageKey,
  width,
  height,
  minWidth,
  minHeight,
  alwaysOnTop,
  getCreationOptions,
}: {
  label: string;
  kind: string;
  title: string;
  payload: VideoPlayerWindowPayload;
  payloadEvent: string;
  storageKey: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  alwaysOnTop?: boolean;
  getCreationOptions?: () => Promise<{
    center?: boolean;
    decorations?: boolean;
    height?: number;
    minHeight?: number;
    minWidth?: number;
    preventOverflow?: boolean | { width: number; height: number };
    resizable?: boolean;
    width?: number;
    x?: number;
    y?: number;
  }>;
}): Promise<AuxiliaryWindowOpenResult> {
  if (!isTauriRuntimeAvailable()) {
    return { mode: "unavailable", reason: "tauri-runtime-unavailable" };
  }

  try {
    if (!(await supportsMultipleWindows())) {
      return { mode: "unavailable", reason: "multiple-windows-unsupported" };
    }

    storePayload(storageKey, payload);
    const existingWindow = await WebviewWindow.getByLabel(label);
    if (existingWindow) {
      await existingWindow.setFocus();
      await emitTo(
        { kind: "WebviewWindow", label },
        payloadEvent,
        payload,
      );
      return { mode: "window" };
    }

    const creationOptions = await getCreationOptions?.();
    const createdWindow = new WebviewWindow(label, {
      center: creationOptions?.center ?? true,
      decorations: creationOptions?.decorations ?? true,
      focus: true,
      height: creationOptions?.height ?? height,
      alwaysOnTop,
      minHeight: creationOptions?.minHeight ?? minHeight,
      minWidth: creationOptions?.minWidth ?? minWidth,
      preventOverflow: creationOptions?.preventOverflow,
      resizable: creationOptions?.resizable ?? true,
      title,
      url: `/?sakuravaWindow=${kind}`,
      width: creationOptions?.width ?? width,
      x: creationOptions?.x,
      y: creationOptions?.y,
    });

    return await new Promise<AuxiliaryWindowOpenResult>((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        settle({ mode: "unavailable", reason: "window-create-timeout" });
      }, 4000);

      function settle(result: AuxiliaryWindowOpenResult) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(result);
      }

      void createdWindow.once("tauri://created", () =>
        settle({ mode: "window" }),
      );
      void createdWindow.once<string>("tauri://error", (event) =>
        settle({
          mode: "unavailable",
          reason: `window-create-failed:${String(event.payload)}`,
        }),
      );
    });
  } catch (error) {
    return {
      mode: "unavailable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getPreferredMonitor() {
  try {
    return (await currentMonitor()) ?? (await primaryMonitor());
  } catch {
    try {
      return await primaryMonitor();
    } catch {
      return null;
    }
  }
}

function logicalWorkAreaFromMonitor(monitor: Monitor): LogicalWorkArea {
  const position = monitor.workArea.position.toLogical(monitor.scaleFactor);
  const size = monitor.workArea.size.toLogical(monitor.scaleFactor);
  return { x: position.x, y: position.y, width: size.width, height: size.height };
}

function sizeForLongEdge(ratio: number, longEdge: number): VideoDimensions {
  return ratio >= 1
    ? { width: longEdge, height: longEdge / ratio }
    : { width: longEdge * ratio, height: longEdge };
}

function sizeForShortEdge(ratio: number, shortEdge: number): VideoDimensions {
  return ratio >= 1
    ? { width: shortEdge * ratio, height: shortEdge }
    : { width: shortEdge, height: shortEdge / ratio };
}

function fitSize(
  size: VideoDimensions,
  maximumWidth: number,
  maximumHeight: number,
): VideoDimensions {
  const scale = Math.min(1, maximumWidth / size.width, maximumHeight / size.height);
  return { width: size.width * scale, height: size.height * scale };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function storePayload(storageKey: string, payload: VideoPlayerWindowPayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // The event path remains available for an existing auxiliary window.
  }
}

function readStoredPayload(storageKey: string): VideoPlayerWindowPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as
      | Partial<VideoPlayerWindowPayload>
      | null;
    if (
      !parsed ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.resolution !== "string" ||
      typeof parsed.durationLabel !== "string" ||
      typeof parsed.requestId !== "string"
    ) {
      return null;
    }
    return parsed as VideoPlayerWindowPayload;
  } catch {
    return null;
  }
}
