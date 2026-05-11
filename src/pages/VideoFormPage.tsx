import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { FormConfig, FormMode } from "../lib/formData";
import { formConfigs } from "../lib/formData";
import {
  buildVideoFormConfig,
  videoFormToCreateInput,
  videoFormToPatch,
} from "../lib/videoIntegration";
import FormPage from "./FormPage";
import {
  createVideo,
  getVideo,
  isVideoRuntimeAvailable,
  updateVideo,
} from "../runtime/videoCommands";

type VideoFormPageProps = {
  mode: FormMode;
};

function VideoFormPage({ mode }: VideoFormPageProps) {
  const { itemKey } = useParams();
  const navigate = useNavigate();
  const [config, setConfig] = useState<FormConfig>(formConfigs.videos);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (mode === "create" || !itemKey || !isVideoRuntimeAvailable()) {
      setConfig(formConfigs.videos);
      setMissing(false);
      return;
    }

    getVideo(itemKey)
      .then((video) => {
        if (cancelled) {
          return;
        }

        if (!video) {
          setMissing(true);
          return;
        }

        setMissing(false);
        setConfig(buildVideoFormConfig(video, "edit"));
      })
      .catch(() => {
        if (!cancelled) {
          setMissing(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [itemKey, mode]);

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
      onSubmit={async ({ values, categories }) => {
        if (!isVideoRuntimeAvailable()) {
          return {
            state: "saved",
            message: "Browser preview only. Open the Tauri app to save videos.",
          };
        }

        if (mode === "create") {
          const created = await createVideo(videoFormToCreateInput(values, categories));
          navigate(`/videos/${created.id}`);
          return { state: "saved", message: "Video saved." };
        }

        if (!itemKey) {
          return { state: "error", message: "Video could not be saved." };
        }

        const updated = await updateVideo(itemKey, videoFormToPatch(values, categories));
        if (!updated) {
          return { state: "error", message: "Video could not be found." };
        }

        navigate(`/videos/${updated.id}`);
        return { state: "saved", message: "Video saved." };
      }}
    />
  );
}

export default VideoFormPage;

