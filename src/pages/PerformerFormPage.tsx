import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { FormConfig, FormMode } from "../lib/formData";
import { formConfigs } from "../lib/formData";
import {
  buildPerformerFormConfig,
  performerFormToCreateInput,
  performerFormToPatch,
} from "../lib/performerIntegration";
import FormPage from "./FormPage";
import {
  createPerformer,
  getPerformer,
  isPerformerRuntimeAvailable,
  updatePerformer,
} from "../runtime/performerCommands";

type PerformerFormPageProps = {
  mode: FormMode;
};

function PerformerFormPage({ mode }: PerformerFormPageProps) {
  const { itemKey } = useParams();
  const navigate = useNavigate();
  const [config, setConfig] = useState<FormConfig>(formConfigs.performers);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(() =>
    Boolean(mode === "edit" && itemKey && isPerformerRuntimeAvailable()),
  );

  useEffect(() => {
    let cancelled = false;

    if (mode === "create" || !itemKey || !isPerformerRuntimeAvailable()) {
      setConfig(formConfigs.performers);
      setMissing(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    getPerformer(itemKey)
      .then((performer) => {
        if (cancelled) {
          return;
        }

        if (!performer) {
          setMissing(true);
          setLoading(false);
          return;
        }

        setMissing(false);
        setConfig(buildPerformerFormConfig(performer, "edit"));
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

  if (loading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          Edit Performer
        </h1>
        <p className="mt-3 text-sm text-slate-500">Loading performer...</p>
      </section>
    );
  }

  if (missing) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          Edit Performer
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          This performer could not be found.
        </p>
      </section>
    );
  }

  return (
    <FormPage
      config={config}
      mode={mode}
      onSubmit={async ({
        values,
        categories,
        aliases,
        performerRelatedVideos,
        performerRelatedImages,
      }) => {
        if (!isPerformerRuntimeAvailable()) {
          return {
            state: "saved",
            message:
              "Browser preview only. Open the Tauri app to save performers.",
          };
        }

        if (mode === "create") {
          const created = await createPerformer(
            performerFormToCreateInput(
              values,
              categories,
              aliases,
              performerRelatedVideos,
              performerRelatedImages,
            ),
          );
          navigate(`/performers/${created.id}`);
          return { state: "saved", message: "Performer saved." };
        }

        if (!itemKey) {
          return { state: "error", message: "Performer could not be saved." };
        }

        const updated = await updatePerformer(
          itemKey,
          performerFormToPatch(
            values,
            categories,
            aliases,
            performerRelatedVideos,
            performerRelatedImages,
          ),
        );
        if (!updated) {
          return { state: "error", message: "Performer could not be found." };
        }

        navigate(`/performers/${updated.id}`);
        return { state: "saved", message: "Performer saved." };
      }}
    />
  );
}

export default PerformerFormPage;
