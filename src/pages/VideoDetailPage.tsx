import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { detailConfigs } from "../lib/detailData";
import type { DetailConfig } from "../lib/detailData";
import type { Credit, Image, ManagedCategory, Performer } from "../backend/types";
import { buildVideoDetailConfig } from "../lib/videoIntegration";
import DetailPage from "./DetailPage";
import { getVideo, isVideoRuntimeAvailable } from "../runtime/videoCommands";
import {
  isPerformerRuntimeAvailable,
  listPerformers,
} from "../runtime/performerCommands";
import {
  isImageRuntimeAvailable,
  listImages,
} from "../runtime/imageCommands";
import { listCreditsByWork } from "../runtime/creditCommands";
import { listManagedCategories } from "../runtime/managedCategoryCommands";

function VideoDetailPage() {
  const { itemKey } = useParams();
  const [config, setConfig] = useState<DetailConfig>(detailConfigs.videos);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(() =>
    Boolean(itemKey && isVideoRuntimeAvailable()),
  );

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
        let credits: Credit[] = [];
        let managedCategories: ManagedCategory[] = [];
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
        try {
          credits = await listCreditsByWork("video", video.id);
        } catch {
          credits = [];
        }
        try {
          managedCategories = await listManagedCategories();
        } catch {
          managedCategories = [];
        }
        if (cancelled) {
          return;
        }
        setConfig(
          buildVideoDetailConfig(
            video,
            performers,
            images,
            credits,
            managedCategories,
          ),
        );
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

  return <DetailPage config={config} />;
}

export default VideoDetailPage;

