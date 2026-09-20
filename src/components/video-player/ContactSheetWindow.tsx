import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "../../lib/LanguageContext";
import {
  loadVideoPlayerPreferences,
  saveVideoPlayerPreferences,
  type VideoPlayerPreferences,
} from "../../lib/videoPlayerPreferences";
import { isTauriRuntimeAvailable } from "../../runtime/tauriClient";
import { localImagePathToAssetSrc } from "../../runtime/localAsset";
import {
  cancelContactSheet,
  cleanupContactSheet,
  generateContactSheet,
  getContactSheetProgress,
  saveContactSheet,
  type ContactSheetFormat,
  type ContactSheetGenerationResult,
} from "../../runtime/contactSheetCommands";
import { selectContactSheetDestination } from "../../runtime/dialogCommands";
import {
  listenForContactSheetPayload,
  readStoredContactSheetPayload,
  type ContactSheetWindowPayload,
} from "../../runtime/videoPlayerWindows";
import {
  PLAYER_AUXILIARY_GLASS_CLASS,
  useTransparentPlayerAuxiliaryDocument,
} from "./PlayerSettingsPanel";

const fallbackPayload: ContactSheetWindowPayload = {
  displayName: "Video",
  resolution: "N/A",
  durationLabel: "N/A",
  requestId: "contact-sheet-fallback",
  sourceIdentity: "",
};

type ContactSheetStatus = "idle" | "generating" | "cancelling" | "ready" | "saving" | "error";

export default function ContactSheetWindow() {
  const [payload, setPayload] = useState(
    () => readStoredContactSheetPayload() ?? fallbackPayload,
  );

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) return;
    let unlisten: (() => void) | undefined;
    void listenForContactSheetPayload(setPayload).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });
    return () => unlisten?.();
  }, []);

  return <ContactSheetContent payload={payload} />;
}

