import { RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "../../lib/LanguageContext";
import {
  VIDEO_PLAYER_SUBTITLE_DEFAULTS,
  type VideoPlayerSubtitlePreferences,
} from "../../lib/videoPlayerPreferences";

export default function SubtitleSettingsDialog({
  value,
  delay,
  onChange,
  onDelayChange,
  onClose,
}: {
  value: VideoPlayerSubtitlePreferences;
  delay: number;
  onChange: (value: VideoPlayerSubtitlePreferences) => void;
  onDelayChange: (seconds: number) => void;
  onClose: () => void;
}) {
  const t = useTranslation();
  const update = <K extends keyof VideoPlayerSubtitlePreferences>(
    key: K,
    next: VideoPlayerSubtitlePreferences[K],
  ) => onChange({ ...value, [key]: next });
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-label={t("videoPlayer.subtitleAppearance.title")} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("videoPlayer.subtitleAppearance.title")}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("videoPlayer.subtitleAppearance.assNote")}</p>
          </div>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700"><X size={17} /></button>
        </header>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label={t("videoPlayer.subtitleAppearance.fontFamily")}>
            <input value={value.fontFamily} onChange={(event) => update("fontFamily", event.target.value)} className="h-9 w-full rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700" />
          </Field>
          <Field label={t("videoPlayer.subtitleAppearance.fontSize")}>
            <input type="number" min="12" max="96" value={value.fontSize} onChange={(event) => update("fontSize", Number(event.target.value))} className="h-9 w-full rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700" />
          </Field>
          <ColorField label={t("videoPlayer.subtitleAppearance.textColor")} color={value.textColor} opacity={value.textOpacity} onColor={(next) => update("textColor", next)} onOpacity={(next) => update("textOpacity", next)} />
          <ColorField label={t("videoPlayer.subtitleAppearance.backgroundColor")} color={value.backgroundColor} opacity={value.backgroundOpacity} onColor={(next) => update("backgroundColor", next)} onOpacity={(next) => update("backgroundOpacity", next)} />
          <Field label={t("videoPlayer.subtitleAppearance.position")}>
            <select value={value.basePosition} onChange={(event) => update("basePosition", event.target.value as VideoPlayerSubtitlePreferences["basePosition"])} className="h-9 w-full rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700">
              <option value="bottom">{t("videoPlayer.subtitleAppearance.bottom")}</option>
              <option value="middle">{t("videoPlayer.subtitleAppearance.middle")}</option>
              <option value="top">{t("videoPlayer.subtitleAppearance.top")}</option>
            </select>
          </Field>
          <Field label={t("videoPlayer.subtitleAppearance.edgeStyle")}>
            <select value={value.edgeStyle} onChange={(event) => update("edgeStyle", event.target.value as VideoPlayerSubtitlePreferences["edgeStyle"])} className="h-9 w-full rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700">
              <option value="outline">{t("videoPlayer.subtitleAppearance.outline")}</option>
              <option value="shadow">{t("videoPlayer.subtitleAppearance.shadow")}</option>
              <option value="none">{t("videoPlayer.subtitleAppearance.none")}</option>
            </select>
          </Field>
          <Field label={`${t("videoPlayer.subtitleAppearance.verticalAdjustment")} (${value.verticalAdjustment})`}>
            <input type="range" min="-100" max="100" value={value.verticalAdjustment} onChange={(event) => update("verticalAdjustment", Number(event.target.value))} className="w-full accent-sakura-500" />
          </Field>
          <Field label={`${t("videoPlayer.subtitleAppearance.delay")} (${delay.toFixed(1)}s)`}>
            <div className="flex items-center gap-2">
              <input type="range" min="-10" max="10" step="0.1" value={delay} onChange={(event) => onDelayChange(Number(event.target.value))} className="min-w-0 flex-1 accent-sakura-500" />
              <button type="button" onClick={() => onDelayChange(0)} className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold dark:border-slate-700">0</button>
            </div>
          </Field>
        </div>
        <footer className="mt-5 flex justify-between gap-2">
          <button type="button" onClick={() => { onChange(VIDEO_PLAYER_SUBTITLE_DEFAULTS); onDelayChange(0); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold dark:border-slate-700"><RotateCcw size={15} />{t("videoPlayer.subtitleAppearance.reset")}</button>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-sakura-500 px-4 text-sm font-semibold text-white">{t("common.done")}</button>
        </footer>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"><span>{label}</span>{children}</label>;
}

function ColorField({ label, color, opacity, onColor, onOpacity }: { label: string; color: string; opacity: number; onColor: (value: string) => void; onOpacity: (value: number) => void }) {
  return <Field label={`${label} (${Math.round(opacity * 100)}%)`}><div className="flex items-center gap-2"><input type="color" value={color} onChange={(event) => onColor(event.target.value.toUpperCase())} className="h-9 w-14 rounded border border-slate-300 bg-transparent p-1 dark:border-slate-700" /><input type="range" min="0" max="1" step="0.05" value={opacity} onChange={(event) => onOpacity(Number(event.target.value))} className="min-w-0 flex-1 accent-sakura-500" /></div></Field>;
}
