import { useEffect, useState } from "react";

import { useTranslation } from "../lib/LanguageContext";
import {
  getManagedMediaStatistics,
  type ManagedMediaStatistics as Statistics,
} from "../runtime/managedMediaStatistics";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";

type StatisticsState =
  | { state: "loading" }
  | { state: "ready"; statistics: Statistics }
  | { state: "error" };

export function managedMediaOverallStatus(statistics: Statistics): string {
  if (statistics.pendingCount > 0) return "processing";
  if (statistics.sourceCount === 0 && statistics.readyCount === 0) return "empty";
  if (statistics.sourceCount > 0 && statistics.readyCount === statistics.sourceCount) {
    return "upToDate";
  }
  return "notUpToDate";
}

export function formatManagedMediaStorage(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function ManagedMediaStatistics() {
  const t = useTranslation();
  const [status, setStatus] = useState<StatisticsState>({ state: "loading" });

  const refresh = async () => {
    setStatus({ state: "loading" });
    try {
      setStatus({ state: "ready", statistics: await getManagedMediaStatistics() });
    } catch {
      setStatus({ state: "error" });
    }
  };

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) {
      setStatus({ state: "error" });
      return;
    }
    void refresh();
  }, []);

  if (status.state === "loading") {
    return <p role="status" className="text-sm font-medium text-slate-500">{t("settings.managedMedia.statistics.loading")}</p>;
  }

  if (status.state === "error") {
    return (
      <div className="grid gap-2">
        <p role="alert" className="text-sm font-medium text-rose-600">{t("settings.managedMedia.statistics.unavailable")}</p>
        <button type="button" onClick={() => void refresh()} className="inline-flex h-8 w-fit items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600">
          {t("settings.managedMedia.statistics.refresh")}
        </button>
      </div>
    );
  }

  const { statistics } = status;
  return (
    <div className="grid gap-2">
      <dl className="grid gap-1 text-sm text-slate-600">
        <div className="flex flex-wrap justify-between gap-x-4"><dt>{t("settings.managedMedia.statistics.sources")}</dt><dd className="font-semibold text-slate-900">{statistics.sourceCount}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-4"><dt>{t("settings.managedMedia.statistics.storage")}</dt><dd className="font-semibold text-slate-900">{formatManagedMediaStorage(statistics.publishedStorageBytes)}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-4"><dt>{t("settings.managedMedia.statistics.pending")}</dt><dd className="font-semibold text-slate-900">{statistics.pendingCount}</dd></div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-sm font-semibold text-slate-600">
          {t(`settings.managedMedia.statistics.status.${managedMediaOverallStatus(statistics)}`)}
        </p>
        <button type="button" onClick={() => void refresh()} className="inline-flex h-8 w-fit items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600">
          {t("settings.managedMedia.statistics.refresh")}
        </button>
      </div>
    </div>
  );
}