export function ContactSheetContent({ payload }: { payload: ContactSheetWindowPayload }) {
  const t = useTranslation();
  useTransparentPlayerAuxiliaryDocument();
  const [preferences, setPreferences] = useState<VideoPlayerPreferences>(() => loadVideoPlayerPreferences());
  const initial = preferences.contactSheet;
  const [rowsDraft, setRowsDraft] = useState(String(initial.rows));
  const [columnsDraft, setColumnsDraft] = useState(String(initial.columns));
  const [widthDraft, setWidthDraft] = useState(String(initial.width));
  const [quality, setQuality] = useState(initial.quality);
  const [timestamp, setTimestamp] = useState(initial.timestamp);
  const [header, setHeader] = useState(initial.header);
  const [subtitles, setSubtitles] = useState(initial.subtitles);
  const [format, setFormat] = useState<ContactSheetFormat>(initial.format);
  const [generation, setGeneration] = useState<ContactSheetGenerationResult | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [status, setStatus] = useState<ContactSheetStatus>("idle");
  const [feedback, setFeedback] = useState("");
  const previewRef = useRef<string | null>(null);
  const generatingRef = useRef(false);
  const cancellingRef = useRef(false);
  const nativeCloseInProgressRef = useRef(false);
  previewRef.current = generation?.previewPath ?? null;
  const grid = parseGrid(rowsDraft, columnsDraft);
  const outputWidth = parseBoundedInteger(widthDraft, 640, 3840);

  useEffect(() => {
    if (!grid.valid || outputWidth === null) return;
    const next: VideoPlayerPreferences = {
      ...preferences,
      contactSheet: {
        rows: grid.rows,
        columns: grid.columns,
        width: outputWidth,
        quality,
        format,
        timestamp,
        header,
        subtitles,
      },
    };
    setPreferences(next);
    saveVideoPlayerPreferences(next);
    // Persist only the last valid Contact Sheet values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsDraft, format, header, quality, rowsDraft, subtitles, timestamp, widthDraft]);

  useEffect(() => {
    if (status !== "generating" || !isTauriRuntimeAvailable()) return;
    let disposed = false;
    const poll = () => {
      void getContactSheetProgress().then((value) => {
        if (!disposed && value.total > 0) setProgress(value);
      }).catch(() => undefined);
    };
    poll();
    const timer = window.setInterval(poll, 250);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [status]);

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) return;
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void appWindow.onCloseRequested(async (event) => {
      if (nativeCloseInProgressRef.current) return;
      event.preventDefault();
      nativeCloseInProgressRef.current = true;
      cancellingRef.current = true;
      await cancelContactSheet(null).catch(() => undefined);
      await cleanupContactSheet(previewRef.current).catch(() => undefined);
      try { await appWindow.destroy(); } catch { nativeCloseInProgressRef.current = false; }
    }).then((nextUnlisten) => { if (disposed) nextUnlisten(); else unlisten = nextUnlisten; });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  const generate = useCallback(async () => {
    const currentGrid = parseGrid(rowsDraft, columnsDraft);
    const currentWidth = parseBoundedInteger(widthDraft, 640, 3840);
    if (!payload.sourceIdentity || generatingRef.current || !currentGrid.valid || currentWidth === null) return;
    generatingRef.current = true;
    cancellingRef.current = false;
    setStatus("generating");
    setFeedback("");
    setProgress({ completed: 0, total: currentGrid.total });
    const previous = previewRef.current;
    try {
      if (previous) await cleanupContactSheet(previous);
      setGeneration(null);
      const result = await generateContactSheet({
        sourceIdentity: payload.sourceIdentity,
        rows: currentGrid.rows,
        columns: currentGrid.columns,
        width: currentWidth,
        quality,
        timestamp,
        header,
        subtitles,
        subtitleId: payload.subtitleId ?? null,
        subtitlePath: payload.subtitlePath ?? null,
        theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
        format,
      });
      setProgress({ completed: result.frameCount, total: result.frameCount });
      setGeneration(result);
      setStatus("ready");
    } catch (error) {
      const cancelled = cancellingRef.current || isContactSheetCancellation(error);
      setStatus(cancelled ? "idle" : "error");
      setFeedback(cancelled ? t("contactSheet.cancelled") : error instanceof Error ? error.message : String(error));
    } finally {
      generatingRef.current = false;
      cancellingRef.current = false;
    }
  }, [columnsDraft, format, header, payload.sourceIdentity, payload.subtitleId, payload.subtitlePath, quality, rowsDraft, subtitles, t, timestamp, widthDraft]);

  async function handleSave() {
    if (!generation || status === "saving") return;
    setStatus("saving");
    setFeedback("");
    try {
      const destination = await selectContactSheetDestination(defaultContactSheetFileName(payload.displayName, format), format);
      if (!destination) { setStatus("ready"); return; }
      await saveContactSheet(generation.previewPath, destination);
      setStatus("ready");
      setFeedback(t("contactSheet.saved"));
    } catch (error) {
      setStatus("error");
      setFeedback(error instanceof Error ? error.message : t("contactSheet.saveFailed"));
    }
  }

  async function handleCancelGeneration() {
    if (status !== "generating") return;
    cancellingRef.current = true;
    setStatus("cancelling");
    await cancelContactSheet(null).catch(() => undefined);
    await cleanupContactSheet(previewRef.current).catch(() => undefined);
    setGeneration(null);
    setFeedback(t("contactSheet.cancelled"));
  }

  const previewSrc = localImagePathToAssetSrc(generation?.previewPath);
  const busy = status === "generating" || status === "cancelling" || status === "saving";

  return (
    <main aria-label={t("contactSheet.windowLabel")} className={PLAYER_AUXILIARY_GLASS_CLASS} data-auxiliary-window="contact-sheet" data-material="sakurava-true-glass" data-surface-opacity="80" data-theme-source="sakurava-appearance">
      <header className="shrink-0 border-b border-slate-300/90 px-6 py-4 dark:border-slate-600/90">
        <h1 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{t("contactSheet.title")}</h1>
        <p className="mt-1 truncate text-sm font-medium text-slate-600 dark:text-slate-300">{payload.displayName} · {payload.resolution} · {payload.durationLabel}</p>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 overflow-auto p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section aria-label={t("contactSheet.preview")} className="flex min-h-80 min-w-0 items-center justify-center rounded-xl border border-slate-400/75 bg-white/35 p-3 shadow-sm dark:border-slate-500/75 dark:bg-slate-900/35">
          {previewSrc
            ? <img src={previewSrc} alt={`${grid.rows} × ${grid.columns} ${t("contactSheet.preview")}`} className="max-h-full max-w-full rounded-md object-contain" data-testid="contact-sheet-real-preview" />
            : status === "generating" || status === "cancelling"
              ? <div role="status" className="w-full max-w-xs text-center"><p className="text-sm font-semibold text-slate-500">{status === "cancelling" ? t("contactSheet.cancelling") : t("contactSheet.generating")}</p><progress className="mt-3 w-full accent-sakura-500" max={Math.max(1, progress.total)} value={progress.completed} /><p className="mt-1 text-xs text-slate-500">{progress.completed} / {progress.total}</p></div>
              : <p role={status === "error" ? "alert" : "status"} className={`text-sm font-semibold ${status === "error" ? "text-rose-600" : "text-slate-500"}`}>{feedback || t("contactSheet.idle")}</p>}
        </section>

        <section aria-label={t("contactSheet.settings")} className="space-y-3 rounded-xl border border-slate-400/75 bg-white/35 p-4 shadow-sm dark:border-slate-500/75 dark:bg-slate-900/35">
          <div className="grid grid-cols-2 gap-2">
            <RawNumberControl label={t("contactSheet.rows")} value={rowsDraft} min={1} max={8} onChange={setRowsDraft} />
            <RawNumberControl label={t("contactSheet.columns")} value={columnsDraft} min={1} max={24} onChange={setColumnsDraft} />
          </div>
          <p className={`text-xs font-semibold ${grid.valid ? "text-slate-500" : "text-rose-600"}`} data-testid="contact-sheet-total">{grid.valid ? `${grid.total} ${t("contactSheet.thumbnails")}` : t("contactSheet.gridInvalid")}</p>
          <RawNumberControl label={t("contactSheet.width")} value={widthDraft} min={640} max={3840} onChange={setWidthDraft} />
          {outputWidth === null ? <p className="text-xs font-semibold text-rose-600">{t("contactSheet.widthInvalid")}</p> : null}
          {format === "jpeg" ? <NumberControl label={t("contactSheet.quality")} value={quality} min={1} max={100} suffix="%" onChange={setQuality} /> : null}
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200"><span className="mb-1 block">{t("contactSheet.format")}</span><select aria-label={t("contactSheet.format")} value={format} onChange={(event) => setFormat(event.target.value as ContactSheetFormat)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><option value="jpeg">JPEG</option><option value="png">PNG</option></select></label>
          <Toggle label={t("contactSheet.timestamp")} value={timestamp} onChange={() => setTimestamp((value) => !value)} />
          <Toggle label={t("contactSheet.header")} value={header} onChange={() => setHeader((value) => !value)} />
          <Toggle label={t("contactSheet.subtitles")} value={subtitles} onChange={() => setSubtitles((value) => !value)} />
          {status === "generating"
            ? <button type="button" onClick={() => void handleCancelGeneration()} className="h-9 w-full rounded-lg border border-rose-300 bg-rose-50 px-3 text-xs font-semibold text-rose-700">{t("contactSheet.cancelGeneration")}</button>
            : <button type="button" disabled={busy || !grid.valid || outputWidth === null} onClick={() => void generate()} className="h-9 w-full rounded-lg border border-sakura-300 bg-sakura-50 px-3 text-xs font-semibold text-sakura-700 disabled:opacity-50">{t("contactSheet.generate")}</button>}
          {generation ? <p className="text-xs font-medium text-slate-500" data-testid="contact-sheet-frame-count">{generation.frameCount} real frames · {generation.width}×{generation.height}</p> : null}
        </section>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-300/90 px-5 py-3 dark:border-slate-600/90"><p role="status" className={`text-xs font-semibold ${status === "error" ? "text-rose-600" : "text-slate-600 dark:text-slate-300"}`}>{feedback}</p><button type="button" disabled={!generation || busy} onClick={() => void handleSave()} className="h-9 rounded-lg bg-sakura-500 px-3 text-sm font-semibold text-white hover:bg-sakura-600 disabled:bg-slate-300">{t("contactSheet.saveAs")}</button></footer>
    </main>
  );
}

function parseGrid(rowsValue: string, columnsValue: string) {
  const rows = Number(rowsValue);
  const columns = Number(columnsValue);
  const valid = Number.isInteger(rows) && Number.isInteger(columns)
    && rows >= 1 && rows <= 8 && columns >= 1 && columns <= 24
    && rows * columns <= 192;
  return { rows, columns, total: valid ? rows * columns : 0, valid };
}

function parseBoundedInteger(value: string, minimum: number, maximum: number) {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function isContactSheetCancellation(error: unknown) {
  return String(error instanceof Error ? error.message : error).includes("CONTACT_SHEET_CANCELLED");
}

function defaultContactSheetFileName(displayName: string, format: ContactSheetFormat) {
  const safe = displayName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "Video";
  return `Sakurava Contact Sheet - ${safe}.${format === "jpeg" ? "jpg" : "png"}`;
}

function RawNumberControl({ label, value, min, max, onChange }: { label: string; value: string; min: number; max: number; onChange: (value: string) => void }) {
  return <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200"><span className="mb-1 block">{label}</span><input aria-label={label} type="number" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sakura-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" /></label>;
}

function NumberControl({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200"><span className="mb-1 block">{label}</span><div className="flex items-center gap-2"><input aria-label={label} type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sakura-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />{suffix && <span className="text-slate-500 dark:text-slate-400">{suffix}</span>}</div></label>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return <button type="button" aria-label={label} aria-pressed={value} onClick={onChange} className="flex h-9 w-full items-center justify-between rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"><span>{label}</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${value ? "bg-sakura-500 text-white" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200"}`}>{value ? "ON" : "OFF"}</span></button>;
}
