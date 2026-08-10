import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "../lib/LanguageContext";
import { detailConfigs } from "../lib/detailData";
import type { DetailConfig } from "../lib/detailData";
import type { Credit, Image, ManagedCategory, Performer } from "../backend/types";
import { buildVideoDetailConfig } from "../lib/videoIntegration";
import DetailPage from "./DetailPage";
import { getVideoVisible, isVideoRuntimeAvailable } from "../runtime/videoCommands";
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
  const t = useTranslation();
  const { itemKey } = useParams();
  const [config, setConfig] = useState<DetailConfig>(detailConfigs.videos);
  const [missing, setMissing] = useState(false);
  const [hidden, setHidden] = useState(false);
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
    getVideoVisible(itemKey)
      .then(async (result) => {
        if (cancelled) {
          return;
        }

        if (result.state !== "visible" || !result.record) {
          setMissing(true);
          setHidden(result.state === "hidden");
          setLoading(false);
          return;
        }
        const video = result.record;

        setMissing(false);
        setHidden(false);
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
        const visiblePerformerIds = new Set(performers.map((performer) => performer.id));
        const visibleCategoryKeys = new Set(managedCategories.map((category) => category.key));
        credits = credits
          .filter((credit) => visiblePerformerIds.has(credit.performerId))
          .map((credit) => ({
            ...credit,
            creditTypeCategoryId: credit.creditTypeCategoryId && visibleCategoryKeys.has(credit.creditTypeCategoryId)
              ? credit.creditTypeCategoryId
              : null,
            roleImportanceCategoryId: credit.roleImportanceCategoryId && visibleCategoryKeys.has(credit.roleImportanceCategoryId)
              ? credit.roleImportanceCategoryId
              : null,
          }));
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
          {t("detail.videoTitle")}
        </h1>
        <p className="mt-3 text-sm text-slate-500">{t("status.loadingVideo")}</p>
      </section>
    );
  }

  if (missing) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          {t("detail.videoTitle")}
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          {hidden ? t("safeFilter.unavailable") : t("detail.videoMissing")}
        </p>
      </section>
    );
  }

  return <DetailPage config={config} />;
}

export default VideoDetailPage;

