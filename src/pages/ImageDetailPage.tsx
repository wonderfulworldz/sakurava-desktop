import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "../lib/LanguageContext";
import { detailConfigs } from "../lib/detailData";
import type { DetailConfig } from "../lib/detailData";
import type { Credit, ManagedCategory, Performer, Video } from "../backend/types";
import { buildImageDetailConfig } from "../lib/imageIntegration";
import DetailPage from "./DetailPage";
import { getImage, isImageRuntimeAvailable } from "../runtime/imageCommands";
import {
  isPerformerRuntimeAvailable,
  listPerformers,
} from "../runtime/performerCommands";
import {
  isVideoRuntimeAvailable,
  listVideos,
} from "../runtime/videoCommands";
import { listCreditsByWork } from "../runtime/creditCommands";
import { listManagedCategories } from "../runtime/managedCategoryCommands";

function ImageDetailPage() {
  const t = useTranslation();
  const { itemKey } = useParams();
  const [config, setConfig] = useState<DetailConfig>(detailConfigs.images);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(() =>
    Boolean(itemKey && isImageRuntimeAvailable()),
  );

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
        let credits: Credit[] = [];
        let managedCategories: ManagedCategory[] = [];
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
        try {
          credits = await listCreditsByWork("image", image.id);
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
          buildImageDetailConfig(
            image,
            performers,
            videos,
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
          {t("detail.imageTitle")}
        </h1>
        <p className="mt-3 text-sm text-slate-500">{t("status.loadingImage")}</p>
      </section>
    );
  }

  if (missing) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          {t("detail.imageTitle")}
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          {t("detail.imageMissing")}
        </p>
      </section>
    );
  }

  return <DetailPage config={config} />;
}

export default ImageDetailPage;
