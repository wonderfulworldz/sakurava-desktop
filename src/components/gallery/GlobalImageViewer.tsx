import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpDown,
  FolderOpen,
  HelpCircle,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  MoreVertical,
  RotateCcw,
  RotateCcwSquare,
  RotateCwSquare,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
  type WheelEvent as ReactWheelEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { localImagePathToAssetSrc } from "../../runtime/localAsset";
import { useMediaAssetScopeReady } from "../../runtime/MediaAssetScopeContext";
import {
  openDetailSourceFolder,
  saveDetailSourceFileAs,
} from "../../runtime/detailActions";
import { isTauriRuntimeAvailable } from "../../runtime/tauriClient";

export type GlobalImageViewerItem = {
  filename?: string;
  path: string;
  resolution?: string;
  title?: string;
};

export type GlobalImageViewerProps = {
  ariaLabel?: string;
  images?: GlobalImageViewerItem[];
  initialIndex: number;
  isSeparateWindow?: boolean;
  onClose: () => void;
  onOpenFolder?: (path: string) => void;
  openRequestId?: string;
  paths?: string[];
  viewerEpoch?: number;
};

const GALLERY_CONTROLS_IDLE_DELAY_MS = 2000;
const VIEWER_POPOVER_CLOSE_DELAY_MS = 5000;
const COPY_FEEDBACK_CLEAR_MS = 1600;
const VIEWER_SETTINGS_STORAGE_KEY = "sakurava.globalImageViewer.settings.v1";
const MIN_GALLERY_ZOOM = 0.25;
export const MAX_GALLERY_ZOOM = 5;
const GALLERY_ZOOM_STEP = 0.25;
const VIEWPORT_FALLBACK = { width: 1000, height: 700 };
const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5];
const FIT_MODES = [
  { label: "Fit Window", value: "window" },
  { label: "Fit Width", value: "width" },
  { label: "Fit Height", value: "height" },
] as const;

type FitMode = (typeof FIT_MODES)[number]["value"];

type Size = {
  height: number;
  width: number;
};

type Point = {
  x: number;
  y: number;
};

type DragState =
  | {
      pan: Point;
      pointerId: number;
      start: Point;
    }
  | null;

