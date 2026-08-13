import { useState } from "react";
import { useTranslation } from "../lib/LanguageContext";
import { regenerateMissingOrOutdatedManagedMedia } from "../runtime/managedMediaRegeneration";

type RegenerationStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

export default function ManagedMediaRegenerateAction() {
  const t = useTranslation();
  const [status, setStatus] = useState<RegenerationStatus>({ state: "idle" });

  async function handleRegenerate() {
    if (status.state === "pending") {
      return;
    }
    setStatus({ state: "pending" });
    try {
      const result = await regenerateMissingOrOutdatedManagedMedia();
      setStatus(
        result.queuedCount > 0
          ? {
              state: "success",
              message: t("settings.managedMedia.queued", {
                count: String(result.queuedCount),
              }),
            }
          : { state: "success", message: t("settings.managedMedia.upToDate") },
      );
    } catch (error) {
      setStatus({
        state: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : t("settings.managedMedia.error"),
      });
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        aria-label={t("settings.managedMedia.regenerate")}
        disabled={status.state === "pending"}
        onClick={handleRegenerate}
        className="inline-flex h-8 min-w-52 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600 disabled:bg-slate-50 disabled:text-slate-400"
      >
        {status.state === "pending"
          ? t("settings.managedMedia.regenerating")
          : t("settings.managedMedia.regenerate")}
      </button>
      {status.state !== "idle" ? (
        <p
          role={status.state === "error" ? "alert" : "status"}
          className={`border-t border-slate-200 px-4 py-3 text-sm font-semibold ${
            status.state === "error" ? "text-rose-600" : "text-slate-600"
          }`}
        >
          {status.state === "pending"
            ? t("settings.managedMedia.regenerating")
            : status.message}
        </p>
      ) : null}
    </div>
  );
}
