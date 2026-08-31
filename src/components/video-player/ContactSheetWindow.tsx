import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "../../lib/LanguageContext";
import { isTauriRuntimeAvailable } from "../../runtime/tauriClient";
import { localImagePathToAssetSrc } from "../../runtime/localAsset";
import {
  cancelContactSheet,
  cleanupContactSheet,
  generateContactSheet,
  saveContactSheet,
  type ContactSheetFormat,
  type ContactSheetGenerationResult,
  type ContactSheetGrid,
} from "../../runtime/contactSheetCommands";
import { selectContactSheetDestination } from "../../runtime/dialogCommands";
import {
  closeCurrentAuxiliaryWindow,
  listenForContactSheetPayload,
  readStoredContactSheetPayload,
  type ContactSheetWindowPayload,
} from "../../runtime/videoPlayerWindows";

const fallbackPayload: ContactSheetWindowPayload = {
  displayName: "Video",
  resolution: "N/A",
  durationLabel: "N/A",
  requestId: "contact-sheet-fallback",
  sourceIdentity: "",
};

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
  const [grid, setGrid] = useState<ContactSheetGrid>(4);
  const [width, setWidth] = useState(1600);
  const [quality, setQuality] = useState(90);
  const [timestamp, setTimestamp] = useState(true);
  const [header, setHeader] = useState(false);
  const [format, setFormat] = useState<ContactSheetFormat>("jpeg");
  const [generation, setGeneration] = useState<ContactSheetGenerationResult | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "ready" | "saving" | "error">("idle");
  const [feedback, setFeedback] = useState("");
  const previewRef = useRef<string | null>(null);
  const generatingRef = useRef(false);
  const nativeCloseInProgressRef = useRef(false);
  previewRef.current = generation?.previewPath ?? null;

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) return;
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void appWindow.onCloseRequested(async (event) => {
      if (nativeCloseInProgressRef.current) return;
      event.preventDefault();
      nativeCloseInProgressRef.current = true;
      await cancelContactSheet(null).catch(() => undefined);
      await cleanupContactSheet(previewRef.current).catch(() => undefined);
      try {
        await appWindow.destroy();
      } catch {
        nativeCloseInProgressRef.current = false;
      }
    }).then((nextUnlisten) => {
      if (disposed) nextUnlisten();
      else unlisten = nextUnlisten;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const generate = useCallback(async () => {
    if (!payload.sourceIdentity || generatingRef.current) return;
    generatingRef.current = true;
    setStatus("generating");
    setFeedback("");
    const previous = previewRef.current;
    try {
      if (previous) await cleanupContactSheet(previous);
      setGeneration(null);
      const result = await generateContactSheet({
        sourceIdentity: payload.sourceIdentity,
        grid,
        width,
        quality,
        timestamp,
        header,
        format,
      });
      setGeneration(result);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      generatingRef.current = false;
    }
  }, [format, grid, header, payload.sourceIdentity, quality, timestamp, width]);

  useEffect(() => {
    if (!isTauriRuntimeAvailable() || !payload.sourceIdentity) return;
    let started = false;
    const timer = window.setTimeout(() => {
      started = true;
      void generate();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (started) {
        void cancelContactSheet(null);
        void cleanupContactSheet(previewRef.current);
      }
    };
    // A new payload owns one initial real preview. Changed options are applied
    // only by the explicit Generate Preview action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.requestId]);

  async function handleSave() {
    if (!generation || status === "saving") return;
    setStatus("saving");
    setFeedback("");
    try {
      const destination = await selectContactSheetDestination(
        defaultContactSheetFileName(payload.displayName, format),
        format,
      );
      if (!destination) {
        setStatus("ready");
        return;
      }
      await saveContactSheet(generation.previewPath, destination);
      setStatus("ready");
      setFeedback(t("contactSheet.saved"));
    } catch (error) {
      await cleanupContactSheet(generation.previewPath).catch(() => undefined);
      setGeneration(null);
      setStatus("error");
      setFeedback(error instanceof Error ? error.message : t("contactSheet.saveFailed"));
    }
  }

  async function handleCancel() {
    await cancelContactSheet(null).catch(() => undefined);
    await cleanupContactSheet(previewRef.current).catch(() => undefined);
    await closeCurrentAuxiliaryWindow();
  }

  const previewSrc = localImagePathToAssetSrc(generation?.previewPath);

  return (
    <main aria-label={t("contactSheet.windowLabel")} className="flex h-screen min-h-0 flex-col bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50" data-auxiliary-window="contact-sheet" data-theme-source="sakurava-appearance">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{t("contactSheet.title")}</h1>
        <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{payload.displayName} · {payload.resolution} · {payload.durationLabel}</p>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 overflow-auto p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section aria-label={t("contactSheet.preview")} className="flex min-h-80 min-w-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {previewSrc ? <img src={previewSrc} alt={`${grid} × ${grid} ${t("contactSheet.preview")}`} className="max-h-full max-w-full rounded-md object-contain" data-testid="contact-sheet-real-preview" /> : status === "generating" ? <p role="status" className="text-sm font-semibold text-slate-500">{t("contactSheet.generating")}</p> : <p role="alert" className="text-sm font-semibold text-rose-600">{feedback || t("contactSheet.generateFailed")}</p>}
        </section>

        <section aria-label={t("contactSheet.settings")} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div><span className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">{t("contactSheet.grid")}</span><div className="grid grid-cols-3 gap-1">{([3, 4, 5] as ContactSheetGrid[]).map((value) => <button key={value} type="button" aria-pressed={grid === value} onClick={() => setGrid(value)} className={`h-9 rounded-lg border text-xs font-semibold ${grid === value ? "border-sakura-400 bg-sakura-50 text-sakura-700" : "border-slate-200 text-slate-600"}`}>{value}×{value}</button>)}</div></div>
          <NumberControl label={t("contactSheet.width")} value={width} min={640} max={3840} suffix="px" onChange={setWidth} />
          {format === "jpeg" ? <NumberControl label={t("contactSheet.quality")} value={quality} min={1} max={100} suffix="%" onChange={setQuality} /> : null}
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200"><span className="mb-1 block">{t("contactSheet.format")}</span><select aria-label={t("contactSheet.format")} value={format} onChange={(event) => setFormat(event.target.value as ContactSheetFormat)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><option value="jpeg">JPEG</option><option value="png">PNG</option></select></label>
          <Toggle label={t("contactSheet.timestamp")} value={timestamp} onChange={() => setTimestamp((value) => !value)} />
          <Toggle label={t("contactSheet.header")} value={header} onChange={() => setHeader((value) => !value)} />
          <button type="button" disabled={status === "generating" || status === "saving"} onClick={() => void generate()} className="h-9 w-full rounded-lg border border-sakura-300 bg-sakura-50 px-3 text-xs font-semibold text-sakura-700 disabled:opacity-50">{status === "generating" ? t("contactSheet.generating") : t("contactSheet.generate")}</button>
          {generation ? <p className="text-xs font-medium text-slate-500" data-testid="contact-sheet-frame-count">{generation.frameCount} real frames · {generation.width}×{generation.height}</p> : null}
        </section>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-900"><p role="status" className={`text-xs font-semibold ${status === "error" ? "text-rose-600" : "text-slate-500 dark:text-slate-400"}`}>{feedback}</p><div className="flex gap-2"><button type="button" onClick={() => void handleCancel()} className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">{t("common.cancel")}</button><button type="button" disabled={!generation || status === "generating" || status === "saving"} onClick={() => void handleSave()} className="h-9 rounded-lg bg-sakura-500 px-3 text-sm font-semibold text-white hover:bg-sakura-600 disabled:bg-slate-300">{t("contactSheet.saveAs")}</button></div></footer>
    </main>
  );
}

function defaultContactSheetFileName(displayName: string, format: ContactSheetFormat) {
  const safe = displayName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "Video";
  return `Sakurava Contact Sheet - ${safe}.${format === "jpeg" ? "jpg" : "png"}`;
}

function NumberControl({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200"><span className="mb-1 block">{label}</span><div className="flex items-center gap-2"><input aria-label={label} type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sakura-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />{suffix && <span className="text-slate-500 dark:text-slate-400">{suffix}</span>}</div></label>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return <button type="button" aria-label={label} aria-pressed={value} onClick={onChange} className="flex h-9 w-full items-center justify-between rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"><span>{label}</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${value ? "bg-sakura-500 text-white" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200"}`}>{value ? "ON" : "OFF"}</span></button>;
}