function GlobalImageViewer({
  ariaLabel = "Gallery full-size viewer",
  images,
  initialIndex,
  isSeparateWindow = false,
  onClose,
  onOpenFolder,
  openRequestId,
  paths,
  viewerEpoch = 0,
}: GlobalImageViewerProps) {
  const normalizedImages: GlobalImageViewerItem[] = useMemo(
    () => images ?? paths?.map((path) => ({ path })) ?? [],
    [images, paths],
  );
  const normalizedImagesKey = useMemo(
    () =>
      JSON.stringify(
        normalizedImages.map((image) => ({
          filename: image.filename,
          path: image.path,
          resolution: image.resolution,
          title: image.title,
        })),
      ),
    [normalizedImages],
  );
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageFailed, setImageFailed] = useState(false);
  const [isFitMode, setIsFitMode] = useState(
    () => readStoredViewerSettings().isFitMode,
  );
  const [fitMode, setFitMode] = useState<FitMode>(
    () => readStoredViewerSettings().fitMode,
  );
  const [zoom, setZoom] = useState(() => readStoredViewerSettings().zoom);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(
    () => readStoredViewerSettings().rotation,
  );
  const [naturalSize, setNaturalSize] = useState<Size | null>(null);
  const [viewportSize, setViewportSize] = useState<Size>(VIEWPORT_FALLBACK);
  const [dockWidth, setDockWidth] = useState(VIEWPORT_FALLBACK.width);
  const [controlPanelWidth, setControlPanelWidth] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [dragState, setDragState] = useState<DragState>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [rotationMenuOpen, setRotationMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [viewerControlsMenuOpen, setViewerControlsMenuOpen] = useState(false);
  const [fileInfoOpen, setFileInfoOpen] = useState(false);
  const [alwaysShowControls, setAlwaysShowControls] = useState(
    () => readStoredViewerSettings().alwaysShowControls,
  );
  const [rememberViewerSettings, setRememberViewerSettings] = useState(
    () => readStoredViewerSettings().rememberViewerSettings,
  );
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [fileActionFeedback, setFileActionFeedback] = useState<string | null>(null);
  const [pendingFileAction, setPendingFileAction] = useState<"save" | "folder" | null>(
    null,
  );
  const [minimapDragging, setMinimapDragging] = useState(false);
  const [isFullWindow, setIsFullWindow] = useState(false);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bottomDockRef = useRef<HTMLDivElement | null>(null);
  const controlPanelRef = useRef<HTMLDivElement | null>(null);
  const hideControlsTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(
    null,
  );
  const popoverCloseTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(
    null,
  );
  const copyFeedbackTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(
    null,
  );
  const fileActionPendingRef = useRef<"save" | "folder" | null>(null);
  const panSurfaceRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const activeImageKeyRef = useRef("");
  const panPointerIdRef = useRef<number | null>(null);
  const minimapPointerIdRef = useRef<number | null>(null);
  const skipNextSettingsStoreRef = useRef(false);
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const item = normalizedImages[currentIndex];
  const path = item?.path ?? "";
  const assetSrc = localImagePathToAssetSrc(path);
  const activeImageKey = `${openRequestId ?? viewerEpoch}:${currentIndex}:${path}:${item?.filename ?? ""}:${item?.resolution ?? ""}:${item?.title ?? ""}`;
  activeImageKeyRef.current = activeImageKey;
  const parsedResolution = parseResolution(item?.resolution);
  const activeNaturalSize = naturalSize ?? parsedResolution;
  const canShowImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < normalizedImages.length - 1;
  const displayName = item?.filename || fileNameFromPath(path) || item?.title || "Gallery image";
  const resolution =
    item?.resolution?.trim() ??
    (activeNaturalSize
      ? `${activeNaturalSize.width} x ${activeNaturalSize.height}`
      : undefined);
  const fitScale = getFitScale(activeNaturalSize, viewportSize, fitMode);
  const effectiveScale = isFitMode ? fitScale : zoom;
  const zoomLabel = isFitMode ? "Fit" : `${Math.round(zoom * 100)}%`;
  const zoomControlScale = isFitMode ? fitScale : zoom;
  const zoomControlSliderValue = clamp(
    zoomControlScale,
    MIN_GALLERY_ZOOM,
    MAX_GALLERY_ZOOM,
  );
  const zoomControlLabel = `${Math.round(zoomControlScale * 100)}%`;
  const imageSize = activeNaturalSize
    ? {
        width: activeNaturalSize.width * effectiveScale,
        height: activeNaturalSize.height * effectiveScale,
      }
    : null;
  const panBounds = getPanBounds(imageSize, viewportSize);
  const isPannable = panBounds.x > 0 || panBounds.y > 0;
  const showMinimap = Boolean(canShowImage && activeNaturalSize && isPannable);
  const aspectRatioLabel = activeNaturalSize
    ? roundedAspectRatio(activeNaturalSize.width, activeNaturalSize.height)
    : "1:1";
  const controlsVisibilityClass = controlsVisible
    ? "opacity-100"
    : "pointer-events-none opacity-0";
  const glassPanelClass = "viewer-panel";
  const glassButtonClass =
    "viewer-button inline-flex items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 disabled:cursor-not-allowed disabled:opacity-40";
  const pillButtonClass =
    "inline-flex h-10 items-center justify-center rounded-lg px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 sm:px-4";
  const activePillClass = "bg-sakura-500/85 text-white shadow-sm";
  const inactivePillClass = "viewer-button hover:text-sakura-600";
  const viewportRect = useMemo(
    () => getMinimapViewportRect(activeNaturalSize, imageSize, viewportSize, pan),
    [activeNaturalSize, imageSize, pan, viewportSize],
  );
  const minimapSize = getMinimapSize(activeNaturalSize, viewportSize);
  const bottomDockMode = getBottomDockMode({
    controlPanelWidth,
    dockWidth,
    minimapVisible: showMinimap,
    minimapWidth: minimapSize.width,
  });
  const dockMinimapVisible = showMinimap && bottomDockMode !== "compact";
  const anyPopoverOpen =
    shortcutsOpen ||
    zoomMenuOpen ||
    rotationMenuOpen ||
    moreMenuOpen ||
    viewerControlsMenuOpen ||
    fileInfoOpen;
  const canCopyText =
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function";
  const fitModeLabel =
    FIT_MODES.find((mode) => mode.value === fitMode)?.label ?? "Fit Window";
  const fileType = getFileType(displayName || path);
  const actionSourcePath = path.trim();
  const hasActionSourcePath = actionSourcePath.length > 0;

  function clearHideControlsTimer() {
    if (hideControlsTimerRef.current) {
      window.clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
  }

  function clearPopoverCloseTimer() {
    if (popoverCloseTimerRef.current) {
      window.clearTimeout(popoverCloseTimerRef.current);
      popoverCloseTimerRef.current = null;
    }
  }

  function clearCopyFeedbackTimer() {
    if (copyFeedbackTimerRef.current) {
      window.clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }
  }

  function closePopovers() {
    setShortcutsOpen(false);
    setZoomMenuOpen(false);
    setRotationMenuOpen(false);
    setMoreMenuOpen(false);
    setViewerControlsMenuOpen(false);
    setFileInfoOpen(false);
    clearPopoverCloseTimer();
  }

  function schedulePopoverClose() {
    clearPopoverCloseTimer();
    popoverCloseTimerRef.current = window.setTimeout(() => {
      closePopovers();
      scheduleHideControls();
    }, VIEWER_POPOVER_CLOSE_DELAY_MS);
  }

  function scheduleHideControls() {
    clearHideControlsTimer();
    if (alwaysShowControls) {
      setControlsVisible(true);
      return;
    }

    hideControlsTimerRef.current = window.setTimeout(() => {
      if (anyPopoverOpen || dragState || minimapDragging) {
        scheduleHideControls();
        return;
      }

      const activeElement = document.activeElement;
      if (
        viewerRef.current &&
        activeElement instanceof HTMLElement &&
        viewerRef.current.contains(activeElement) &&
        activeElement !== viewerRef.current
      ) {
        scheduleHideControls();
        return;
      }

      setControlsVisible(false);
    }, GALLERY_CONTROLS_IDLE_DELAY_MS);
  }

  function showControlsAndResetIdleTimer() {
    setControlsVisible(true);
    scheduleHideControls();
  }

  function openPopover(
    popover: "shortcuts" | "zoom" | "rotation" | "more" | "viewerControls" | "fileInfo",
  ) {
    setControlsVisible(true);
    clearHideControlsTimer();
    clearPopoverCloseTimer();
    setShortcutsOpen(popover === "shortcuts");
    setZoomMenuOpen(popover === "zoom");
    setRotationMenuOpen(popover === "rotation");
    setMoreMenuOpen(popover === "more");
    setViewerControlsMenuOpen(popover === "viewerControls");
    setFileInfoOpen(popover === "fileInfo");
  }

  function closeViewer() {
    releasePointerState();
    onClose();
  }

  function releaseCapturedPointers() {
    if (panPointerIdRef.current !== null) {
      try {
        panSurfaceRef.current?.releasePointerCapture?.(panPointerIdRef.current);
      } catch {
        // Pointer capture may already be released after payload or image changes.
      }
      panPointerIdRef.current = null;
    }

    if (minimapPointerIdRef.current !== null) {
      try {
        minimapRef.current?.releasePointerCapture?.(minimapPointerIdRef.current);
      } catch {
        // Pointer capture may already be released after payload or image changes.
      }
      minimapPointerIdRef.current = null;
    }
  }

  function releasePointerState() {
    releaseCapturedPointers();
    setDragState(null);
    setMinimapDragging(false);
  }

  function getResetViewerSettings() {
    return rememberViewerSettings
      ? readStoredViewerSettings()
      : defaultViewerSettings();
  }

  function resetPan() {
    setPan({ x: 0, y: 0 });
  }

  function resetTransform(settings = getResetViewerSettings()) {
    setIsFitMode(settings.isFitMode);
    setFitMode(settings.fitMode);
    setZoom(settings.zoom);
    setRotation(settings.rotation);
    resetPan();
  }

  function goToIndex(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= normalizedImages.length) {
      return;
    }

    setCurrentIndex(nextIndex);
    setImageFailed(false);
    releasePointerState();
    resetTransform();
    setNaturalSize(null);
    showControlsAndResetIdleTimer();
  }

  function setFit(nextFitMode = fitMode) {
    showControlsAndResetIdleTimer();
    setIsFitMode(true);
    setFitMode(nextFitMode);
    setZoom(1);
    resetPan();
  }

  function cycleFitMode() {
    const currentIndex = FIT_MODES.findIndex((mode) => mode.value === fitMode);
    const nextMode =
      FIT_MODES[(currentIndex + 1) % FIT_MODES.length]?.value ?? "window";
    setFit(nextMode);
  }

  function setActualSize() {
    showControlsAndResetIdleTimer();
    setIsFitMode(false);
    setZoom(1);
    resetPan();
  }

  function setDefaultRotation() {
    showControlsAndResetIdleTimer();
    setRotation(0);
    resetPan();
  }

  function resetView() {
    showControlsAndResetIdleTimer();
    setImageFailed(false);
    releasePointerState();
    skipNextSettingsStoreRef.current = true;
    resetTransform(defaultViewerSettings());
  }

  function syncViewportSizeNow() {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setViewportSize({
      width: Math.max(1, Math.round(rect.width || VIEWPORT_FALLBACK.width)),
      height: Math.max(1, Math.round(rect.height || VIEWPORT_FALLBACK.height)),
    });
  }

  function setZoomPreset(nextZoom: number) {
    showControlsAndResetIdleTimer();
    setZoomMenuOpen(false);
    applyZoom(nextZoom);
  }

  function applyZoom(nextZoom: number, anchor?: Point) {
    const clampedZoom = clamp(nextZoom, MIN_GALLERY_ZOOM, MAX_GALLERY_ZOOM);
    const previousScale = effectiveScale;
    const nextScale = clampedZoom;
    const currentNaturalSize = activeNaturalSize;

    setIsFitMode(false);
    setZoom(clampedZoom);
    setPan((currentPan) => {
      if (!currentNaturalSize || !anchor || previousScale <= 0) {
        return currentNaturalSize
          ? clampPan(
              currentPan,
              getPanBounds(getImageSize(currentNaturalSize, nextScale), viewportSize),
            )
          : currentPan;
      }

      const nextImageSize = getImageSize(currentNaturalSize, nextScale);
      const nextBounds = getPanBounds(nextImageSize, viewportSize);
      const viewportCenter = {
        x: viewportSize.width / 2,
        y: viewportSize.height / 2,
      };
      const imagePoint = {
        x: (anchor.x - viewportCenter.x - currentPan.x) / previousScale,
        y: (anchor.y - viewportCenter.y - currentPan.y) / previousScale,
      };
      const nextPan = {
        x: anchor.x - viewportCenter.x - imagePoint.x * nextScale,
        y: anchor.y - viewportCenter.y - imagePoint.y * nextScale,
      };

      return clampPan(nextPan, nextBounds);
    });
  }

  function rotateBy(delta: number) {
    showControlsAndResetIdleTimer();
    setRotation((current) => normalizeRotation(current + delta));
    resetPan();
  }

  function snapRotation(value: number) {
    const snapPoints = [-180, -90, 0, 90, 180];
    const closeSnap = snapPoints.find((snapPoint) => Math.abs(value - snapPoint) <= 2);
    return closeSnap ?? value;
  }

  function setRotationDegrees(nextRotation: number) {
    showControlsAndResetIdleTimer();
    setRotation(normalizeRotation(snapRotation(nextRotation)));
    resetPan();
  }

  function zoomIn(anchor?: Point) {
    showControlsAndResetIdleTimer();
    applyZoom((isFitMode ? fitScale : zoom) + GALLERY_ZOOM_STEP, anchor);
  }

  function zoomOut(anchor?: Point) {
    showControlsAndResetIdleTimer();
    applyZoom((isFitMode ? fitScale : zoom) - GALLERY_ZOOM_STEP, anchor);
  }

  function handleImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    if (event.currentTarget.dataset.viewerImageKey !== activeImageKeyRef.current) {
      return;
    }

    const nextNaturalSize = {
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    };

    if (nextNaturalSize.width > 0 && nextNaturalSize.height > 0) {
      setNaturalSize(nextNaturalSize);
    }
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!canShowImage) {
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    if (event.deltaY < 0) {
      applyZoom((isFitMode ? fitScale : zoom) + GALLERY_ZOOM_STEP, anchor);
      return;
    }

    applyZoom((isFitMode ? fitScale : zoom) - GALLERY_ZOOM_STEP, anchor);
  }

  function handleImagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isPannable) {
      return;
    }

    event.preventDefault();
    showControlsAndResetIdleTimer();
    clearHideControlsTimer();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panPointerIdRef.current = event.pointerId;
    setDragState({
      pan,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
    });
  }

  function handleImagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextPan = {
      x: dragState.pan.x + event.clientX - dragState.start.x,
      y: dragState.pan.y + event.clientY - dragState.start.y,
    };

    setPan(clampPan(nextPan, panBounds));
  }

  function stopDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragState?.pointerId === event.pointerId) {
      setDragState(null);
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture can already be released after rapid image changes.
      }
      panPointerIdRef.current = null;
      scheduleHideControls();
    }
  }

  function handleDoubleClick() {
    if (isFitMode) {
      setActualSize();
      return;
    }

    setFit();
  }

  async function toggleFullWindow() {
    showControlsAndResetIdleTimer();

    if (isSeparateWindow && isTauriRuntimeAvailable()) {
      try {
        const nextFullscreen = !isFullWindow;
        await getCurrentWindow().setFullscreen(nextFullscreen);
        setIsFullWindow(nextFullscreen);
        return;
      } catch {
        // Fall through to browser fullscreen as a safe fallback.
      }
    }

    const viewer = viewerRef.current;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
        setIsFullWindow(false);
        return;
      }

      await viewer?.requestFullscreen?.();
      setIsFullWindow(true);
    } catch {
      setIsFullWindow((current) => !current);
    }
  }

  function handleMinimapPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activeNaturalSize || !imageSize) {
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const normalized = {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
    const nextPan = minimapPointToPan(
      normalized,
      activeNaturalSize,
      imageSize,
      viewportSize,
    );

    setPan(clampPan(nextPan, panBounds));
  }

  function stopMinimapDrag() {
    if (minimapPointerIdRef.current !== null) {
      try {
        minimapRef.current?.releasePointerCapture?.(minimapPointerIdRef.current);
      } catch {
        // Pointer capture can already be released after rapid image changes.
      }
      minimapPointerIdRef.current = null;
    }

    setMinimapDragging(false);
    scheduleHideControls();
  }

  async function copyText(value: string | undefined, label: string) {
    if (!value || !canCopyText) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopyFeedback(`${label} copied`);
    clearCopyFeedbackTimer();
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback(null);
    }, COPY_FEEDBACK_CLEAR_MS);
    showControlsAndResetIdleTimer();
  }

  async function saveCurrentImageAs() {
    if (!hasActionSourcePath || fileActionPendingRef.current) {
      setFileActionFeedback("No source file available");
      return;
    }

    fileActionPendingRef.current = "save";
    setPendingFileAction("save");
    setFileActionFeedback(null);
    try {
      const result = await saveDetailSourceFileAs(actionSourcePath);
      setFileActionFeedback(
        result.message ||
          (result.success ? "Source file saved" : "Source file could not be saved"),
      );
    } finally {
      fileActionPendingRef.current = null;
      setPendingFileAction(null);
      showControlsAndResetIdleTimer();
    }
  }

  async function openCurrentImageFolder() {
    if (!hasActionSourcePath || fileActionPendingRef.current) {
      setFileActionFeedback("No source folder available");
      return;
    }

    fileActionPendingRef.current = "folder";
    setPendingFileAction("folder");
    setFileActionFeedback(null);
    try {
      const result = await openDetailSourceFolder(actionSourcePath);
      setFileActionFeedback(
        result.message ||
          (result.success ? "Source folder opened" : "Source folder could not be opened"),
      );
    } finally {
      fileActionPendingRef.current = null;
      setPendingFileAction(null);
      showControlsAndResetIdleTimer();
    }
  }

  function toggleAlwaysShowControls() {
    setAlwaysShowControls((current) => {
      const next = !current;
      if (next) {
        setControlsVisible(true);
        clearHideControlsTimer();
      } else {
        scheduleHideControls();
      }
      return next;
    });
  }

  function toggleRememberViewerSettings() {
    setRememberViewerSettings((current) => !current);
  }

  useEffect(() => {
    scheduleHideControls();
    return () => {
      clearHideControlsTimer();
      clearPopoverCloseTimer();
      clearCopyFeedbackTimer();
      releaseCapturedPointers();
    };
  }, []);

  useLayoutEffect(() => {
    logViewerSessionDiagnostic("viewer-session-key", {
      activeImageKey,
      currentIndex,
      openRequestId,
      path,
    });
    logViewerSessionDiagnostic("viewer-session-reset", {
      activeImageKey,
      currentIndex,
      openRequestId,
      path,
    });
    setCurrentIndex(initialIndex);
    setImageFailed(false);
    releasePointerState();
    resetTransform();
    setNaturalSize(null);
    setFileActionFeedback(null);
    fileActionPendingRef.current = null;
    setPendingFileAction(null);
    syncViewportSizeNow();
    closePopovers();
    setControlsVisible(true);
    scheduleHideControls();
  }, [initialIndex, normalizedImagesKey, openRequestId, viewerEpoch]);

  useEffect(() => {
    setFileActionFeedback(null);
    fileActionPendingRef.current = null;
    setPendingFileAction(null);
  }, [actionSourcePath]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const viewportElement = viewport;

    function syncViewportSize() {
      const rect = viewportElement.getBoundingClientRect();
      setViewportSize({
        width: Math.max(1, Math.round(rect.width || VIEWPORT_FALLBACK.width)),
        height: Math.max(1, Math.round(rect.height || VIEWPORT_FALLBACK.height)),
      });
    }

    syncViewportSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncViewportSize);
      return () => window.removeEventListener("resize", syncViewportSize);
    }

    const observer = new ResizeObserver(syncViewportSize);
    observer.observe(viewportElement);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const dock = bottomDockRef.current;
    const controlPanel = controlPanelRef.current;

    if (!dock || !controlPanel) {
      return;
    }

    function syncDockMeasurements() {
      const dockRect = dock?.getBoundingClientRect();
      const controlRect = controlPanel?.getBoundingClientRect();
      setDockWidth(Math.max(1, Math.round(dockRect?.width || VIEWPORT_FALLBACK.width)));
      setControlPanelWidth(Math.max(1, Math.round(controlRect?.width || 0)));
    }

    syncDockMeasurements();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncDockMeasurements);
      return () => window.removeEventListener("resize", syncDockMeasurements);
    }

    const observer = new ResizeObserver(syncDockMeasurements);
    observer.observe(dock);
    observer.observe(controlPanel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPan((currentPan) => clampPan(currentPan, panBounds));
  }, [panBounds.x, panBounds.y]);

  useEffect(() => {
    if (isFitMode) {
      resetPan();
    }
  }, [activeNaturalSize?.width, activeNaturalSize?.height, fitMode, isFitMode]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      showControlsAndResetIdleTimer();

      if (event.key === "Escape") {
        if (anyPopoverOpen) {
          closePopovers();
          return;
        }

        closeViewer();
        return;
      }

      if (event.key === "F11") {
        event.preventDefault();
        void toggleFullWindow();
        return;
      }

      if (event.key === "ArrowLeft") {
        goToIndex(currentIndex - 1);
        return;
      }

      if (event.key === "ArrowRight") {
        goToIndex(currentIndex + 1);
        return;
      }

      if (event.key === "+" || event.key === "=") {
        zoomIn();
        return;
      }

      if (event.key === "-") {
        zoomOut();
        return;
      }

      if (event.key === "0" || event.key.toLocaleLowerCase() === "f") {
        setFit();
        return;
      }

      if (event.key === "1") {
        setActualSize();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeNaturalSize,
    currentIndex,
    effectiveScale,
    fitScale,
    fitMode,
    isFitMode,
    isFullWindow,
    moreMenuOpen,
    viewerControlsMenuOpen,
    normalizedImages.length,
    onClose,
    panBounds,
    shortcutsOpen,
    viewportSize,
    zoom,
    zoomMenuOpen,
    rotationMenuOpen,
    fileInfoOpen,
    anyPopoverOpen,
  ]);

  useEffect(() => {
    if (alwaysShowControls) {
      setControlsVisible(true);
      clearHideControlsTimer();
    }
  }, [alwaysShowControls]);

  useEffect(() => {
    if (!rememberViewerSettings) {
      clearStoredViewerSettings();
      return;
    }

    if (skipNextSettingsStoreRef.current) {
      skipNextSettingsStoreRef.current = false;
      return;
    }

    storeViewerSettings({
      alwaysShowControls,
      fitMode,
      isFitMode,
      rememberViewerSettings,
      rotation,
      zoom,
    });
  }, [alwaysShowControls, fitMode, isFitMode, rememberViewerSettings, rotation, zoom]);

  useEffect(() => {
    function syncFullscreenState() {
      setIsFullWindow(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal={isSeparateWindow ? undefined : "true"}
      aria-label={ariaLabel}
      ref={viewerRef}
      tabIndex={-1}
      className="global-image-viewer fixed inset-0 z-50 m-0 h-screen w-screen overflow-hidden bg-slate-950 text-[var(--viewer-panel-text)]"
      onMouseMove={showControlsAndResetIdleTimer}
      onMouseEnter={showControlsAndResetIdleTimer}
      onPointerDown={showControlsAndResetIdleTimer}
      onFocusCapture={showControlsAndResetIdleTimer}
      data-separate-window={isSeparateWindow ? "true" : "false"}
      data-theme-surface="adaptive"
    >
      <div className="viewer-scrim-top absolute inset-x-0 top-0 h-28" />
      <div className="viewer-scrim-bottom absolute inset-x-0 bottom-0 h-36" />

      <div
        aria-label="Image metadata"
        data-layout-zone="viewer-metadata"
        className={`pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-6rem)] min-w-0 items-center gap-2 rounded-xl px-3 py-2 transition-opacity duration-300 sm:left-5 sm:top-5 sm:max-w-[calc(100%-16rem)] sm:gap-3 sm:px-4 sm:py-3 ${glassPanelClass} ${controlsVisibilityClass}`}
      >
        <span className="shrink-0 text-sm font-semibold">
          {currentIndex + 1} / {normalizedImages.length}
        </span>
        <span className="viewer-divider h-5 w-px shrink-0" />
        <span className="min-w-0 max-w-[42vw] truncate text-sm font-medium">
          {displayName}
        </span>
        {resolution && (
          <>
            <span className="viewer-divider hidden h-5 w-px shrink-0 sm:block" />
            <span className="viewer-muted hidden shrink-0 text-sm sm:inline">{resolution}</span>
          </>
        )}
      </div>

      <div
        aria-label="Image viewer actions"
        data-layout-zone="viewer-actions"
        className={`absolute right-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-xl p-1.5 transition-opacity duration-300 sm:right-5 sm:top-5 sm:gap-2 sm:p-2 ${glassPanelClass} ${controlsVisibilityClass}`}
      >
        <button
          type="button"
          aria-label="Show image viewer shortcuts"
          aria-expanded={shortcutsOpen}
          onClick={() => shortcutsOpen ? closePopovers() : openPopover("shortcuts")}
          className={`${glassButtonClass} size-10 sm:size-11`}
        >
          <HelpCircle size={19} />
        </button>
        <span
          aria-label="Image aspect ratio"
          className="viewer-button inline-flex h-10 items-center justify-center rounded-xl px-3 text-sm font-semibold sm:h-11 sm:px-4"
        >
          {aspectRatioLabel}
        </span>
        {onOpenFolder && (
          <button
            type="button"
            aria-label="Open image folder"
            onClick={() => onOpenFolder(path)}
            className={`${glassButtonClass} size-10 sm:size-11`}
          >
            <FolderOpen size={19} />
          </button>
        )}
        <button
          type="button"
          aria-label="More image actions"
          aria-expanded={moreMenuOpen}
          onClick={() => moreMenuOpen ? closePopovers() : openPopover("more")}
          className={`${glassButtonClass} size-10 sm:size-11`}
        >
          <MoreVertical size={19} />
        </button>
      </div>

      {shortcutsOpen && (
        <div
          aria-label="Image viewer shortcuts"
          data-layout-zone="viewer-shortcuts"
          className={`absolute right-3 top-16 z-40 w-[min(18rem,calc(100%-1.5rem))] rounded-xl p-4 transition-opacity duration-300 sm:right-5 sm:top-20 ${glassPanelClass}`}
          onPointerEnter={clearPopoverCloseTimer}
          onPointerLeave={schedulePopoverClose}
          onFocus={clearPopoverCloseTimer}
          onBlur={schedulePopoverClose}
        >
          <h2 className="text-sm font-semibold">Shortcuts</h2>
          <dl className="viewer-muted mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
            <dt className="font-semibold text-[var(--viewer-panel-text)]">Esc</dt>
            <dd>Close viewer</dd>
            <dt className="font-semibold text-[var(--viewer-panel-text)]">Left / Right</dt>
            <dd>Navigate images</dd>
            <dt className="font-semibold text-[var(--viewer-panel-text)]">+ / -</dt>
            <dd>Zoom in or out</dd>
            <dt className="font-semibold text-[var(--viewer-panel-text)]">0 / F</dt>
            <dd>Fit to window</dd>
            <dt className="font-semibold text-[var(--viewer-panel-text)]">1</dt>
            <dd>Show at 100%</dd>
            <dt className="font-semibold text-[var(--viewer-panel-text)]">F11</dt>
            <dd>Toggle full-window mode</dd>
            <dt className="font-semibold text-[var(--viewer-panel-text)]">Wheel</dt>
            <dd>Zoom around pointer</dd>
            <dt className="font-semibold text-[var(--viewer-panel-text)]">Drag</dt>
            <dd>Pan when zoomed</dd>
          </dl>
        </div>
      )}

      {moreMenuOpen && (
        <div
          role="menu"
          aria-label="More image actions menu"
          className={`absolute right-3 top-16 z-40 w-[min(18rem,calc(100%-1.5rem))] rounded-xl p-2 transition-opacity duration-300 sm:right-5 sm:top-20 ${glassPanelClass}`}
          onPointerEnter={clearPopoverCloseTimer}
          onPointerLeave={schedulePopoverClose}
          onFocus={clearPopoverCloseTimer}
          onBlur={schedulePopoverClose}
        >
          <button
            role="menuitem"
            type="button"
            disabled={!hasActionSourcePath || pendingFileAction !== null}
            onClick={() => void saveCurrentImageAs()}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-sakura-50 disabled:opacity-45"
          >
            <span>{pendingFileAction === "save" ? "Saving..." : "Save As"}</span>
            {fileActionFeedback === "Source file saved" && (
              <span className="text-xs font-semibold text-sakura-600 transition-opacity duration-200">Saved</span>
            )}
          </button>
          {/* Disabled because the current runtime only exposes safe text clipboard here. */}
          <button role="menuitem" type="button" disabled className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold opacity-45">
            Copy Image
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={!path || !canCopyText}
            onClick={() => void copyText(path, "Path")}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-sakura-50 disabled:opacity-45"
          >
            <span>Copy Image Path</span>
            {copyFeedback === "Path copied" && (
              <span className="text-xs font-semibold text-sakura-600 transition-opacity duration-200">Copied</span>
            )}
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={!displayName || !canCopyText}
            onClick={() => void copyText(displayName, "File name")}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-sakura-50 disabled:opacity-45"
          >
            <span>Copy File Name</span>
            {copyFeedback === "File name copied" && (
              <span className="text-xs font-semibold text-sakura-600 transition-opacity duration-200">Copied</span>
            )}
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={!hasActionSourcePath || pendingFileAction !== null}
            onClick={() => void openCurrentImageFolder()}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-sakura-50 disabled:opacity-45"
          >
            <span>{pendingFileAction === "folder" ? "Opening..." : "Open Folder"}</span>
          </button>
          {fileActionFeedback && (
            <p className="px-3 py-1 text-xs font-semibold text-slate-500">
              {fileActionFeedback}
            </p>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={() => openPopover("fileInfo")}
            className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-sakura-50"
          >
            File Info
          </button>
          <div className="my-1 h-px bg-[var(--viewer-divider)]" />
          <button
            role="menuitemcheckbox"
            type="button"
            aria-checked={alwaysShowControls}
            onClick={toggleAlwaysShowControls}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-sakura-50"
          >
            <span>Always Show Controls</span>
            <span className={`relative h-5 w-9 rounded-full transition ${alwaysShowControls ? "bg-sakura-500" : "bg-slate-300"}`} data-testid="always-show-controls-switch">
              <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition ${alwaysShowControls ? "left-4" : "left-0.5"}`} />
            </span>
          </button>
          <button
            role="menuitemcheckbox"
            type="button"
            aria-checked={rememberViewerSettings}
            onClick={toggleRememberViewerSettings}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-sakura-50"
          >
            <span>Remember Viewer Settings</span>
            <span className={`relative h-5 w-9 rounded-full transition ${rememberViewerSettings ? "bg-sakura-500" : "bg-slate-300"}`} data-testid="remember-viewer-settings-switch">
              <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition ${rememberViewerSettings ? "left-4" : "left-0.5"}`} />
            </span>
          </button>
        </div>
      )}

      {fileInfoOpen && (
        <div
          aria-label="Image file info"
          className={`absolute right-3 top-16 z-40 w-[min(22rem,calc(100%-1.5rem))] rounded-xl p-4 transition-opacity duration-300 sm:right-5 sm:top-20 ${glassPanelClass}`}
          onPointerEnter={clearPopoverCloseTimer}
          onPointerLeave={schedulePopoverClose}
          onFocus={clearPopoverCloseTimer}
          onBlur={schedulePopoverClose}
        >
          <h2 className="text-sm font-semibold">File Info</h2>
          <dl className="viewer-muted mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
            <dt className="font-semibold text-[var(--viewer-panel-text)]">Name</dt>
            <dd className="min-w-0 break-all">{displayName}</dd>
            <dt className="font-semibold text-[var(--viewer-panel-text)]">File Type</dt>
            <dd>{fileType}</dd>
            <dt className="font-semibold text-[var(--viewer-panel-text)]">Dimension</dt>
            <dd>{resolution ? `${resolution} (${aspectRatioLabel})` : `N/A (${aspectRatioLabel})`}</dd>
            <dt className="font-semibold text-[var(--viewer-panel-text)]">Size</dt>
            <dd>N/A</dd>
            <dt className="font-semibold text-[var(--viewer-panel-text)]">Date Taken</dt>
            <dd>N/A</dd>
            <dt className="font-semibold text-[var(--viewer-panel-text)]">Path</dt>
            <dd className="min-w-0 truncate" title={path || "N/A"}>{path || "N/A"}</dd>
          </dl>
        </div>
      )}

      {!isFitMode && (
        <div className={`absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-medium transition-opacity duration-300 sm:top-[12%] ${glassPanelClass} ${controlsVisibilityClass}`}>
          {zoomLabel}
          {isPannable ? " - Drag to pan" : ""}
        </div>
      )}

      {canGoPrevious && (
        <button
          type="button"
          aria-label="Previous gallery image"
          onClick={() => goToIndex(currentIndex - 1)}
          data-layout-zone="viewer-side-nav"
          className={`absolute left-3 top-1/2 z-20 size-11 -translate-y-1/2 transition-opacity duration-300 sm:left-5 sm:size-14 ${glassButtonClass} ${controlsVisibilityClass}`}
        >
          <ArrowLeft size={26} />
        </button>
      )}

      {canGoNext && (
        <button
          type="button"
          aria-label="Next gallery image"
          onClick={() => goToIndex(currentIndex + 1)}
          data-layout-zone="viewer-side-nav"
          className={`absolute right-3 top-1/2 z-20 size-11 -translate-y-1/2 transition-opacity duration-300 sm:right-5 sm:size-14 ${glassButtonClass} ${controlsVisibilityClass}`}
        >
          <ArrowRight size={26} />
        </button>
      )}

      <div
        ref={viewportRef}
        className="absolute inset-0 h-full w-full overflow-hidden"
        onWheel={handleWheel}
      >
        <div className="flex h-full w-full items-center justify-center">
          {canShowImage && assetSrc ? (
            <div
              ref={panSurfaceRef}
              aria-label="Image pan surface"
              className={dragState ? "cursor-grabbing touch-none" : isPannable ? "cursor-grab touch-none" : "cursor-default"}
              data-pan-x={Math.round(pan.x)}
              data-pan-y={Math.round(pan.y)}
              data-pannable={isPannable ? "true" : "false"}
              onDoubleClick={handleDoubleClick}
              onPointerDown={handleImagePointerDown}
              onPointerMove={handleImagePointerMove}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg)`,
              }}
            >
              <img
                key={activeImageKey}
                data-viewer-image-key={activeImageKey}
                src={assetSrc}
                alt={`Gallery image ${currentIndex + 1} full size`}
                draggable={false}
                className="block max-w-none select-none"
                style={
                  activeNaturalSize
                    ? {
                        height: `${activeNaturalSize.height * effectiveScale}px`,
                        width: `${activeNaturalSize.width * effectiveScale}px`,
                      }
                    : {
                        maxHeight: isFitMode ? "100vh" : "none",
                        maxWidth: isFitMode ? "100vw" : "none",
                        width: isFitMode ? "auto" : `${zoom * 100}%`,
                      }
                }
                onError={() => setImageFailed(true)}
                onLoad={handleImageLoad}
              />
            </div>
          ) : (
            <div
              role="img"
              aria-label={`Gallery image ${currentIndex + 1} unavailable`}
              className="flex min-h-52 min-w-64 flex-col items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 px-8 py-10 text-center text-slate-300"
            >
              <ImageIcon size={42} />
              <p className="text-sm font-semibold">Image unavailable</p>
            </div>
          )}
        </div>
      </div>

      <div
        ref={bottomDockRef}
        aria-label="Image viewer bottom dock"
        data-layout-zone="viewer-bottom-dock"
        data-dock-mode={bottomDockMode}
        className={`viewer-bottom-dock ${controlsVisibilityClass}`}
        onPointerEnter={clearHideControlsTimer}
        onPointerLeave={scheduleHideControls}
      >
        <div className="viewer-bottom-dock-inner">
          {dockMinimapVisible && activeNaturalSize && assetSrc && viewportRect && (
            <div
              aria-label="Image position overview"
              data-layout-zone="viewer-minimap"
              className={`viewer-minimap-slot ${glassPanelClass}`}
            >
              <div
                ref={minimapRef}
                role="slider"
                aria-label="Image minimap navigator"
                aria-valuetext={`Viewport ${Math.round(viewportRect.x)} ${Math.round(viewportRect.y)}`}
                tabIndex={0}
                className="relative overflow-hidden rounded-lg bg-slate-900/90"
                onPointerDown={(event) => {
                  setMinimapDragging(true);
                  clearHideControlsTimer();
                  minimapPointerIdRef.current = event.pointerId;
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  handleMinimapPointer(event);
                }}
                onPointerMove={(event) => {
                  if (event.buttons === 1) {
                    handleMinimapPointer(event);
                  }
                }}
                onPointerUp={stopMinimapDrag}
                onPointerCancel={stopMinimapDrag}
                style={{
                  height: `${minimapSize.height}px`,
                  width: `${minimapSize.width}px`,
                }}
              >
                <img src={assetSrc} alt="" className="h-full w-full object-contain opacity-80" />
                <div
                  className="absolute rounded-sm border border-sakura-300 bg-sakura-100/20 shadow-[0_0_0_1px_rgba(15,23,42,0.65)]"
                  data-testid="image-minimap-viewport"
                  style={{
                    height: `${viewportRect.height}%`,
                    left: `${viewportRect.x}%`,
                    top: `${viewportRect.y}%`,
                    width: `${viewportRect.width}%`,
                  }}
                />
              </div>
            </div>
          )}
        <div
          ref={controlPanelRef}
          aria-label="Image viewer controls"
          data-layout-zone="viewer-controls"
          className={`viewer-control-panel ${glassPanelClass}`}
          data-control-panel="content-sized"
        >
          <div
            className="viewer-control-strip"
            data-control-strip="inline-or-stacked"
          >
            <button
              type="button"
              aria-label={`Cycle gallery image fit mode: ${fitModeLabel}`}
              title={`Current fit mode: ${fitModeLabel}`}
              onClick={cycleFitMode}
              data-control-group="fit-mode"
              data-control-slot="fit"
              className={`viewer-command-fit inline-flex size-10 items-center justify-center rounded-lg text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 ${
                isFitMode ? activePillClass : inactivePillClass
              }`}
            >
              {fitMode === "width" ? (
                <ArrowLeftRight size={17} aria-hidden="true" />
              ) : fitMode === "height" ? (
                <ArrowUpDown size={17} aria-hidden="true" />
              ) : (
                <ImageIcon size={17} aria-hidden="true" />
              )}
            </button>
            <div
              className="relative"
              data-control-group="zoom-command"
              data-control-slot="zoom"
            >
              <button
                type="button"
                onClick={() => zoomMenuOpen ? closePopovers() : openPopover("zoom")}
                aria-expanded={zoomMenuOpen}
                aria-label="Open gallery image zoom controls"
                className={`viewer-command-compact ${pillButtonClass} ${inactivePillClass} gap-2`}
              >
                <ZoomIn size={16} aria-hidden="true" />
                <span className="viewer-command-zoom-value">{zoomControlLabel}</span>
              </button>
              <div
                aria-label="Gallery image zoom control"
                className="viewer-command-wide viewer-inline-control"
              >
                <button
                  type="button"
                  onClick={() => zoomOut()}
                  disabled={!isFitMode && zoom <= MIN_GALLERY_ZOOM}
                  aria-label="Zoom out gallery image"
                  className="viewer-button inline-flex size-9 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300"
                >
                  <ZoomOut size={16} />
                </button>
                <label className="viewer-inline-slider">
                  <span aria-label="Image zoom value" className="min-w-12 text-center text-xs font-semibold">{zoomControlLabel}</span>
                  <input
                    aria-label="Set gallery image zoom percentage"
                    type="range"
                    min={MIN_GALLERY_ZOOM}
                    max={MAX_GALLERY_ZOOM}
                    step={GALLERY_ZOOM_STEP}
                    value={zoomControlSliderValue}
                    onChange={(event) => applyZoom(Number(event.currentTarget.value))}
                    onPointerDown={clearHideControlsTimer}
                    onPointerUp={scheduleHideControls}
                    className="viewer-range w-28 accent-sakura-400"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => zoomIn()}
                  disabled={!isFitMode && zoom >= MAX_GALLERY_ZOOM}
                  aria-label="Zoom in gallery image"
                  className="viewer-button inline-flex size-9 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300"
                >
                  <ZoomIn size={16} />
                </button>
              </div>
              {zoomMenuOpen && (
                <div
                  role="menu"
                  aria-label="Gallery image zoom controls"
                  className={`viewer-command-popover bottom-12 left-1/2 -translate-x-1/2 ${glassPanelClass}`}
                  onPointerEnter={clearPopoverCloseTimer}
                  onPointerLeave={schedulePopoverClose}
                  onFocus={clearPopoverCloseTimer}
                  onBlur={schedulePopoverClose}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => zoomOut()}
                      disabled={!isFitMode && zoom <= MIN_GALLERY_ZOOM}
                      aria-label="Zoom out gallery image"
                      className="viewer-button inline-flex size-9 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300"
                    >
                      <ZoomOut size={16} />
                    </button>
                    <label className="flex items-center gap-2 text-xs font-semibold">
                      <span aria-label="Image zoom value" className="min-w-12 text-center">{zoomControlLabel}</span>
                      <input
                        aria-label="Set gallery image zoom percentage"
                        type="range"
                        min={MIN_GALLERY_ZOOM}
                        max={MAX_GALLERY_ZOOM}
                        step={GALLERY_ZOOM_STEP}
                        value={zoomControlSliderValue}
                        onChange={(event) => applyZoom(Number(event.currentTarget.value))}
                        onPointerDown={clearHideControlsTimer}
                        onPointerUp={scheduleHideControls}
                        className="viewer-range w-32 accent-sakura-400"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => zoomIn()}
                      disabled={!isFitMode && zoom >= MAX_GALLERY_ZOOM}
                      aria-label="Zoom in gallery image"
                      className="viewer-button inline-flex size-9 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300"
                    >
                      <ZoomIn size={16} />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    {ZOOM_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        role="menuitem"
                        onClick={() => setZoomPreset(preset)}
                        className="rounded-lg px-2 py-1.5 text-center text-xs font-semibold transition hover:bg-sakura-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300"
                      >
                        {Math.round(preset * 100)}%
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div
              className="relative"
              data-control-group="rotation-command"
              data-control-slot="rotation"
            >
              <button
                type="button"
                onClick={() => rotationMenuOpen ? closePopovers() : openPopover("rotation")}
                aria-expanded={rotationMenuOpen}
                aria-label="Open gallery image rotation controls"
                className={`viewer-command-compact ${pillButtonClass} ${inactivePillClass} gap-2`}
              >
                <RotateCwSquare size={16} aria-hidden="true" />
                <span className="viewer-command-rotation-value">{rotation}°</span>
              </button>
              <div
                aria-label="Gallery image rotation control"
                className="viewer-command-wide viewer-inline-control"
              >
                <button
                  type="button"
                  onClick={() => rotateBy(-15)}
                  aria-label="Rotate gallery image left"
                  className="viewer-button inline-flex size-9 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300"
                >
                  <RotateCcwSquare size={16} />
                </button>
                <label className="viewer-inline-slider">
                  <span aria-label="Image rotation value" className="min-w-10 text-center text-xs font-semibold">{rotation}°</span>
                  <input
                    aria-label="Set image rotation degrees"
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={rotation}
                    onChange={(event) => setRotationDegrees(Number(event.currentTarget.value))}
                    onPointerDown={clearHideControlsTimer}
                    onPointerUp={scheduleHideControls}
                    className="viewer-range w-28 accent-sakura-400"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => rotateBy(15)}
                  aria-label="Rotate gallery image right"
                  className="viewer-button inline-flex size-9 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300"
                >
                  <RotateCwSquare size={16} />
                </button>
              </div>
              {rotationMenuOpen && (
                <div
                  role="menu"
                  aria-label="Gallery image rotation controls"
                  className={`viewer-command-popover bottom-12 left-1/2 -translate-x-1/2 ${glassPanelClass}`}
                  onPointerEnter={clearPopoverCloseTimer}
                  onPointerLeave={schedulePopoverClose}
                  onFocus={clearPopoverCloseTimer}
                  onBlur={schedulePopoverClose}
                >
                  <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => rotateBy(-15)}
                    aria-label="Rotate gallery image left"
                    className="viewer-button inline-flex size-9 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300"
                  >
                    <RotateCcwSquare size={16} />
                  </button>
                  <label className="flex items-center gap-2 text-xs font-semibold">
                    <span aria-label="Image rotation value" className="min-w-10 text-center">{rotation}°</span>
                    <input
                      aria-label="Set image rotation degrees"
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      value={rotation}
                      onChange={(event) => setRotationDegrees(Number(event.currentTarget.value))}
                      onPointerDown={clearHideControlsTimer}
                      onPointerUp={scheduleHideControls}
                      className="viewer-range w-32 accent-sakura-400"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => rotateBy(15)}
                    aria-label="Rotate gallery image right"
                    className="viewer-button inline-flex size-9 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300"
                  >
                    <RotateCwSquare size={16} />
                  </button>
                </div>
              </div>
            )}
            </div>
            <button
              type="button"
              onClick={() => void toggleFullWindow()}
              data-control-group="window-mode"
              data-control-slot="window"
              aria-label={
                isFullWindow
                  ? "Exit full-window gallery mode"
                  : "Enter full-window gallery mode"
              }
              className={`viewer-command-medium ${glassButtonClass} size-10`}
            >
              {isFullWindow ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button
              type="button"
              onClick={resetView}
              aria-label="Reset gallery image view"
              data-control-group="view-reset"
              data-control-slot="reset"
              className={`viewer-command-medium ${glassButtonClass} size-10`}
            >
              <RotateCcw size={17} />
            </button>
            <div className="relative viewer-command-bottom-more">
              <button
                type="button"
                aria-label="More viewer controls"
                aria-expanded={viewerControlsMenuOpen}
                onClick={() => viewerControlsMenuOpen ? closePopovers() : openPopover("viewerControls")}
                data-control-group="viewer-more"
                data-control-slot="more"
                className={`${glassButtonClass} size-10`}
              >
                <MoreVertical size={17} />
              </button>
              {viewerControlsMenuOpen && (
                <div
                  role="menu"
                  aria-label="More viewer controls menu"
                  className={`viewer-command-popover bottom-12 right-0 ${glassPanelClass}`}
                  onPointerEnter={clearPopoverCloseTimer}
                  onPointerLeave={schedulePopoverClose}
                  onFocus={clearPopoverCloseTimer}
                  onBlur={schedulePopoverClose}
                >
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      resetView();
                      closePopovers();
                    }}
                    className="viewer-menu-medium-item w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-sakura-50"
                  >
                    Reset View
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      void toggleFullWindow();
                      closePopovers();
                    }}
                    className="viewer-menu-medium-item w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-sakura-50"
                  >
                    {isFullWindow ? "Exit Full Window" : "Full Window"}
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      cycleFitMode();
                      closePopovers();
                    }}
                    className="viewer-menu-very-small-item w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-sakura-50"
                  >
                    {fitModeLabel}
                  </button>
                  <div className="viewer-menu-very-small-item px-3 py-2">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Rotation
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => rotateBy(-15)}
                        aria-label="Rotate gallery image left"
                        className="viewer-button inline-flex size-9 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300"
                      >
                        <RotateCcwSquare size={16} />
                      </button>
                      <span
                        aria-label="Image rotation value"
                        className="min-w-10 text-center text-sm font-semibold"
                      >
                        {rotation}°
                      </span>
                      <button
                        type="button"
                        onClick={() => rotateBy(15)}
                        aria-label="Rotate gallery image right"
                        className="viewer-button inline-flex size-9 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300"
                      >
                        <RotateCwSquare size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function fileNameFromPath(path: string) {
  const normalized = path.trim().replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function parseResolution(value: string | undefined): Size | null {
  if (!value) {
    return null;
  }

  const match = /(\d+)\s*[xX×]\s*(\d+)/.exec(value);
  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  return width > 0 && height > 0 ? { width, height } : null;
}

function getFitScale(naturalSize: Size | null, viewportSize: Size, fitMode: FitMode) {
  if (!naturalSize) {
    return 1;
  }

  if (fitMode === "width") {
    return viewportSize.width / naturalSize.width;
  }

  if (fitMode === "height") {
    return viewportSize.height / naturalSize.height;
  }

  return Math.min(
    viewportSize.width / naturalSize.width,
    viewportSize.height / naturalSize.height,
  );
}

function getImageSize(naturalSize: Size, scale: number) {
  return {
    width: naturalSize.width * scale,
    height: naturalSize.height * scale,
  };
}

function getPanBounds(imageSize: Size | null, viewportSize: Size) {
  if (!imageSize) {
    return { x: 0, y: 0 };
  }

  return {
    x: Math.max(0, (imageSize.width - viewportSize.width) / 2),
    y: Math.max(0, (imageSize.height - viewportSize.height) / 2),
  };
}

function clampPan(point: Point, bounds: Point) {
  return {
    x: clamp(point.x, -bounds.x, bounds.x),
    y: clamp(point.y, -bounds.y, bounds.y),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRotation(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = ((((Math.round(value) + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function getMinimapSize(naturalSize: Size | null, viewportSize: Size) {
  if (!naturalSize) {
    return { width: 144, height: 144 };
  }

  const maxWidth = clamp(viewportSize.width * 0.18, 132, 236);
  const maxHeight = clamp(viewportSize.height * 0.22, 96, 180);
  const scale = Math.min(maxWidth / naturalSize.width, maxHeight / naturalSize.height);

  return {
    width: Math.max(88, Math.round(naturalSize.width * scale)),
    height: Math.max(72, Math.round(naturalSize.height * scale)),
  };
}

type BottomDockMode = "compact" | "controls-only" | "inline" | "stacked";

function getBottomDockMode({
  controlPanelWidth,
  dockWidth,
  minimapVisible,
  minimapWidth,
}: {
  controlPanelWidth: number;
  dockWidth: number;
  minimapVisible: boolean;
  minimapWidth: number;
}): BottomDockMode {
  if (!minimapVisible) {
    return "controls-only";
  }

  const safeGap = 28;
  const measuredControlWidth = controlPanelWidth || 620;

  if (dockWidth < Math.max(560, minimapWidth + safeGap * 2)) {
    return "compact";
  }

  if (measuredControlWidth + minimapWidth + safeGap <= dockWidth) {
    return "inline";
  }

  return "stacked";
}

type StoredViewerSettings = {
  alwaysShowControls: boolean;
  fitMode: FitMode;
  isFitMode: boolean;
  rememberViewerSettings: boolean;
  rotation: number;
  zoom: number;
};

function defaultViewerSettings(): StoredViewerSettings {
  return {
    alwaysShowControls: false,
    fitMode: "window",
    isFitMode: true,
    rememberViewerSettings: false,
    rotation: 0,
    zoom: 1,
  };
}

function readStoredViewerSettings(): StoredViewerSettings {
  const fallback = defaultViewerSettings();

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const rawSettings = window.localStorage.getItem(VIEWER_SETTINGS_STORAGE_KEY);
    if (!rawSettings) {
      return fallback;
    }

    const parsed = JSON.parse(rawSettings) as Partial<StoredViewerSettings>;
    const remembered = parsed.rememberViewerSettings === true;
    return {
      alwaysShowControls: remembered && parsed.alwaysShowControls === true,
      fitMode:
        remembered && isFitModeValue(parsed.fitMode) ? parsed.fitMode : "window",
      isFitMode: remembered ? parsed.isFitMode !== false : true,
      rememberViewerSettings: remembered,
      rotation: remembered ? normalizeRotation(Number(parsed.rotation ?? 0)) : 0,
      zoom: remembered ? parseStoredZoom(parsed.zoom) : 1,
    };
  } catch {
    return fallback;
  }
}

function storeViewerSettings(settings: StoredViewerSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    VIEWER_SETTINGS_STORAGE_KEY,
    JSON.stringify(settings),
  );
}

function clearStoredViewerSettings() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(VIEWER_SETTINGS_STORAGE_KEY);
}

function isFitModeValue(value: unknown): value is FitMode {
  return value === "window" || value === "width" || value === "height";
}

function parseStoredZoom(value: unknown) {
  const zoom = Number(value ?? 1);
  return Number.isFinite(zoom)
    ? clamp(zoom, MIN_GALLERY_ZOOM, MAX_GALLERY_ZOOM)
    : 1;
}

function getFileType(value: string) {
  const filename = fileNameFromPath(value);
  const extension = filename.includes(".")
    ? filename.split(".").pop()?.trim().toUpperCase()
    : "";

  return extension ? `${extension} image` : "N/A";
}

function roundedAspectRatio(width: number, height: number) {
  const commonRatios = [
    [1, 1],
    [4, 3],
    [3, 2],
    [16, 9],
    [2, 3],
    [3, 4],
    [9, 16],
  ];
  const actual = width / height;
  const closeRatio = commonRatios.find(
    ([ratioWidth, ratioHeight]) =>
      Math.abs(actual - ratioWidth / ratioHeight) / (ratioWidth / ratioHeight) <
      0.04,
  );

  if (closeRatio) {
    return `${closeRatio[0]}:${closeRatio[1]}`;
  }

  const divisor = gcd(width, height);
  const ratioWidth = Math.round(width / divisor);
  const ratioHeight = Math.round(height / divisor);

  if (ratioWidth <= 99 && ratioHeight <= 99) {
    return `${ratioWidth}:${ratioHeight}`;
  }

  return `${Math.round(actual)}:1`;
}

function gcd(first: number, second: number): number {
  let a = Math.abs(first);
  let b = Math.abs(second);

  while (b) {
    const next = b;
    b = a % b;
    a = next;
  }

  return a || 1;
}

function getMinimapViewportRect(
  naturalSize: Size | null,
  imageSize: Size | null,
  viewportSize: Size,
  pan: Point,
) {
  if (!naturalSize || !imageSize) {
    return null;
  }

  const visibleWidth = Math.min(viewportSize.width, imageSize.width);
  const visibleHeight = Math.min(viewportSize.height, imageSize.height);
  const hiddenWidth = Math.max(0, imageSize.width - viewportSize.width);
  const hiddenHeight = Math.max(0, imageSize.height - viewportSize.height);
  const leftPx = hiddenWidth === 0 ? 0 : hiddenWidth / 2 - pan.x;
  const topPx = hiddenHeight === 0 ? 0 : hiddenHeight / 2 - pan.y;

  return {
    x: clamp((leftPx / imageSize.width) * 100, 0, 100),
    y: clamp((topPx / imageSize.height) * 100, 0, 100),
    width: clamp((visibleWidth / imageSize.width) * 100, 4, 100),
    height: clamp((visibleHeight / imageSize.height) * 100, 4, 100),
  };
}

function minimapPointToPan(
  normalized: Point,
  naturalSize: Size,
  imageSize: Size,
  viewportSize: Size,
) {
  const hiddenWidth = Math.max(0, imageSize.width - viewportSize.width);
  const hiddenHeight = Math.max(0, imageSize.height - viewportSize.height);
  const targetImagePoint = {
    x: normalized.x * naturalSize.width,
    y: normalized.y * naturalSize.height,
  };
  const scale = imageSize.width / naturalSize.width;

  return {
    x: hiddenWidth / 2 - targetImagePoint.x * scale + viewportSize.width / 2,
    y: hiddenHeight / 2 - targetImagePoint.y * scale + viewportSize.height / 2,
  };
}

function logViewerSessionDiagnostic(
  step: string,
  details: Record<string, unknown>,
) {
  const meta = import.meta as ImportMeta & { env?: { MODE?: string } };
  if (meta.env?.MODE === "production" || meta.env?.MODE === "test") {
    return;
  }

  console.info(`[GlobalImageViewer] ${step}`, details);
}

export { roundedAspectRatio };
export default GlobalImageViewer;
