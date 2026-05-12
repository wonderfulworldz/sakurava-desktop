import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { FormConfig, FormMode } from "../lib/formData";
import { formConfigs } from "../lib/formData";
import {
  buildImageFormConfig,
  imageFormToCreateInput,
  imageFormToPatch,
} from "../lib/imageIntegration";
import FormPage from "./FormPage";
import {
  createImage,
  getImage,
  isImageRuntimeAvailable,
  updateImage,
} from "../runtime/imageCommands";

type ImageFormPageProps = {
  mode: FormMode;
};

function ImageFormPage({ mode }: ImageFormPageProps) {
  const { itemKey } = useParams();
  const navigate = useNavigate();
  const [config, setConfig] = useState<FormConfig>(formConfigs.images);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (mode === "create" || !itemKey || !isImageRuntimeAvailable()) {
      setConfig(formConfigs.images);
      setMissing(false);
      return;
    }

    getImage(itemKey)
      .then((image) => {
        if (cancelled) {
          return;
        }

        if (!image) {
          setMissing(true);
          return;
        }

        setMissing(false);
        setConfig(buildImageFormConfig(image, "edit"));
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
          Edit Image
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          This image could not be found.
        </p>
      </section>
    );
  }

  return (
    <FormPage
      config={config}
      mode={mode}
      onSubmit={async ({ values, categories }) => {
        if (!isImageRuntimeAvailable()) {
          return {
            state: "saved",
            message: "Browser preview only. Open the Tauri app to save images.",
          };
        }

        if (mode === "create") {
          const created = await createImage(imageFormToCreateInput(values, categories));
          navigate(`/images/${created.id}`);
          return { state: "saved", message: "Image saved." };
        }

        if (!itemKey) {
          return { state: "error", message: "Image could not be saved." };
        }

        const updated = await updateImage(itemKey, imageFormToPatch(values, categories));
        if (!updated) {
          return { state: "error", message: "Image could not be found." };
        }

        navigate(`/images/${updated.id}`);
        return { state: "saved", message: "Image saved." };
      }}
    />
  );
}

export default ImageFormPage;
