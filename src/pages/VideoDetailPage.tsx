import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { detailConfigs } from "../lib/detailData";
import type { DetailConfig } from "../lib/detailData";
import type { Image, Performer } from "../backend/types";
import { buildVideoDetailConfig } from "../lib/videoIntegration";
import DetailPage from "./DetailPage";
import {
  deleteVideo,
  getVideo,
  isVideoRuntimeAvailable,
} from "../runtime/videoCommands";
import {
  isPerformerRuntimeAvailable,
  listPerformers,
} from "../runtime/performerCommands";
import {
  isImageRuntimeAvailable,
  listImages,
} from "../runtime/imageCommands";

function VideoDetailPage() {
  const { itemKey } = useParams();
  const navigate = useNavigate();
  const [config, setConfig] = useState<DetailConfig>(detailConfigs.videos);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(() =>
    Boolean(itemKey && isVideoRuntimeAvailable()),
  );
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!itemKey || !isVideoRuntimeAvailable()) {
      setConfig(detailConfigs.videos);
      setMissing(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    getVideo(itemKey)
      .then(async (video) => {
        if (cancelled) {
          return;
        }

        if (!video) {
          setMissing(true);
          setLoading(false);
          return;
        }

        setMissing(false);
        let performers: Performer[] = [];
        let images: Image[] = [];
        if (isPerformerRuntimeAvailable()) {
          try {
            performers = await listPerformers();
          } catch {
            performers = [];
          }
        }
        if (isImageRuntimeAvailable()) {
          try {
            images = await listImages();
          } catch {
            images = [];
          }
        }
        if (cancelled) {
          return;
        }
        setConfig(buildVideoDetailConfig(video, performers, images));
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
          Video Detail
        </h1>
        <p className="mt-3 text-sm text-slate-500">Loading video...</p>
      </section>
    );
  }

  if (missing) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          Video Detail
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          This video could not be found.
        </p>
      </section>
    );
  }

  const deleteAction =
    itemKey && isVideoRuntimeAvailable()
      ? {
          itemLabel: config.displayTitle || "this video",
          isPending: deletePending,
          errorMessage: deleteError,
          onOpen: () => setDeleteError(null),
          onConfirm: handleDelete,
        }
      : undefined;

  return <DetailPage config={config} deleteAction={deleteAction} />;
}

export default VideoDetailPage;

