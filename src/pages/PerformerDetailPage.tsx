import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { parseRelatedCatalogRecordArray } from "../backend/json";
import type { Image, Video } from "../backend/types";
import { detailConfigs } from "../lib/detailData";
import type { DetailConfig } from "../lib/detailData";
import { buildPerformerDetailConfig } from "../lib/performerIntegration";
import DetailPage from "./DetailPage";
import {
  isImageRuntimeAvailable,
  listImages,
} from "../runtime/imageCommands";
import {
  deletePerformer,
  getPerformer,
  isPerformerRuntimeAvailable,
} from "../runtime/performerCommands";
import {
  isVideoRuntimeAvailable,
  listVideos,
} from "../runtime/videoCommands";

function PerformerDetailPage() {
  const { itemKey } = useParams();
  const navigate = useNavigate();
  const [config, setConfig] = useState<DetailConfig>(detailConfigs.performers);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(() =>
    Boolean(itemKey && isPerformerRuntimeAvailable()),
  );
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!itemKey || !isPerformerRuntimeAvailable()) {
      setConfig(detailConfigs.performers);
      setMissing(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    getPerformer(itemKey)
      .then(async (performer) => {
        if (cancelled) {
          return;
        }

        if (!performer) {
          setMissing(true);
          setLoading(false);
          return;
        }

        setMissing(false);
        let videos: Video[] = [];
        let images: Image[] = [];
        if (
          parseRelatedCatalogRecordArray(performer.relatedVideosJson).length > 0 &&
          isVideoRuntimeAvailable()
        ) {
          try {
            videos = await listVideos();
          } catch {
            videos = [];
          }
        }
        if (
          parseRelatedCatalogRecordArray(performer.relatedImagesJson).length > 0 &&
          isImageRuntimeAvailable()
        ) {
          try {
            images = await listImages();
          } catch {
            images = [];
          }
        }
        if (cancelled) {
          return;
        }
        setConfig(buildPerformerDetailConfig(performer, videos, images));
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
  }, [itemKey]);

  async function handleDelete() {
    if (!itemKey || deletePending) {
      return;
    }

    setDeletePending(true);
    setDeleteError(null);

    try {
      const result = await deletePerformer(itemKey);

      if (!result.deleted) {
        setDeleteError(
          "Performer delete failed. The saved Sakurava record was not removed.",
        );
        return;
      }

      navigate("/performers", { replace: true });
    } catch {
      setDeleteError(
        "Performer delete failed. The saved Sakurava record was not removed.",
      );
    } finally {
      setDeletePending(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          Performer Detail
        </h1>
        <p className="mt-3 text-sm text-slate-500">Loading performer...</p>
      </section>
    );
  }

  if (missing) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          Performer Detail
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          This performer could not be found.
        </p>
      </section>
    );
  }

  const deleteAction =
    itemKey && isPerformerRuntimeAvailable()
      ? {
          itemLabel: config.displayTitle || "this performer",
          isPending: deletePending,
          errorMessage: deleteError,
          onOpen: () => setDeleteError(null),
          onConfirm: handleDelete,
        }
      : undefined;

  return <DetailPage config={config} deleteAction={deleteAction} />;
}

export default PerformerDetailPage;
