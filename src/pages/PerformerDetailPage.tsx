import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "../lib/LanguageContext";
import { parseRelatedCatalogRecordArray } from "../backend/json";
import type { Credit, Image, ManagedCategory, Video } from "../backend/types";
import { detailConfigs } from "../lib/detailData";
import type { DetailConfig } from "../lib/detailData";
import { buildPerformerDetailConfig } from "../lib/performerIntegration";
import DetailPage from "./DetailPage";
import {
  isImageRuntimeAvailable,
  listImages,
} from "../runtime/imageCommands";
import {
  getPerformer,
  isPerformerRuntimeAvailable,
} from "../runtime/performerCommands";
import {
  isManagedCategoryRuntimeAvailable,
  listManagedCategories,
} from "../runtime/managedCategoryCommands";
import {
  isVideoRuntimeAvailable,
  listVideos,
} from "../runtime/videoCommands";
import { listCreditsByPerformer } from "../runtime/creditCommands";

function PerformerDetailPage() {
  const t = useTranslation();
  const { itemKey } = useParams();
  const [config, setConfig] = useState<DetailConfig>(detailConfigs.performers);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(() =>
    Boolean(itemKey && isPerformerRuntimeAvailable()),
  );

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
        let managedCategories: ManagedCategory[] = [];
        let credits: Credit[] = [];
        try {
          credits = await listCreditsByPerformer(performer.id);
        } catch {
          credits = [];
        }
        if (
          (credits.some((credit) => credit.workType === "video") ||
            parseRelatedCatalogRecordArray(performer.relatedVideosJson).length > 0) &&
          isVideoRuntimeAvailable()
        ) {
          try {
            videos = await listVideos();
          } catch {
            videos = [];
          }
        }
        if (
          (credits.some((credit) => credit.workType === "image") ||
            parseRelatedCatalogRecordArray(performer.relatedImagesJson).length > 0) &&
          isImageRuntimeAvailable()
        ) {
          try {
            images = await listImages();
          } catch {
            images = [];
          }
        }
        if (isManagedCategoryRuntimeAvailable()) {
          try {
            managedCategories = await listManagedCategories();
          } catch {
            managedCategories = [];
          }
        }
        if (cancelled) {
          return;
        }
        setConfig(
          buildPerformerDetailConfig(
            performer,
            videos,
            images,
            managedCategories,
            credits,
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
          {t("detail.performerTitle")}
        </h1>
        <p className="mt-3 text-sm text-slate-500">{t("status.loadingPerformer")}</p>
      </section>
    );
  }

  if (missing) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          {t("detail.performerTitle")}
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          {t("detail.performerMissing")}
        </p>
      </section>
    );
  }

  return <DetailPage config={config} />;
}

export default PerformerDetailPage;
