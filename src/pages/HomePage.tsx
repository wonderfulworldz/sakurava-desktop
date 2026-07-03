import {
  ArrowRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { VideoLiteCard, ImageLiteCard, PerformerLiteCard } from "../components/cards";
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
import { listImages, updateImage } from "../runtime/imageCommands";
import { listPerformers, updatePerformer } from "../runtime/performerCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";
import { listVideos, updateVideo } from "../runtime/videoCommands";

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

  function handleFavoriteToggle(item: HomeRecentItem) {
    const nextFavorite = !item.favorite;

    setHomeData((prev) => ({
      ...prev,
      lastEdited: prev.lastEdited.map((i) =>
        i.kind === item.kind && i.key === item.key ? { ...i, favorite: nextFavorite } : i,
      ),
      recentlyAdded: prev.recentlyAdded.map((i) =>
        i.kind === item.kind && i.key === item.key ? { ...i, favorite: nextFavorite } : i,
      ),
    }));

    if (isTauriRuntimeAvailable()) {
      const updateFn =
        item.kind === "videos" ? updateVideo :
        item.kind === "images" ? updateImage :
        updatePerformer;
      updateFn(item.key, { favorite: nextFavorite }).catch(() => {
        setHomeData((prev) => ({
          ...prev,
          lastEdited: prev.lastEdited.map((i) =>
            i.kind === item.kind && i.key === item.key ? { ...i, favorite: !nextFavorite } : i,
          ),
          recentlyAdded: prev.recentlyAdded.map((i) =>
            i.kind === item.kind && i.key === item.key ? { ...i, favorite: !nextFavorite } : i,
          ),
        }));
      });
    }
  }

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
            <div className="home-accent-streak absolute right-0 top-1/2 h-2 w-[420px] -translate-y-1/2 rotate-[-24deg] rounded-full" />
            <div className="home-accent-streak-strong absolute right-8 top-6 h-2 w-[300px] rotate-[-24deg] rounded-full" />
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

      <section className="grid gap-6">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-950">
            {t("home.quickActions")}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {homeData.lastEdited.map((item) => (
                <HomeLiteCard key={`${item.kind}-${item.key}`} item={item} onFavoriteToggle={handleFavoriteToggle} />
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
              <HomeLiteCard key={`${item.kind}-${item.key}`} item={item} onFavoriteToggle={handleFavoriteToggle} />
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

function HomeLiteCard({ item, onFavoriteToggle }: { item: HomeRecentItem; onFavoriteToggle: (item: HomeRecentItem) => void }) {
  const linkTo = `/${item.kind}/${item.key}`;

  function handleFavoriteClick() {
    onFavoriteToggle(item);
  }

  if (item.kind === "performers") {
    return <PerformerLiteCard item={item} linkTo={linkTo} onFavoriteClick={handleFavoriteClick} />;
  }

  if (item.kind === "images") {
    return <ImageLiteCard item={item} linkTo={linkTo} onFavoriteClick={handleFavoriteClick} />;
  }

  return <VideoLiteCard item={item} linkTo={linkTo} onFavoriteClick={handleFavoriteClick} />;
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
