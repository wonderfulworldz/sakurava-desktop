import { MonitorPlay } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../../lib/LanguageContext";

/** Visual-only prototype state. It deliberately has no persistence seam. */
export default function BuiltInVideoPlayerPrototypeControl() {
  const t = useTranslation();
  const [enabled, setEnabled] = useState(true);

  return <div className="flex max-w-md items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
    <div className="flex min-w-0 items-center gap-2.5"><span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-sakura-50 text-sakura-600 dark:bg-sakura-950/40"><MonitorPlay size={16} aria-hidden="true" /></span><div className="min-w-0"><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t("videoPlayer.preference.title")}</p><p className="text-xs text-slate-500">{t("videoPlayer.preference.prototypeHelper")}</p></div></div>
    <button type="button" aria-label={t("videoPlayer.preference.title")} aria-pressed={enabled} onClick={() => setEnabled((value) => !value)} className={`inline-flex h-8 min-w-14 shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-bold transition focus:outline-none focus:ring-4 focus:ring-sakura-100 ${enabled ? "bg-sakura-500 text-white" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200"}`}>{enabled ? t("videoPlayer.preference.on") : t("videoPlayer.preference.off")}</button>
  </div>;
}
