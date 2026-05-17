import {
  ArrowRight,
  Heart,
  Image,
  UserRound,
  Video,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
              Welcome to Sakurava
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-slate-600">
              Manage your local video, image, and performer catalog in one
              private desktop app.
            </p>
            <Link
              to="/videos"
              className="mt-6 inline-flex h-11 w-fit items-center gap-2 rounded-lg bg-sakura-500 px-5 text-sm font-semibold text-white shadow-sm shadow-sakura-200 transition hover:bg-sakura-600"
            >
              Get Started
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

          return (
            <article
              key={card.label}
              className="rounded-lg border border-slate-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    {card.label}
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
            Quick Actions
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
                      {action.label}
                    </span>
                    <span className="mt-1 block text-sm text-slate-500">
                      {action.detail}
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
            Continue Cataloging
          </h2>
          {homeData.loading ? (
            <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">
              Loading catalog items...
            </p>
          ) : homeData.lastEdited.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {homeData.lastEdited.map((item) => (
                <HomeRecordCard key={`${item.kind}-${item.key}`} item={item} />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-6 text-slate-500">
              No records yet.
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
          Recently Added
        </h2>
        {homeData.loading ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">
            Loading recently added items...
          </p>
        ) : homeData.recentlyAdded.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {homeData.recentlyAdded.map((item) => (
              <HomeRecordCard key={`${item.kind}-${item.key}`} item={item} />
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">
            No recent records yet. Videos, Images, and Performers will appear
            here after they are saved.
          </p>
        )}
      </section>
    </div>
  );
}

function HomeRecordCard({ item }: { item: HomeRecentItem }) {
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const assetSrc = localImagePathToAssetSrc(item.coverPath);
  const Icon = recentIcon(item.kind);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [assetSrc, mediaAssetScopeReady]);

  const showImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);

  return (
    <Link
      to={`/${item.kind}/${item.key}`}
      className="group rounded-lg border border-slate-200 bg-white p-3 transition hover:border-sakura-200 hover:shadow-sm"
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-slate-100">
        {showImage ? (
          <img
            src={assetSrc ?? undefined}
            alt={`${item.title} cover`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-300">
            <Icon size={28} />
          </div>
        )}
        {item.favorite ? (
          <span
            className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-white/90 text-sakura-500 shadow-sm"
            aria-label="Favorite"
          >
            <Heart size={17} fill="currentColor" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 truncate text-sm font-semibold text-slate-800">
        {item.title}
      </p>
      <p className="mt-1 truncate text-xs font-medium text-slate-500">
        {item.typeLabel}
      </p>
    </Link>
  );
}

function recentIcon(kind: HomeRecentItem["kind"]) {
  if (kind === "performers") {
    return UserRound;
  }

  if (kind === "images") {
    return Image;
  }

  return Video;
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
