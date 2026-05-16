import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { detailConfigs } from "../lib/detailData";
import type { DetailConfig } from "../lib/detailData";
import type { Performer, Video } from "../backend/types";
import { buildImageDetailConfig } from "../lib/imageIntegration";
import DetailPage from "./DetailPage";
import {
  deleteImage,
  getImage,
  isImageRuntimeAvailable,
} from "../runtime/imageCommands";
import {
  isPerformerRuntimeAvailable,
  listPerformers,
} from "../runtime/performerCommands";
import {
  isVideoRuntimeAvailable,
  listVideos,
} from "../runtime/videoCommands";

function ImageDetailPage() {
  const { itemKey } = useParams();
  const navigate = useNavigate();
  const [config, setConfig] = useState<DetailConfig>(detailConfigs.images);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(() =>
    Boolean(itemKey && isImageRuntimeAvailable()),
  );
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!itemKey || !isImageRuntimeAvailable()) {
      setConfig(detailConfigs.images);
      setMissing(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    getImage(itemKey)
      .then(async (image) => {
        if (cancelled) {
          return;
        }

        if (!image) {
          setMissing(true);
          setLoading(false);
          return;
        }

        setMissing(false);
        let performers: Performer[] = [];
        let videos: Video[] = [];
        if (isPerformerRuntimeAvailable()) {
          try {
            performers = await listPerformers();
          } catch {
            performers = [];
          }
        }
        if (isVideoRuntimeAvailable()) {
          try {
            videos = await listVideos();
          } catch {
            videos = [];
          }
        }
        if (cancelled) {
          return;
        }
        setConfig(buildImageDetailConfig(image, performers, videos));
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
          Image Detail
        </h1>
        <p className="mt-3 text-sm text-slate-500">Loading image...</p>
      </section>
    );
  }

  if (missing) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          Image Detail
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          This image could not be found.
        </p>
      </section>
    );
  }

  const deleteAction =
    itemKey && isImageRuntimeAvailable()
      ? {
          itemLabel: config.displayTitle || "this image",
          isPending: deletePending,
          errorMessage: deleteError,
          onOpen: () => setDeleteError(null),
          onConfirm: handleDelete,
        }
      : undefined;

  return <DetailPage config={config} deleteAction={deleteAction} />;
}

export default ImageDetailPage;
