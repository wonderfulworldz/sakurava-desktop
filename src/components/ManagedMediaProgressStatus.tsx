import { useEffect, useState } from "react";

import { useTranslation } from "../lib/LanguageContext";
import {
  getManagedMediaProgressStatus,
  type ManagedMediaProgressStatus as ProgressStatus,
} from "../runtime/managedMediaStatus";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";

export const ACTIVE_PROGRESS_POLL_MS = 2_000;
export const IDLE_PROGRESS_POLL_MS = 15_000;

export function managedMediaProgressPercentage(status: ProgressStatus): number {
  if (status.total <= 0) return 0;
  return Math.round((status.ready / status.total) * 100);
}

export function shouldShowManagedMediaProgress(status: ProgressStatus | null): boolean {
  return Boolean(
    status &&
      status.processing &&
      status.total > 0 &&
      status.ready < status.total,
  );
}

export function ManagedMediaProgressIndicator({ status }: { status: ProgressStatus }) {
  const t = useTranslation();
  if (!shouldShowManagedMediaProgress(status)) return null;
  const percentage = managedMediaProgressPercentage(status);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[70] w-72 max-w-[calc(100vw-3rem)]">
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-sakura-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg"
      >
        <p className="font-medium">
          {t("managedMedia.progress.preparing", {
            ready: String(status.ready),
            total: String(status.total),
            percentage: String(percentage),
          })}
        </p>
        <div
          role="progressbar"
          aria-label={t("managedMedia.progress.label")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-sakura-50"
        >
          <div
            className="h-full rounded-full bg-sakura-500 transition-[width] duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ManagedMediaProgressStatus() {
  const [status, setStatus] = useState<ProgressStatus | null>(null);

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) return;
    let cancelled = false;
    let timeoutId: number | undefined;

    const schedule = (delay: number) => {
      timeoutId = window.setTimeout(() => void refresh(), delay);
    };
    const refresh = async () => {
      let next: ProgressStatus | null = null;
      try {
        next = await getManagedMediaProgressStatus();
        if (!cancelled) setStatus(next);
      } catch {
        if (!cancelled) setStatus(null);
      }
      if (!cancelled) {
        schedule(next?.processing ? ACTIVE_PROGRESS_POLL_MS : IDLE_PROGRESS_POLL_MS);
      }
    };

    void refresh();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  return status ? <ManagedMediaProgressIndicator status={status} /> : null;
}
