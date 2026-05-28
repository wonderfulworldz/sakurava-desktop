import {
  ArrowRight,
  Clapperboard,
  Heart,
  Image as ImageIcon,
  Star,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ContentThumbnailPlaceholder from "../components/ContentThumbnailPlaceholder";
import {
  buildLastEdited,
  buildHomeSummaryCards,
  buildRecentlyAdded,
  lastEdited,
  quickActions,
  recentlyAdded,
  summaryCards,
  type HomeRecentItem,
  type HomeSummaryCard,
} from "../lib/homeData";
import { useLanguage } from "../lib/LanguageContext";
import { listImages } from "../runtime/imageCommands";
import { localImagePathToAssetSrc } from "../runtime/localAsset";
import { useMediaAssetScopeReady } from "../runtime/MediaAssetScopeContext";
import { listPerformers } from "../runtime/performerCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";
import { listVideos } from "../runtime/videoCommands";

type HomeData = {
  summaryCards: HomeSummaryCard[];
  lastEdited: HomeRecentItem[];
  recentlyAdded: HomeRecentItem[];
  loading: boolean;
};

function HomePage() {
  const { t } = useLanguage();
  const [homeData, setHomeData] = useState<HomeData>({
    summaryCards,
    lastEdited,
    recentlyAdded,
    loading: isTauriRuntimeAvailable(),
  });

  useEffect(() => {
    let cancelled = false;

    if (!isTauriRuntimeAvailable()) {
      setHomeData({ summaryCards, lastEdited, recentlyAdded, loading: false });
      return;
    }

    Promise.all([listVideos(), listImages(), listPerformers()])
      .then(([videos, images, performers]) => {
        if (!cancelled) {
          setHomeData({
            summaryCards: buildHomeSummaryCards({ videos, images, performers }),
            lastEdited: buildLastEdited({ videos, images, performers }),
            recentlyAdded: buildRecentlyAdded({ videos, images, performers }),
            loading: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHomeData({ summaryCards, lastEdited, recentlyAdded, loading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-lg border border-sakura-100 bg-white">
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white to-sakura-50/80" />
        <div className="relative grid min-h-56 gap-0 lg:grid-cols-[1fr_1fr]">
          <div className="flex flex-col justify-center p-7 lg:p-10">
            <h2 className="text-3xl font-semibold tracking-normal text-slate-950">
              {t("home.welcome")}
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-slate-600">
              {t("home.welcomeDescription")}
            </p>
            <Link
              to="/videos"
              className="mt-6 inline-flex h-11 w-fit items-center gap-2 rounded-lg bg-sakura-500 px-5 text-sm font-semibold text-white shadow-sm shadow-sakura-200 transition hover:bg-sakura-600"
            >
              {t("home.getStarted")}
              <ArrowRight size={17} />
            </Link>
          </div>
          <div className="relative min-h-52 overflow-hidden">
            <div className="absolute -right-8 top-2 h-56 w-80 rotate-[-12deg] rounded-full bg-sakura-100/50 blur-3xl" />
            <div className="absolute right-0 top-1/2 h-2 w-[420px] -translate-y-1/2 rotate-[-24deg] rounded-full bg-rose-300/40" />
            <div className="absolute right-8 top-6 h-2 w-[300px] rotate-[-24deg] rounded-full bg-rose-900/25" />
            <SakuraCluster className="absolute right-10 top-10 scale-110" />
            <SakuraCluster className="absolute right-40 top-24 scale-75 opacity-75" />
            <SakuraCluster className="absolute right-56 top-7 scale-50 opacity-50" />
            <span className="absolute left-10 top-8 size-4 rotate-45 rounded-full bg-sakura-200/50 blur-[1px]" />
            <span className="absolute left-32 top-20 size-3 rotate-45 rounded-full bg-sakura-200/45 blur-[1px]" />
            <span className="absolute bottom-10 left-24 size-5 rotate-45 rounded-full bg-sakura-100/60 blur-[1px]" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {homeData.summaryCards.map((card) => {
          const Icon = card.icon;
          const translatedLabel = t(card.labelKey);

          return (
            <article
              key={card.labelKey}
              className="rounded-lg border border-slate-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    {translatedLabel}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">
                    {card.value}
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-sakura-50 text-sakura-600">
                  <Icon size={20} />
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-500">{card.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-950">
            {t("home.quickActions")}
          </h2>
          <div className="mt-4 grid gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <Link
                  key={action.to}
                  to={action.to}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-4 transition hover:border-sakura-200 hover:bg-sakura-50"
                >
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">
                      {t(action.labelKey)}
                    </span>
                    <span className="mt-1 block text-sm text-slate-500">
                      {t(action.detailKey)}
                    </span>
                  </span>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-white text-sakura-600">
                    <Icon size={18} />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <section
          className="rounded-lg border border-slate-200 bg-white p-5"
          aria-labelledby="continue-cataloging-heading"
        >
          <h2
            id="continue-cataloging-heading"
            className="text-base font-semibold text-slate-950"
          >
            {t("home.continueCataloging")}
          </h2>
          {homeData.loading ? (
            <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">
              {t("home.loadingCatalog")}
            </p>
          ) : homeData.lastEdited.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {homeData.lastEdited.map((item) => (
                <HomeRecordCard key={`${item.kind}-${item.key}`} item={item} />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-6 text-slate-500">
              {t("home.noRecordsYet")}
            </p>
          )}
        </section>
      </section>

      <section
        className="rounded-lg border border-slate-200 bg-white p-5"
        aria-labelledby="recently-added-heading"
      >
        <h2
          id="recently-added-heading"
          className="text-base font-semibold text-slate-950"
        >
          {t("home.recentlyAdded")}
        </h2>
        {homeData.loading ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">
            {t("home.loadingCatalog")}
          </p>
        ) : homeData.recentlyAdded.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {homeData.recentlyAdded.map((item) => (
              <HomeRecordCard key={`${item.kind}-${item.key}`} item={item} />
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">
            {t("home.noRecentRecords")}
          </p>
        )}
      </section>
    </div>
  );
}

function HomeRecordCard({ item }: { item: HomeRecentItem }) {
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const assetSrc = localImagePathToAssetSrc(item.coverPath);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [assetSrc, mediaAssetScopeReady]);

  const showImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);

  return (
    <Link
      to={`/${item.kind}/${item.key}`}
      className="group block overflow-hidden rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm shadow-slate-950/[0.02] transition hover:border-sakura-200 hover:shadow-sm"
    >
      <div
        className="relative aspect-square overflow-hidden rounded-md bg-white"
      >
        {showImage ? (
          <img
            src={assetSrc ?? undefined}
            alt={`${item.title} cover`}
            className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <ContentThumbnailPlaceholder />
        )}
        {item.favorite ? (
          <span
            className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-sakura-500 text-white shadow-sm"
            aria-label="Favorite"
          >
            <Heart size={17} fill="currentColor" />
          </span>
        ) : null}
      </div>
      <div className="space-y-2 px-1 pb-1 pt-2.5">
        <p className="min-h-9 min-w-0 line-clamp-2 text-sm font-semibold leading-snug text-slate-950">
          {dashHomeText(item.title)}
        </p>
        {item.kind === "performers" ? (
          <>
            <HomeAliasChipList aliases={item.aliases} />
            <div className="grid min-h-7 grid-cols-3 items-center gap-2 text-xs font-semibold text-slate-600">
              <HomeIconStat icon={Clapperboard} label={dashHomeText(item.filmographyCount)} />
              <HomeIconStat icon={ImageIcon} label={dashHomeText(item.pictorialsCount)} />
              <HomeRatingPill rating={item.rating} />
            </div>
          </>
        ) : (
          <>
            <HomeSplitRow
              left={dashHomeText(item.code)}
              right={
                item.kind === "videos"
                  ? dashHomeText(item.duration)
                  : dashHomeText(item.imageCount)
              }
            />
            <HomeSplitRow
              left={dashHomeText(item.releaseYear)}
              right={<HomeRatingPill rating={item.rating} />}
            />
          </>
        )}
      </div>
    </Link>
  );
}

function HomeRatingPill({ rating }: { rating?: number | null }) {
  const label =
    typeof rating === "number" && Number.isFinite(rating) ? rating.toFixed(1) : "-";

  return (
    <span
      aria-label={`Rating ${label}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sakura-100 bg-sakura-50 px-2 py-1 text-xs font-semibold text-sakura-600"
    >
      <Star size={13} fill="currentColor" />
      {label}
    </span>
  );
}

function HomeSplitRow({
  left,
  right,
}: {
  left: string;
  right: ReactNode;
}) {
  return (
    <div className="flex min-h-6 min-w-0 items-center justify-between gap-3 text-xs font-medium text-slate-600">
      <span className="min-w-0 truncate">{left}</span>
      <span className="shrink-0">{right}</span>
    </div>
  );
}

function HomeIconStat({
  icon: Icon,
  label,
}: {
  icon: typeof Clapperboard;
  label: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center justify-center gap-1.5">
      <Icon size={14} className="shrink-0 text-slate-400" />
      <span className="truncate">{dashHomeText(label)}</span>
    </span>
  );
}

function HomeAliasChipList({ aliases }: { aliases?: string }) {
  const aliasList = splitHomeChips(aliases);
  const visibleAliases = aliasList.slice(0, 2);
  const hiddenCount = Math.max(0, aliasList.length - visibleAliases.length);

  return (
    <div className="flex min-h-7 min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
      {visibleAliases.length > 0 ? (
        visibleAliases.map((alias) => <HomeAliasChip key={alias} label={alias} />)
      ) : (
        <HomeAliasChip label="-" />
      )}
      {hiddenCount > 0 && <HomeAliasChip label={`+${hiddenCount}`} />}
    </div>
  );
}

function HomeAliasChip({ label }: { label: string }) {
  return (
    <span className="inline-flex max-w-full min-w-0 shrink rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500">
      <span className="truncate">{dashHomeText(label)}</span>
    </span>
  );
}

function dashHomeText(value: string | number | null | undefined) {
  const label = typeof value === "number" ? String(value) : value?.trim();
  if (
    !label ||
    label === "No aliases" ||
    label === "No code" ||
    label === "Not set" ||
    label === "Unknown"
  ) {
    return "-";
  }

  return label;
}

function splitHomeChips(value: string | null | undefined) {
  const label = dashHomeText(value);
  if (label === "-") {
    return [];
  }

  return label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function SakuraCluster({ className }: { className: string }) {
  return (
    <div className={["relative size-28", className].join(" ")} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((petal) => (
        <span
          key={petal}
          className={[
            "absolute left-1/2 top-1/2 h-12 w-7 origin-bottom rounded-full bg-gradient-to-b from-sakura-100 to-sakura-300/70 shadow-sm",
            petalClass(petal),
          ].join(" ")}
        />
      ))}
      <span className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sakura-400/70" />
    </div>
  );
}

function petalClass(index: number) {
  const classes = [
    "-translate-x-1/2 -translate-y-full rotate-0",
    "-translate-x-1/2 -translate-y-full rotate-[72deg]",
    "-translate-x-1/2 -translate-y-full rotate-[144deg]",
    "-translate-x-1/2 -translate-y-full rotate-[216deg]",
    "-translate-x-1/2 -translate-y-full rotate-[288deg]",
  ];

  return classes[index] ?? "";
}

export default HomePage;
