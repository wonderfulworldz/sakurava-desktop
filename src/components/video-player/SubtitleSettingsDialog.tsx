import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "../../lib/LanguageContext";
import {
  VIDEO_PLAYER_SUBTITLE_DEFAULTS,
  type VideoPlayerSubtitlePreferences,
} from "../../lib/videoPlayerPreferences";
import PlayerSettingsPanel from "./PlayerSettingsPanel";

const SUBTITLE_FONT_FAMILIES = [
  "Segoe UI",
  "Arial",
  "Calibri",
  "Tahoma",
  "Verdana",
  "Georgia",
  "Times New Roman",
] as const;

export default function SubtitleSettingsDialog({
  value,
  delay,
  onChange,
  onDelayChange,
  onClose,
  feedback,
}: {
  value: VideoPlayerSubtitlePreferences;
  delay: number;
  onChange: (value: VideoPlayerSubtitlePreferences) => void;
  onDelayChange: (seconds: number) => void;
  onClose: () => void;
  feedback?: string | null;
}) {
  const t = useTranslation();
  const update = <K extends keyof VideoPlayerSubtitlePreferences>(
    key: K,
    next: VideoPlayerSubtitlePreferences[K],
  ) => {
    const updated = { ...value, [key]: next };
    if (key === "fontSize") updated.fontSizeOverride = true;
    if (key === "textColor" || key === "textOpacity") updated.textColorOverride = true;
    if (key === "backgroundColor" || key === "backgroundOpacity") updated.backgroundOverride = true;
    if (key === "edgeStyle") updated.edgeStyleOverride = true;
    onChange(updated);
  };
  const fontFamilies = SUBTITLE_FONT_FAMILIES.includes(value.fontFamily as typeof SUBTITLE_FONT_FAMILIES[number])
    ? SUBTITLE_FONT_FAMILIES
    : [value.fontFamily, ...SUBTITLE_FONT_FAMILIES];
  const verticalAdjustmentEnabled = value.basePosition !== "source";
  return (
    <PlayerSettingsPanel
      title={t("videoPlayer.subtitleAppearance.title")}
      description={t("videoPlayer.subtitleAppearance.assNote")}
      onClose={onClose}
      footer={<div className="flex justify-between gap-2"><button type="button" onClick={() => { onChange(VIDEO_PLAYER_SUBTITLE_DEFAULTS); onDelayChange(0); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold dark:border-slate-700"><RotateCcw size={15} />{t("videoPlayer.subtitleAppearance.reset")}</button><button type="button" onClick={onClose} className="h-9 rounded-lg bg-sakura-500 px-4 text-sm font-semibold text-white">{t("common.done")}</button></div>}
    >
        {feedback ? <p role="alert" className="mb-4 rounded-lg border border-rose-300 bg-rose-50/90 px-3 py-2 text-xs font-semibold text-rose-800 dark:border-rose-700 dark:bg-rose-950/80 dark:text-rose-100">{feedback}</p> : null}
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-2" data-layout="landscape-two-column">
          <Field label={t("videoPlayer.subtitleAppearance.fontFamily")}>
            <select
              value={value.fontFamilyOverride ? value.fontFamily : ""}
              onChange={(event) => onChange({
                ...value,
                fontFamily: event.target.value || VIDEO_PLAYER_SUBTITLE_DEFAULTS.fontFamily,
                fontFamilyOverride: event.target.value !== "",
              })}
              className="h-10 w-full rounded-lg border border-slate-400/80 bg-white/85 px-3 text-sm font-medium text-slate-950 outline-none focus:ring-2 focus:ring-sakura-400 dark:border-slate-500 dark:bg-slate-900/85 dark:text-white"
            >
              <option value="">Source / authored default</option>
              {fontFamilies.map((family) => <option key={family} value={family}>{family}</option>)}
            </select>
          </Field>
          <Field label={t("videoPlayer.subtitleAppearance.fontSize")}>
            <input type="number" min="12" max="96" value={value.fontSize} onChange={(event) => update("fontSize", Number(event.target.value))} className="h-10 w-full rounded-lg border border-slate-400/80 bg-white/85 px-3 text-sm font-medium text-slate-950 outline-none focus:ring-2 focus:ring-sakura-400 dark:border-slate-500 dark:bg-slate-900/85 dark:text-white" />
          </Field>
          <ColorField label={t("videoPlayer.subtitleAppearance.textColor")} color={value.textColor} opacity={value.textOpacity} onColor={(next) => update("textColor", next)} onOpacity={(next) => update("textOpacity", next)} />
          <ColorField label={t("videoPlayer.subtitleAppearance.backgroundColor")} color={value.backgroundColor} opacity={value.backgroundOpacity} onColor={(next) => update("backgroundColor", next)} onOpacity={(next) => update("backgroundOpacity", next)} />
          <Field label={t("videoPlayer.subtitleAppearance.position")}>
            <select value={value.basePosition} onChange={(event) => update("basePosition", event.target.value as VideoPlayerSubtitlePreferences["basePosition"])} className="h-10 w-full rounded-lg border border-slate-400/80 bg-white/85 px-3 text-sm font-medium text-slate-950 outline-none focus:ring-2 focus:ring-sakura-400 dark:border-slate-500 dark:bg-slate-900/85 dark:text-white">
              <option value="source">Source / authored default</option>
              <option value="bottom">{t("videoPlayer.subtitleAppearance.bottom")}</option>
              <option value="middle">{t("videoPlayer.subtitleAppearance.middle")}</option>
              <option value="top">{t("videoPlayer.subtitleAppearance.top")}</option>
            </select>
          </Field>
          <Field label={t("videoPlayer.subtitleAppearance.edgeStyle")}>
            <select value={value.edgeStyle} onChange={(event) => update("edgeStyle", event.target.value as VideoPlayerSubtitlePreferences["edgeStyle"])} className="h-10 w-full rounded-lg border border-slate-400/80 bg-white/85 px-3 text-sm font-medium text-slate-950 outline-none focus:ring-2 focus:ring-sakura-400 dark:border-slate-500 dark:bg-slate-900/85 dark:text-white">
              <option value="outline">{t("videoPlayer.subtitleAppearance.outline")}</option>
              <option value="shadow">{t("videoPlayer.subtitleAppearance.shadow")}</option>
              <option value="none">{t("videoPlayer.subtitleAppearance.none")}</option>
            </select>
          </Field>
          <Field label={`${t("videoPlayer.subtitleAppearance.verticalAdjustment")} (${value.verticalAdjustment})`}>
            <input
              type="range"
              min="-100"
              max="100"
              value={value.verticalAdjustment}
              disabled={!verticalAdjustmentEnabled}
              aria-disabled={!verticalAdjustmentEnabled}
              onChange={(event) => update("verticalAdjustment", Number(event.target.value))}
              className="w-full accent-sakura-500 disabled:cursor-not-allowed disabled:opacity-45"
            />
          </Field>
          <Field label={`${t("videoPlayer.subtitleAppearance.delay")} (${delay.toFixed(1)}s)`}>
            <div className="flex items-center gap-2">
              <input type="range" min="-10" max="10" step="0.1" value={delay} onChange={(event) => onDelayChange(Number(event.target.value))} className="min-w-0 flex-1 accent-sakura-500" />
              <button type="button" onClick={() => onDelayChange(0)} className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold dark:border-slate-700">0</button>
            </div>
          </Field>
        </div>
    </PlayerSettingsPanel>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid content-start gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100"><span>{label}</span>{children}</label>;
}

function ColorField({ label, color, opacity, onColor, onOpacity }: { label: string; color: string; opacity: number; onColor: (value: string) => void; onOpacity: (value: number) => void }) {
  return <Field label={`${label} (${Math.round(opacity * 100)}%)`}><div className="flex items-center gap-2"><input type="color" value={color} onChange={(event) => onColor(event.target.value.toUpperCase())} className="h-9 w-14 rounded border border-slate-300 bg-transparent p-1 dark:border-slate-700" /><input type="range" min="0" max="1" step="0.05" value={opacity} onChange={(event) => onOpacity(Number(event.target.value))} className="min-w-0 flex-1 accent-sakura-500" /></div></Field>;
}
