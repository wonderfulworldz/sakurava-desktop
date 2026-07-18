import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "../lib/LanguageContext";
import type { FormConfig, FormMode } from "../lib/formData";
import { formConfigs } from "../lib/formData";
import {
  buildVideoFormConfig,
  videoFormToCreateInput,
  videoFormToPatch,
} from "../lib/videoIntegration";
import FormPage from "./FormPage";
import { prepareVideoValuesForSave } from "../lib/mediaTechInfo";
import {
  createVideo,
  deleteVideo,
  getVideo,
  isVideoRuntimeAvailable,
  updateVideo,
} from "../runtime/videoCommands";
import type { Credit } from "../backend/types";
import { listCreditsByWork } from "../runtime/creditCommands";
import {
  creditToFormValue,
  reconcileWorkCredits,
} from "../lib/workCredits";

type VideoFormPageProps = {
  mode: FormMode;
};

function VideoFormPage({ mode }: VideoFormPageProps) {
  const t = useTranslation();
  const { itemKey } = useParams();
  const navigate = useNavigate();
  const [config, setConfig] = useState<FormConfig>(formConfigs.videos);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(() =>
    Boolean(mode === "edit" && itemKey && isVideoRuntimeAvailable()),
  );
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [originalCredits, setOriginalCredits] = useState<Credit[]>([]);
  const initialCreditValues = useMemo(
    () => originalCredits.map(creditToFormValue),
    [originalCredits],
  );

  useEffect(() => {
    let cancelled = false;

    if (mode === "create" || !itemKey || !isVideoRuntimeAvailable()) {
      setConfig(formConfigs.videos);
      setMissing(false);
      setLoading(false);
      setOriginalCredits([]);
      return;
    }

    setLoading(true);
    getVideo(itemKey)
      .then(async (video) => {
        const credits = video
          ? await listCreditsByWork("video", video.id).catch(() => [])
          : [];
        return [video, credits] as const;
      })
      .then(([video, credits]) => {
        if (cancelled) {
          return;
        }

        if (!video) {
          setMissing(true);
          setLoading(false);
          return;
        }

        setMissing(false);
        setConfig(buildVideoFormConfig(video, "edit"));
        setOriginalCredits(credits);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setMissing(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [itemKey, mode]);

  async function handleDelete() {
    if (!itemKey || deletePending) {
      return;
    }

    setDeletePending(true);
    setDeleteError(null);

    try {
      const result = await deleteVideo(itemKey);

      if (!result.deleted) {
        setDeleteError("Video delete failed. The saved Sakurava record was not removed.");
        return;
      }

      navigate("/videos", { replace: true });
    } catch {
      setDeleteError("Video delete failed. The saved Sakurava record was not removed.");
    } finally {
      setDeletePending(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          Edit Video
        </h1>
        <p className="mt-3 text-sm text-slate-500">{t("status.loadingVideo")}</p>
      </section>
    );
  }

  if (missing) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          Edit Video
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          This video could not be found.
        </p>
      </section>
    );
  }

  return (
    <FormPage
      config={config}
      mode={mode}
      initialCredits={initialCreditValues}
      deleteAction={
        mode === "edit" && itemKey && isVideoRuntimeAvailable()
          ? {
              itemLabel: String(config.initialValues.edit.title || "this video"),
              isPending: deletePending,
              errorMessage: deleteError,
              onOpen: () => setDeleteError(null),
              onConfirm: handleDelete,
            }
          : undefined
      }
      onSubmit={async ({
        values,
        categories,
        relatedPerformers,
        relatedCatalogRecords,
        sourceLinks,
        credits,
      }) => {
        if (!isVideoRuntimeAvailable()) {
          return {
            state: "saved",
            message: "Browser preview only. Open the Tauri app to save videos.",
          };
        }

        const preparedValues = await prepareVideoValuesForSave(values);

        if (mode === "create") {
          const created = await createVideo(
            videoFormToCreateInput(
              preparedValues,
              categories,
              relatedPerformers,
              relatedCatalogRecords,
              sourceLinks,
            ),
          );
          try {
            await reconcileWorkCredits("video", created.id, [], credits);
          } catch {
            return {
              state: "error",
              message:
                "Video saved, but Related Performers could not be fully saved. Reopen the video and retry.",
            };
          }
          navigate(`/videos/${created.id}`);
          return { state: "saved", message: "Video saved." };
        }

        if (!itemKey) {
          return { state: "error", message: "Video could not be saved." };
        }

        const updated = await updateVideo(
          itemKey,
          videoFormToPatch(
            preparedValues,
            categories,
            relatedPerformers,
            relatedCatalogRecords,
            sourceLinks,
          ),
        );
        if (!updated) {
          return { state: "error", message: "Video could not be found." };
        }

        try {
          await reconcileWorkCredits(
            "video",
            updated.id,
            originalCredits,
            credits,
          );
        } catch {
          return {
            state: "error",
            message:
              "Video saved, but Related Performers could not be fully saved. Reopen the video and retry.",
          };
        }
        navigate(`/videos/${updated.id}`);
        return { state: "saved", message: "Video saved." };
      }}
    />
  );
}

export default VideoFormPage;

