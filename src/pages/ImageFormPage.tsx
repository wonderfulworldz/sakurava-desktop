import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { FormConfig, FormMode } from "../lib/formData";
import { formConfigs } from "../lib/formData";
import {
  buildImageFormConfig,
  imageFormToCreateInput,
  imageFormToPatch,
} from "../lib/imageIntegration";
import FormPage from "./FormPage";
import { prepareImageValuesForSave } from "../lib/mediaTechInfo";
import {
  createImage,
  deleteImage,
  getImage,
  isImageRuntimeAvailable,
  updateImage,
} from "../runtime/imageCommands";
import type { Credit } from "../backend/types";
import { listCreditsByWork } from "../runtime/creditCommands";
import {
  creditToFormValue,
  reconcileWorkCredits,
} from "../lib/workCredits";

type ImageFormPageProps = {
  mode: FormMode;
};

function ImageFormPage({ mode }: ImageFormPageProps) {
  const { itemKey } = useParams();
  const navigate = useNavigate();
  const [config, setConfig] = useState<FormConfig>(formConfigs.images);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(() =>
    Boolean(mode === "edit" && itemKey && isImageRuntimeAvailable()),
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

    if (mode === "create" || !itemKey || !isImageRuntimeAvailable()) {
      setConfig(formConfigs.images);
      setMissing(false);
      setLoading(false);
      setOriginalCredits([]);
      return;
    }

    setLoading(true);
    Promise.all([
      getImage(itemKey),
      listCreditsByWork("image", itemKey).catch(() => []),
    ])
      .then(([image, credits]) => {
        if (cancelled) {
          return;
        }

        if (!image) {
          setMissing(true);
          setLoading(false);
          return;
        }

        setMissing(false);
        setConfig(buildImageFormConfig(image, "edit"));
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
      const result = await deleteImage(itemKey);

      if (!result.deleted) {
        setDeleteError("Image delete failed. The saved Sakurava record was not removed.");
        return;
      }

      navigate("/images", { replace: true });
    } catch {
      setDeleteError("Image delete failed. The saved Sakurava record was not removed.");
    } finally {
      setDeletePending(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          Edit Image
        </h1>
        <p className="mt-3 text-sm text-slate-500">Loading image...</p>
      </section>
    );
  }

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
      initialCredits={initialCreditValues}
      deleteAction={
        mode === "edit" && itemKey && isImageRuntimeAvailable()
          ? {
              itemLabel: String(config.initialValues.edit.title || "this image"),
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
        galleryImagePaths,
        sourceLinks,
        credits,
      }) => {
        if (!isImageRuntimeAvailable()) {
          return {
            state: "saved",
            message: "Browser preview only. Open the Tauri app to save images.",
          };
        }

        const preparedValues = await prepareImageValuesForSave(values, galleryImagePaths);

        if (mode === "create") {
          const created = await createImage(
            imageFormToCreateInput(
              preparedValues,
              categories,
              relatedPerformers,
              relatedCatalogRecords,
              galleryImagePaths,
              sourceLinks,
            ),
          );
          try {
            await reconcileWorkCredits("image", created.id, [], credits);
          } catch {
            return {
              state: "error",
              message:
                "Image saved, but Cast & Credits could not be fully saved. Reopen the image and retry.",
            };
          }
          navigate(`/images/${created.id}`);
          return { state: "saved", message: "Image saved." };
        }

        if (!itemKey) {
          return { state: "error", message: "Image could not be saved." };
        }

        const updated = await updateImage(
          itemKey,
          imageFormToPatch(
            preparedValues,
            categories,
            relatedPerformers,
            relatedCatalogRecords,
            galleryImagePaths,
            sourceLinks,
          ),
        );
        if (!updated) {
          return { state: "error", message: "Image could not be found." };
        }

        try {
          await reconcileWorkCredits(
            "image",
            updated.id,
            originalCredits,
            credits,
          );
        } catch {
          return {
            state: "error",
            message:
              "Image saved, but Cast & Credits could not be fully saved. Reopen the image and retry.",
          };
        }
        navigate(`/images/${updated.id}`);
        return { state: "saved", message: "Image saved." };
      }}
    />
  );
}

export default ImageFormPage;
