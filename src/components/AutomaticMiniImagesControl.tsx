import { useEffect, useState } from "react";

import {
  AUTOMATIC_MINI_IMAGES_STATE_EVENT,
  getAutomaticMiniImagesEnabled,
  setAutomaticMiniImagesEnabled,
} from "../lib/automaticMiniImagesState";
import { useTranslation } from "../lib/LanguageContext";
import { synchronizeAutomaticMiniImagesPolicy } from "../runtime/managedMediaAutomatic";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";

type SynchronizationState = "syncing" | "ready" | "error";

export default function AutomaticMiniImagesControl() {
  const t = useTranslation();
  const [enabled, setEnabled] = useState(() => getAutomaticMiniImagesEnabled());
  const [state, setState] = useState<SynchronizationState>("syncing");

  useEffect(() => {
    const update = (event: Event) => setEnabled((event as CustomEvent<boolean>).detail);
    window.addEventListener(AUTOMATIC_MINI_IMAGES_STATE_EVENT, update);
    return () => window.removeEventListener(AUTOMATIC_MINI_IMAGES_STATE_EVENT, update);
  }, []);

  useEffect(() => {
    let active = true;
    const synchronize = async () => {
      if (!isTauriRuntimeAvailable()) {
        if (active) setState("error");
        return;
      }
      if (active) setState("syncing");
      try {
        await synchronizeAutomaticMiniImagesPolicy(getAutomaticMiniImagesEnabled());
        if (active) setState("ready");
      } catch {
        if (active) setState("error");
      }
    };
    void synchronize();
    return () => { active = false; };
  }, []);

  const update = async (next: boolean) => {
    if (state === "syncing") return;
    setState("syncing");
    if (!setAutomaticMiniImagesEnabled(next)) {
      setState("error");
      return;
    }
    setEnabled(next);
    try {
      await synchronizeAutomaticMiniImagesPolicy(next);
      setState("ready");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="grid gap-2">
      <button type="button" role="switch" aria-checked={enabled} aria-label={t("settings.managedMedia.automatic.enabled")} disabled={state === "syncing"} onClick={() => void update(!enabled)} className={`relative h-6 w-11 rounded-full ${enabled ? "bg-sakura-500" : "bg-slate-300"} disabled:opacity-70`}>
        <span className={`absolute top-1 size-4 rounded-full bg-white shadow-sm ${enabled ? "left-6" : "left-1"}`} />
      </button>
      <p className="text-xs font-medium text-slate-500">{t("settings.managedMedia.automatic.helper")}</p>
      {state === "syncing" ? <p role="status" className="text-xs font-medium text-slate-500">{t("settings.managedMedia.automatic.syncing")}</p> : null}
      {state === "error" ? <p role="alert" className="text-xs font-medium text-rose-600">{t("settings.managedMedia.automatic.error")}</p> : null}
    </div>
  );
}
