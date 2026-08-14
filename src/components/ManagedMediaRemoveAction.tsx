import { useEffect, useState } from "react";

import {
  AUTOMATIC_MINI_IMAGES_STATE_EVENT,
  getAutomaticMiniImagesEnabled,
} from "../lib/automaticMiniImagesState";
import { useTranslation } from "../lib/LanguageContext";
import {
  executeManagedMediaRemoval,
  previewManagedMediaRemoval,
  type ManagedMediaRemovalPreview,
  type ManagedMediaRemovalResult,
} from "../runtime/managedMediaRemoval";
import ConfirmDialog from "./ConfirmDialog";

type Status =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "preview"; preview: ManagedMediaRemovalPreview }
  | { state: "executing"; preview: ManagedMediaRemovalPreview }
  | { state: "result"; result: ManagedMediaRemovalResult }
  | { state: "error"; message: string };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export default function ManagedMediaRemoveAction() {
  const t = useTranslation();
  const [automaticEnabled, setAutomaticEnabled] = useState(() =>
    getAutomaticMiniImagesEnabled(),
  );
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  useEffect(() => {
    const update = (event: Event) =>
      setAutomaticEnabled((event as CustomEvent<boolean>).detail);
    window.addEventListener(AUTOMATIC_MINI_IMAGES_STATE_EVENT, update);
    return () => window.removeEventListener(AUTOMATIC_MINI_IMAGES_STATE_EVENT, update);
  }, []);

  async function loadPreview() {
    setConfirmationOpen(false);
    setStatus({ state: "loading" });
    try {
      setStatus({ state: "preview", preview: await previewManagedMediaRemoval() });
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : t("settings.managedMedia.remove.error"),
      });
    }
  }

  async function confirmRemoval() {
    if (status.state !== "preview") return;
    const preview = status.preview;
    setStatus({ state: "executing", preview });
    try {
      const result = await executeManagedMediaRemoval(preview.previewToken);
      setConfirmationOpen(false);
      setStatus({ state: "result", result });
    } catch (error) {
      setConfirmationOpen(false);
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : t("settings.managedMedia.remove.error"),
      });
    }
  }

  const preview =
    status.state === "preview" || status.state === "executing" ? status.preview : null;
  const automaticOff =
    !automaticEnabled && preview?.automaticPolicyState === "off";
  const canRemove = Boolean(
    preview &&
      automaticOff &&
      preview.removableSourceSlotCount > 0 &&
      status.state === "preview",
  );

  return (
    <div className="grid max-w-xl gap-3">
      <button
        type="button"
        onClick={() => void loadPreview()}
        disabled={status.state === "loading" || status.state === "executing"}
        className="h-9 w-fit rounded-lg border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
      >
        {status.state === "loading"
          ? t("settings.managedMedia.remove.loading")
          : t("settings.managedMedia.remove.action")}
      </button>

      {preview ? (
        <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">
            {t("settings.managedMedia.remove.previewTitle")}
          </p>
          <p>{t("settings.managedMedia.remove.previewRemovable", {
            sources: String(preview.removableSourceSlotCount),
            variants: String(preview.removablePhysicalVariantCount),
            size: formatBytes(preview.recordedRemovableBytes),
          })}</p>
          <p>{t("settings.managedMedia.remove.previewProtected", {
            sources: String(preview.protectedOriginalUnavailableSourceCount),
            variants: String(preview.protectedOriginalUnavailableVariantCount),
          })}</p>
          <p>{t("settings.managedMedia.remove.previewMissing", {
            count: String(preview.alreadyMissingManagedFileCount),
          })}</p>
          <p>{t("settings.managedMedia.remove.previewConflicts", {
            lifecycle: String(preview.conflictingNonterminalLifecycleWorkCount),
            recovery: String(preview.unresolvedRecoveryPublicationConflictCount),
          })}</p>
          <p className="font-medium text-slate-700">
            {t("settings.managedMedia.remove.originalsSafe")}
          </p>
          <p>{t("settings.managedMedia.remove.protectedWarning")}</p>
          <p>{t("settings.managedMedia.remove.regenerationWarning")}</p>
          <p>{t("settings.managedMedia.remove.backupWarning")}</p>
          {!automaticOff ? (
            <p role="alert" className="font-semibold text-amber-700">
              {t("settings.managedMedia.remove.automaticOffRequired")}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!canRemove}
            onClick={() => setConfirmationOpen(true)}
            className="mt-1 h-9 w-fit rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white disabled:bg-rose-300"
          >
            {t("settings.managedMedia.remove.confirmOpen")}
          </button>
        </div>
      ) : null}

      {status.state === "result" ? (
        <div role={status.result.failedSourceSlotCount > 0 || status.result.stale ? "alert" : "status"} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {status.result.stale
            ? t("settings.managedMedia.remove.stale")
            : t("settings.managedMedia.remove.summary", {
                removed: String(status.result.removedVariantCount),
                skipped: String(status.result.skippedSourceSlotCount),
                failed: String(status.result.failedVariantCount),
                size: formatBytes(status.result.reclaimedBytes),
              })}
        </div>
      ) : null}
      {status.state === "error" ? <p role="alert" className="text-xs font-medium text-rose-600">{status.message}</p> : null}

      <ConfirmDialog
        open={confirmationOpen}
        title={t("settings.managedMedia.remove.confirmTitle")}
        description={
          <div className="grid gap-2">
            <p>{t("settings.managedMedia.remove.confirmBody")}</p>
            <p className="font-semibold text-slate-800">
              {t("settings.managedMedia.remove.originalsSafe")}
            </p>
            <p>{t("settings.managedMedia.remove.protectedWarning")}</p>
          </div>
        }
        confirmLabel={t("settings.managedMedia.remove.confirmAction")}
        pendingLabel={t("settings.managedMedia.remove.removing")}
        variant="destructive"
        pending={status.state === "executing"}
        confirmDisabled={!canRemove}
        onCancel={() => setConfirmationOpen(false)}
        onConfirm={() => void confirmRemoval()}
      />
    </div>
  );
}
