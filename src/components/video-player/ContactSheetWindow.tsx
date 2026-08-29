import { useEffect, useState } from "react";
import { useTranslation } from "../../lib/LanguageContext";
import { isTauriRuntimeAvailable } from "../../runtime/tauriClient";
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

export function ContactSheetContent({
  payload,
}: {
  payload: ContactSheetWindowPayload;
}) {
  const t = useTranslation();
  const [columns, setColumns] = useState(4);
  const [rows, setRows] = useState(4);
  const [width, setWidth] = useState(1600);
  const [quality, setQuality] = useState(90);
  const [timestamp, setTimestamp] = useState(true);
  const [header, setHeader] = useState(true);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const total = columns * rows;

  return (
    <main
      aria-label={t("contactSheet.windowLabel")}
      className="flex h-screen min-h-0 flex-col bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50"
      data-auxiliary-window="contact-sheet"
      data-theme-source="sakurava-appearance"
    >
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          {t("contactSheet.title")}
        </h1>
        <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
          {payload.displayName} · {payload.resolution} · {payload.durationLabel}
        </p>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 overflow-auto p-5 lg:grid-cols-[minmax(0,1fr)_240px]">
        <section
          aria-label={t("contactSheet.preview")}
          className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {header && (
            <div className="mb-3 border-b border-slate-200 pb-2 dark:border-slate-700">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                {payload.displayName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {payload.resolution} · {payload.durationLabel}
              </p>
            </div>
          )}
          <div
            data-testid="contact-sheet-grid"
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: total }, (_, index) => (
              <div
                key={index}
                className="relative aspect-video overflow-hidden rounded-md bg-gradient-to-br from-slate-700 via-slate-800 to-sakura-950"
              >
                <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(135deg,transparent_45%,rgba(255,255,255,.35)_50%,transparent_55%)]" />
                {timestamp && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1 py-0.5 font-mono text-[9px] text-white">
                    {formatTime(245 + index * 460)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section
          aria-label={t("contactSheet.settings")}
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <NumberControl label={t("contactSheet.columns")} value={columns} min={1} max={8} onChange={setColumns} />
          <NumberControl label={t("contactSheet.rows")} value={rows} min={1} max={8} onChange={setRows} />
          <NumberControl label={t("contactSheet.width")} value={width} min={640} max={3840} suffix="px" onChange={setWidth} />
          <NumberControl label={t("contactSheet.quality")} value={quality} min={1} max={100} suffix="%" onChange={setQuality} />
          <Toggle label={t("contactSheet.timestamp")} value={timestamp} onChange={() => setTimestamp((value) => !value)} />
          <Toggle label={t("contactSheet.header")} value={header} onChange={() => setHeader((value) => !value)} />
        </section>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-900">
        <p role="status" className="text-xs text-slate-500 dark:text-slate-400">
          {saveFeedback ? t("contactSheet.saveMock") : ""}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void closeCurrentAuxiliaryWindow()}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => setSaveFeedback(true)}
            className="h-9 rounded-lg bg-sakura-500 px-3 text-sm font-semibold text-white hover:bg-sakura-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400"
          >
            {t("contactSheet.saveAs")}
          </button>
        </div>
      </footer>
    </main>
  );
}

function NumberControl({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200"><span className="mb-1 block">{label}</span><div className="flex items-center gap-2"><input aria-label={label} type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sakura-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />{suffix && <span className="text-slate-500 dark:text-slate-400">{suffix}</span>}</div></label>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return <button type="button" aria-label={label} aria-pressed={value} onClick={onChange} className="flex h-9 w-full items-center justify-between rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"><span>{label}</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${value ? "bg-sakura-500 text-white" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200"}`}>{value ? "ON" : "OFF"}</span></button>;
}

function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
