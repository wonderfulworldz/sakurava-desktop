import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clapperboard,
  Clock,
  Edit3,
  FileImage,
  Film,
  Heart,
  Image as ImageIcon,
  Info,
  Maximize2,
  Minimize2,
  Minus,
  Play,
  Plus,
  Ruler,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { VideoLiteCard, ImageLiteCard, PerformerLiteCard } from "../components/cards";
import ContentThumbnailPlaceholder from "../components/ContentThumbnailPlaceholder";
import type {
  DetailConfig,
  DetailSection,
  MediaPathItem,
  PerformerDetailConfig,
} from "../lib/detailData";
import type { HomeRecentItem } from "../lib/homeData";
import { calculateAverageRating } from "../lib/ratingSummary";
import { updateImage } from "../runtime/imageCommands";
import { localImagePathToAssetSrc } from "../runtime/localAsset";
import { openMediaPath } from "../runtime/mediaOpenCommands";
import { useMediaAssetScopeReady } from "../runtime/MediaAssetScopeContext";
import {
  checkPathStatus,
  type PathStatusKind,
  type PathStatusResult,
} from "../runtime/pathStatusCommands";
import { updatePerformer } from "../runtime/performerCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";
import { updateVideo } from "../runtime/videoCommands";

export type DetailDeleteAction = {
  itemLabel: string;
  isPending: boolean;
  errorMessage: string | null;
  onOpen: () => void;
  onConfirm: () => void;
};

type DetailPageProps = {
  config: DetailConfig;
  deleteAction?: DetailDeleteAction;
};

function DetailPage({ config, deleteAction }: DetailPageProps) {
  if (config.kind === "performers") {
    return <PerformerDetailPage config={config} deleteAction={deleteAction} />;
  }

  return <CatalogDetailPage config={config} deleteAction={deleteAction} />;
}

function DetailHeader({ config, deleteAction }: DetailPageProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  function openConfirmation() {
    deleteAction?.onOpen();
    setConfirmOpen(true);
  }

  function closeConfirmation() {
    if (!deleteAction?.isPending) {
      setConfirmOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Link
          to={config.backTo}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600"
        >
          <ArrowLeft size={16} />
          {config.backLabel}
        </Link>
        <div className="flex items-center gap-2">
          {deleteAction && (
            <button
              type="button"
              onClick={openConfirmation}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-50"
            >
              <Trash2 size={16} />
              Delete
            </button>
          )}
          <Link
            to={config.editTo}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sakura-500 px-5 text-sm font-semibold text-white shadow-sm shadow-sakura-200 transition hover:bg-sakura-600"
          >
            <Edit3 size={16} />
            Edit
          </Link>
        </div>
      </div>
      <div>
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          {config.title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {config.subtitle}
        </p>
      </div>
      {deleteAction && confirmOpen && (
        <section
          aria-label="Delete confirmation"
          className="rounded-lg border border-rose-200 bg-rose-50/70 p-4"
        >
          <h2 className="text-base font-semibold text-rose-900">
            Delete {deleteAction.itemLabel}?
          </h2>
          <p className="mt-2 text-sm leading-6 text-rose-800">
            This removes the saved Sakurava record for {deleteAction.itemLabel}.
            It does not delete local media files from this device.
          </p>
          {deleteAction.errorMessage && (
            <p className="mt-3 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700">
              {deleteAction.errorMessage}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={closeConfirmation}
              disabled={deleteAction.isPending}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={deleteAction.onConfirm}
              disabled={deleteAction.isPending}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteAction.isPending ? "Deleting..." : "Delete permanently"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function CatalogDetailPage({ config, deleteAction }: DetailPageProps) {
  const heroSection = (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.9fr)_1.1fr]">
        <LargePlaceholder config={config} />
        <CatalogIdentity config={config} />
      </div>
    </section>
  );
  const detailSummarySection = (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)_minmax(0,0.85fr)]">
      <RowsCard title="Metadata" icon={Calendar} items={config.metadata} />
      <RatingSummaryCard title={config.ratingTitle} rating={config.rating} />
      <RowsCard
        title={config.techTitle}
        icon={Info}
        items={config.techItems}
        message={config.techMessage}
        readOnly
      />
    </section>
  );

  if (config.kind === "images") {
    return (
      <div className="space-y-5">
        <DetailHeader config={config} deleteAction={deleteAction} />
        {heroSection}
        <GalleryGrid paths={config.galleryImagePaths} />
        {detailSummarySection}
        <NotesCard notes={config.notes} />
        <RelatedRows sections={config.relatedSections} />
        <SystemInfoCard items={config.systemInfo} mediaPaths={config.mediaPaths} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DetailHeader config={config} deleteAction={deleteAction} />
      {heroSection}
      {detailSummarySection}
      <NotesCard notes={config.notes} />
      <RelatedRows sections={config.relatedSections} />
      <SystemInfoCard items={config.systemInfo} mediaPaths={config.mediaPaths} />
    </div>
  );
}

function CatalogIdentity({ config }: DetailPageProps) {
  const playableMedia =
    config.kind === "videos"
      ? config.mediaPaths.find((item) => item.playable)
      : undefined;

  return (
    <div className="flex min-h-full flex-col justify-between gap-6 py-1">
      <div>
        <div className="flex min-h-7 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {"code" in config && config.code && config.code !== "No code" && (
              <Chip label={config.code} tone="neutral" />
            )}
          </div>
          {config.favorite && <Chip label="Favorite" icon={Heart} tone="pink" />}
        </div>

        <div className="mt-4 min-w-0">
          <h2 className="min-w-0 break-words text-3xl font-semibold tracking-normal text-slate-950 [overflow-wrap:anywhere]">
            {config.displayTitle}
          </h2>
          {config.originalTitle && (
            <p className="mt-2 min-w-0 break-words text-base text-slate-500 [overflow-wrap:anywhere]">
              {config.originalTitle}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {config.chips.map((chip) => (
            <Chip
              key={chip}
              label={chip}
              tone={chip === "Owned" || chip === "Active" ? "green" : "orange"}
            />
          ))}
        </div>

        {playableMedia && (
          <div className="mt-5">
            <HeroPlayButton item={playableMedia} />
          </div>
        )}
      </div>

      {config.categories.length > 0 && (
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-800">Categories</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {config.categories.map((category) => (
              <Chip key={category} label={category} tone="pinkSoft" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PerformerDetailPage({
  config,
  deleteAction,
}: {
  config: PerformerDetailConfig;
  deleteAction?: DetailDeleteAction;
}) {
  return (
    <div className="space-y-5">
      <DetailHeader config={config} deleteAction={deleteAction} />

      <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <PerformerProfileCard config={config} />

        <div className="space-y-5">
          <PerformerSummaryCards config={config} />
          <RowsCard title="Profile Metadata" icon={Calendar} items={config.metadata} />
          <RatingSummaryCard title={config.ratingTitle} rating={config.rating} />
          <section className="grid gap-5 lg:grid-cols-2">
            <RowsCard title="Personal" icon={UserRound} items={config.personal} />
            <RowsCard title="Physical" icon={Ruler} items={config.physical} />
          </section>
          <NotesCard notes={config.notes} />
        </div>
      </div>

      <RelatedRows sections={config.relatedSections} />
      <SystemInfoCard items={config.systemInfo} mediaPaths={config.mediaPaths} />
    </div>
  );
}

function PerformerProfileCard({ config }: { config: PerformerDetailConfig }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <LargePlaceholder config={config} />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => {
          const label =
            config.techItems[index]?.label ?? `Performer Thumbnail ${index + 1}`;

          return (
            <SmallThumbnail
              key={label}
              label={label}
              path={config.thumbnailPaths[index]}
            />
          );
        })}
      </div>

      <div className="mt-5 min-w-0">
        <h2 className="min-w-0 break-words text-3xl font-semibold tracking-normal text-slate-950 [overflow-wrap:anywhere]">
          {config.displayTitle}
        </h2>
        {config.originalTitle && (
          <p className="mt-2 min-w-0 break-words text-sm text-slate-500 [overflow-wrap:anywhere]">
            {config.originalTitle}
          </p>
        )}
      </div>

      <div
        aria-label="Performer hero chips"
        className="mt-4 flex flex-wrap gap-2"
      >
        {config.favorite && <Chip label="Favorite" icon={Heart} tone="pink" />}
        {config.chips.map((chip) => (
          <Chip
            key={chip}
            label={chip}
            tone={chip === "Active" ? "green" : "orange"}
          />
        ))}
      </div>

      {config.aliases.length > 0 && (
        <>
          <Divider />
          <LabelBlock title="Aliases" labels={config.aliases} />
        </>
      )}
      {config.categories.length > 0 && (
        <>
          <Divider />
          <LabelBlock title="Categories" labels={config.categories} />
        </>
      )}
    </section>
  );
}

function PerformerSummaryCards({ config }: { config: PerformerDetailConfig }) {
  const icons = [Calendar, Clapperboard, FileImage];

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {config.summary.map((item, index) => {
        const Icon = icons[index] ?? Info;

        return (
          <div
            key={item.label}
            className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-5"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500">
              <Icon size={22} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">
                {item.label}
              </p>
              <p className="mt-1 whitespace-pre-line text-2xl font-semibold leading-tight text-slate-950">
                {item.value}
              </p>
              {item.secondaryValue && (
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {item.secondaryValue}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function LargePlaceholder({ config }: DetailPageProps) {
  const Icon = config.placeholderIcon;
  const aspectClass =
    config.kind === "performers" ? "aspect-[4/5]" : "aspect-video";
  const [imageFailed, setImageFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const assetSrc = localImagePathToAssetSrc(config.coverPath);
  const showImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);
  const previewTitle = coverPreviewTitle(config.kind);
  const imageAlt = `${config.displayTitle} ${
    config.kind === "performers" ? "profile image" : "cover"
  }`;

  useEffect(() => {
    setImageFailed(false);
    setPreviewOpen(false);
  }, [assetSrc, mediaAssetScopeReady]);

  return (
    <>
      <div
        className={`${aspectClass} relative flex min-h-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-slate-100 via-white to-sakura-50 text-slate-300`}
        aria-label={showImage ? undefined : config.placeholderLabel}
      >
        {showImage ? (
          <button
            type="button"
            aria-label={`Preview ${previewTitle}`}
            className="absolute inset-0 cursor-zoom-in overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 focus-visible:ring-offset-2"
            onClick={() => setPreviewOpen(true)}
          >
            <img
              src={assetSrc ?? undefined}
              alt={imageAlt}
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          </button>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Icon
              size={config.kind === "performers" ? 86 : 74}
              strokeWidth={1.5}
            />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-500">
                {config.placeholderLabel}
              </p>
              {config.kind === "videos" && (
                <p className="mt-2 text-sm text-slate-400">16:9</p>
              )}
            </div>
          </div>
        )}
      </div>
      {showImage && assetSrc && previewOpen && (
        <ImagePreviewModal
          alt={`${previewTitle} full size`}
          src={assetSrc}
          title={previewTitle}
          onClose={() => setPreviewOpen(false)}
          onImageError={() => {
            setImageFailed(true);
            setPreviewOpen(false);
          }}
        />
      )}
    </>
  );
}

function coverPreviewTitle(kind: DetailConfig["kind"]) {
  if (kind === "videos") {
    return "Video Cover";
  }

  if (kind === "images") {
    return "Image Cover";
  }

  return "Performer Cover";
}

function ImagePreviewModal({
  alt,
  src,
  title,
  onClose,
  onImageError,
}: {
  alt: string;
  src: string;
  title: string;
  onClose: () => void;
  onImageError: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-full w-full max-w-5xl flex-col rounded-lg bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600"
          >
            <X size={14} />
            Close
          </button>
        </div>
        <div className="flex min-h-0 items-center justify-center bg-slate-950 p-4">
          <img
            src={src}
            alt={alt}
            className="max-h-[78vh] max-w-full object-contain"
            onError={onImageError}
          />
        </div>
      </div>
    </div>
  );
}

function SmallThumbnail({ label, path }: { label: string; path?: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const assetSrc = localImagePathToAssetSrc(path);
  const showImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
    setPreviewOpen(false);
  }, [assetSrc, mediaAssetScopeReady]);

  return (
    <>
      <div
        className="relative aspect-[4/5] overflow-hidden rounded-lg bg-gradient-to-br from-slate-100 via-white to-sakura-50"
      >
        {showImage ? (
          <button
            type="button"
            aria-label={`Preview ${label}`}
            className="absolute inset-0 cursor-zoom-in overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 focus-visible:ring-offset-2"
            onClick={() => setPreviewOpen(true)}
          >
            <img
              src={assetSrc ?? undefined}
              alt={label}
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          </button>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-300">
            <ImageIcon size={24} aria-label={label} />
          </div>
        )}
      </div>
      {showImage && assetSrc && previewOpen && (
        <ImagePreviewModal
          alt={`${label} full size`}
          src={assetSrc}
          title={label}
          onClose={() => setPreviewOpen(false)}
          onImageError={() => {
            setImageFailed(true);
            setPreviewOpen(false);
          }}
        />
      )}
    </>
  );
}

function RowsCard({
  title,
  icon: Icon,
  items,
  message,
  readOnly = false,
}: {
  title: string;
  icon: typeof Info;
  items: { label: string; value: string }[];
  message?: string;
  readOnly?: boolean;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
      <CardTitle title={title} icon={Icon} />
      {message && <p className="mt-3 text-xs text-slate-500">{message}</p>}
      <div className="mt-4 divide-y divide-slate-100">
        {items.map((item) => (
          <div
            key={item.label}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 py-3 text-sm"
          >
            <span className="min-w-0 font-medium text-slate-700">
              {item.label}
            </span>
            <span className="min-w-0 break-words text-slate-500 [overflow-wrap:anywhere]">
              {item.value}
            </span>
          </div>
        ))}
      </div>
      {readOnly && (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
          Data-dependent fields only
        </p>
      )}
    </section>
  );
}

function HeroPlayButton({ item }: { item: MediaPathItem }) {
  const [status, setStatus] = useState<PathStatusState>(() => ({
    label: item.label,
    path: item.path.trim(),
    playable: item.playable,
    status: item.path.trim() ? "unknown" : "notSet",
    kind: "unknown",
    message: item.path.trim() ? "Not checked" : "Path is not set",
  }));
  const [opening, setOpening] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFeedback(null);
    setStatus({
      label: item.label,
      path: item.path.trim(),
      playable: item.playable,
      status: item.path.trim() ? "unknown" : "notSet",
      kind: "unknown",
      message: item.path.trim() ? "Not checked" : "Path is not set",
    });

    checkPathStatus(item.path).then((result) => {
      if (!cancelled) {
        setStatus({
          label: item.label,
          playable: item.playable,
          ...result,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [item]);

  async function handlePlay() {
    if (status.status !== "exists" || opening) {
      return;
    }

    setOpening(true);
    setFeedback(null);

    try {
      const result = await openMediaPath(status.path);
      setFeedback(
        result.opened
          ? "Opening with default app."
          : result.message || "Media file could not be opened.",
      );
    } catch {
      setFeedback("Media file could not be opened.");
    } finally {
      setOpening(false);
    }
  }

  const disabled = status.status !== "exists" || opening;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handlePlay}
        disabled={disabled}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-sakura-500 px-5 text-sm font-semibold text-white shadow-sm shadow-sakura-200 transition hover:bg-sakura-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
      >
        <Play size={16} fill="currentColor" />
        {opening ? "Opening..." : "Play"}
      </button>
      {feedback && (
        <span className="text-xs font-medium text-slate-500">{feedback}</span>
      )}
    </div>
  );
}

type PathStatusState = PathStatusResult & {
  label: string;
  playable?: boolean;
};

function MediaPathStatusRows({ items }: { items: MediaPathItem[] }) {
  const [statuses, setStatuses] = useState<PathStatusState[]>(() =>
    initialPathStatuses(items),
  );

  useEffect(() => {
    let cancelled = false;
    setStatuses(initialPathStatuses(items));

    Promise.all(
      items.map(async (item) => ({
        label: item.label,
        playable: item.playable,
        ...(await checkPathStatus(item.path)),
      })),
    ).then((results) => {
      if (!cancelled) {
        setStatuses(results);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [items]);

  return (
    <>
      {statuses.map((status) => {
        const display = pathStatusDisplay(status.status);

        return (
          <div key={status.label} className="text-sm">
            <p className="font-medium text-slate-600">{status.label}</p>
            <p className="mt-1 text-slate-500">{display.label}</p>
          </div>
        );
      })}
    </>
  );
}

function initialPathStatuses(items: MediaPathItem[]): PathStatusState[] {
  return items.map((item) => ({
    label: item.label,
    path: item.path.trim(),
    playable: item.playable,
    status: item.path.trim() ? "unknown" : "notSet",
    kind: "unknown",
    message: item.path.trim() ? "Not checked" : "Path is not set",
  }));
}

function pathStatusDisplay(status: PathStatusKind) {
  if (status === "exists") {
    return {
      label: "Available",
    };
  }

  if (status === "missing") {
    return {
      label: "Missing",
    };
  }

  if (status === "inaccessible") {
    return {
      label: "Missing",
    };
  }

  if (status === "notSet") {
    return {
      label: "Not set",
    };
  }

  return {
    label: "Unknown",
  };
}

function SystemInfoCard({
  items,
  mediaPaths = [],
}: {
  items: { label: string; value: string }[];
  mediaPaths?: MediaPathItem[];
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
      <CardTitle title="System Info" icon={Info} />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="text-sm">
            <p className="font-medium text-slate-600">{item.label}</p>
            <p className="mt-1 text-slate-500">{item.value}</p>
          </div>
        ))}
        <MediaPathStatusRows items={mediaPaths} />
      </div>
    </section>
  );
}

function RatingSummaryCard({
  title,
  rating,
}: {
  title: string;
  rating: { label: string; value: number }[];
}) {
  const average = calculateAverageRating(rating);
  const canRenderChart =
    average !== null && rating.length >= 3 && rating.length <= 8;

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
      <CardTitle title={title} icon={Info} />
      {canRenderChart ? (
        <SpiderChart dimensions={rating} average={average} />
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-slate-700">Not rated</p>
          <p className="mt-1 text-xs text-slate-500">
            Rating not available for a readable spider chart.
          </p>
        </div>
      )}
    </section>
  );
}

function SpiderChart({
  dimensions,
  average,
}: {
  dimensions: { label: string; value: number }[];
  average: number;
}) {
  const center = 130;
  const radius = 72;
  const labelRadius = 105;
  const levels = [0.2, 0.4, 0.6, 0.8, 1];
  const dimensionCount = dimensions.length;
  const shapeName = spiderShapeName(dimensionCount);
  const outerPoints = dimensions.map((_, index) =>
    polarPoint(index, dimensionCount, radius, center),
  );
  const scorePoints = dimensions.map((dimension, index) =>
    polarPoint(index, dimensionCount, radius * (dimension.value / 5), center),
  );

  return (
    <div className="mt-4 flex justify-center">
      <svg
        viewBox="0 0 260 260"
        className="aspect-square w-full max-w-[310px]"
        role="img"
        aria-label={`${dimensionCount}-dimension spider chart`}
        data-testid="spider-chart"
        data-dimension-count={dimensionCount}
        data-shape={shapeName}
      >
        {levels.map((level) => (
          <polygon
            key={level}
            points={dimensions
              .map((_, index) =>
                pointString(
                  polarPoint(index, dimensionCount, radius * level, center),
                ),
              )
              .join(" ")}
            fill={level === 1 ? "rgb(255 241 246 / 0.55)" : "none"}
            stroke="rgb(251 207 232)"
            strokeWidth="1"
          />
        ))}
        {outerPoints.map((point, index) => (
          <line
            key={dimensions[index].label}
            x1={center}
            y1={center}
            x2={point.x}
            y2={point.y}
            stroke="rgb(226 232 240)"
            strokeWidth="1"
          />
        ))}
        <polygon
          points={scorePoints.map(pointString).join(" ")}
          fill="rgb(244 114 182 / 0.28)"
          stroke="rgb(244 114 182)"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
        {dimensions.map((dimension, index) => {
          const point = polarPoint(index, dimensionCount, labelRadius, center);
          return (
            <text
              key={dimension.label}
              x={point.x}
              y={point.y}
              textAnchor={labelAnchor(point.x, center)}
              dominantBaseline="middle"
              className="fill-slate-500 text-[10px] font-medium"
            >
              {dimension.label}
            </text>
          );
        })}
        <circle cx={center} cy={center} r="25" fill="white" stroke="rgb(251 207 232)" />
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-slate-900 text-[13px] font-bold"
        >
          {average.toFixed(1)} / 5
        </text>
      </svg>
    </div>
  );
}

function polarPoint(
  index: number,
  total: number,
  radius: number,
  center: number,
) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  };
}

function pointString(point: { x: number; y: number }) {
  return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
}

function labelAnchor(x: number, center: number) {
  if (Math.abs(x - center) < 8) {
    return "middle";
  }

  return x > center ? "start" : "end";
}

function spiderShapeName(dimensionCount: number) {
  const names: Record<number, string> = {
    3: "triangle",
    4: "quadrilateral",
    5: "pentagon",
    6: "hexagon",
    7: "heptagon",
    8: "octagon",
  };

  return names[dimensionCount] ?? "unsupported";
}

function NotesCard({ notes }: { notes: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <CardTitle title="Notes" icon={FileImage} />
      <div className="mt-4 rounded-lg border border-sakura-100 bg-sakura-50/30 px-4 py-3">
        <p className="text-sm leading-6 text-slate-500">{notes}</p>
      </div>
    </section>
  );
}

function RelatedRows({
  sections,
}: {
  sections: DetailSection[];
}) {
  return (
    <section className="grid gap-4">
      {sections.map((section) => (
        <section
          key={section.title}
          className="rounded-lg border border-slate-200 bg-white p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <CardTitle title={section.title} icon={relatedSectionIcon(section.title)} />
          </div>
          <p className="mt-2 text-xs text-slate-500">{section.description}</p>
          {section.relatedPerformers ? (
            <RelatedPerformerSummary section={section} />
          ) : section.relatedCatalogRecords ? (
            <RelatedCatalogSummary section={section} />
          ) : (
            <RelatedEmptyState title={section.title} />
          )}
        </section>
      ))}
    </section>
  );
}

function relatedSectionIcon(title: string) {
  if (title.includes("Image")) {
    return ImageIcon;
  }

  if (title.includes("Video")) {
    return Film;
  }

  return UserRound;
}

function RelatedLiteCard({
  kind,
  item,
  linkTo,
}: {
  kind: "videos" | "images" | "performers";
  item: HomeRecentItem;
  linkTo: string;
}) {
  const [favorite, setFavorite] = useState(item.favorite);
  const currentItem = { ...item, favorite };

  function handleFavoriteClick() {
    const next = !favorite;
    setFavorite(next);

    if (isTauriRuntimeAvailable()) {
      const key = item.key;
      const updateFn =
        kind === "videos" ? updateVideo :
        kind === "images" ? updateImage :
        updatePerformer;
      updateFn(key, { favorite: next }).catch(() => setFavorite(!next));
    }
  }

  if (kind === "performers") {
    return <PerformerLiteCard item={currentItem} linkTo={linkTo} onFavoriteClick={handleFavoriteClick} />;
  }
  if (kind === "images") {
    return <ImageLiteCard item={currentItem} linkTo={linkTo} onFavoriteClick={handleFavoriteClick} />;
  }
  return <VideoLiteCard item={currentItem} linkTo={linkTo} onFavoriteClick={handleFavoriteClick} />;
}

function RelatedCatalogSummary({ section }: { section: DetailSection }) {
  const relatedCatalogRecords = section.relatedCatalogRecords ?? [];
  const emptyText = section.title.includes("Image")
    ? "No related images saved."
    : "No related videos saved.";
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [sortMode, setSortMode] = useState<RelatedSortMode>("new");
  const [pageSize, setPageSize] = useState(12);
  const [page, setPage] = useState(1);
  const hasControls = section.controls === "performer-related";
  const kind = section.title.includes("Image") ? "images" : "videos";

  if (relatedCatalogRecords.length === 0) {
    return <RelatedEmptyState message={emptyText} title={section.title} />;
  }

  const sortedRecords = hasControls
    ? sortRelatedCatalogRecords(relatedCatalogRecords, sortMode)
    : relatedCatalogRecords;
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRecords = hasControls
    ? sortedRecords.slice((safePage - 1) * pageSize, safePage * pageSize)
    : sortedRecords;

  return (
    <>
      {hasControls && (
        <RelatedControls
          itemCount={relatedCatalogRecords.length}
          page={safePage}
          pageSize={pageSize}
          sortMode={sortMode}
          totalPages={totalPages}
          viewMode={viewMode}
          onPageChange={setPage}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
          onSortModeChange={(nextSortMode) => {
            setSortMode(nextSortMode);
            setPage(1);
          }}
          onViewModeChange={(nextViewMode) => {
            setViewMode(nextViewMode);
            setPage(1);
          }}
        />
      )}
      {viewMode === "table" && hasControls ? (
        <PerformerRelatedCatalogTable items={visibleRecords} kind={kind} />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibleRecords.map((record, index) => {
            const liteItem: HomeRecentItem = {
              kind,
              key: record.routeTo?.split("/").pop() ?? `catalog-${index}`,
              title: record.title,
              detail: record.code ?? "",
              typeLabel: kind === "videos" ? "Video" : "Image",
              coverPath: record.coverPath,
              favorite: false,
              code: record.code,
              releaseYear: record.releaseDate?.slice(0, 4),
              rating: record.rating,
              duration: kind === "videos" ? record.metadata : undefined,
              imageCount: kind === "images" ? record.metadata : undefined,
            };

            if (!record.routeTo || record.unresolved) {
              return (
                <div key={`${record.title}-${index}`} className="relative">
                  {record.unresolved && (
                    <span className="absolute left-2 top-2 z-10 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      Unavailable
                    </span>
                  )}
                  <RelatedLiteCard kind={kind} item={liteItem} linkTo={record.routeTo ?? "#"} />
                </div>
              );
            }

            return (
              <RelatedLiteCard
                key={`${record.title}-${index}`}
                kind={kind}
                item={liteItem}
                linkTo={record.routeTo}
              />
            );
          })}
        </div>
      )}
    </>
  );
}

type RelatedSortMode = "az" | "za" | "new" | "old";

function RelatedPerformerSummary({ section }: { section: DetailSection }) {
  const relatedPerformers = section.relatedPerformers ?? [];

  if (relatedPerformers.length === 0) {
    return (
      <RelatedEmptyState
        message="No related performers saved."
        title={section.title}
      />
    );
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {relatedPerformers.map((performer, index) => {
        const liteItem: HomeRecentItem = {
          kind: "performers",
          key: performer.routeTo?.split("/").pop() ?? `performer-${index}`,
          title: performer.name,
          detail: performer.originalName ?? "",
          typeLabel: "Performer",
          coverPath: performer.coverPath,
          favorite: false,
          aliases: performer.aliases,
          rating: performer.rating,
          filmographyCount: performer.filmographyCount,
          pictorialsCount: performer.pictorialsCount,
        };

        if (!performer.routeTo || performer.unresolved) {
          return (
            <div key={`${performer.name}-${index}`} className="relative">
              {performer.unresolved && (
                <span className="absolute left-2 top-2 z-10 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Unavailable
                </span>
              )}
              <RelatedLiteCard kind="performers" item={liteItem} linkTo={performer.routeTo ?? "#"} />
            </div>
          );
        }

        return (
          <RelatedLiteCard
            key={`${performer.name}-${index}`}
            kind="performers"
            item={liteItem}
            linkTo={performer.routeTo}
          />
        );
      })}
    </div>
  );
}

function RelatedCatalogCard({
  item,
  icon,
}: {
  item: NonNullable<DetailSection["relatedCatalogRecords"]>[number];
  icon: typeof Info;
}) {
  const isImage = icon === ImageIcon;
  const content = (
    <article className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm shadow-slate-950/[0.02]">
      <RelatedWideThumbnail
        aspectClass="aspect-square"
        icon={icon}
        label={isImage ? "Related image cover" : "Related video cover"}
        path={item.coverPath}
      />
      <div className="space-y-2 px-1 pb-1 pt-2.5">
        {item.unresolved && <Chip label="Unavailable" tone="orange" />}
        <p className="min-h-9 min-w-0 line-clamp-2 text-sm font-semibold leading-snug text-slate-950">
          {dashDetailText(item.title)}
        </p>
        <DetailSplitRow
          left={dashDetailText(item.code)}
          right={dashDetailText(item.metadata)}
        />
        <DetailSplitRow
          left={cardReleaseYearLabel(item.releaseDate)}
          right={<RatingPill rating={item.rating} />}
        />
      </div>
    </article>
  );

  if (!item.routeTo || item.unresolved) {
    return content;
  }

  return (
    <Link
      to={item.routeTo}
      className="block rounded-lg transition hover:border-sakura-200 hover:shadow-sm"
    >
      {content}
    </Link>
  );
}

function RelatedPerformerCard({
  item,
}: {
  item: NonNullable<DetailSection["relatedPerformers"]>[number];
}) {
  const content = (
    <article className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm shadow-slate-950/[0.02]">
      <RelatedWideThumbnail
        aspectClass="aspect-square"
        icon={UserRound}
        label="Related performer"
        path={item.coverPath}
      />
      <div className="space-y-2 px-1 pb-1 pt-2.5">
        {item.unresolved && <Chip label="Unavailable" tone="orange" />}
        <p className="min-h-9 min-w-0 line-clamp-2 text-sm font-semibold leading-snug text-slate-950">
          {dashDetailText(item.name)}
        </p>
        <DetailAliasChipList aliases={item.aliases} />
        <div className="grid min-h-7 grid-cols-3 items-center gap-2 text-xs font-semibold text-slate-600">
          <DetailIconStat icon={Clapperboard} label={dashDetailText(item.filmographyCount)} />
          <DetailIconStat icon={ImageIcon} label={dashDetailText(item.pictorialsCount)} />
          <RatingPill rating={item.rating} />
        </div>
      </div>
    </article>
  );

  if (!item.routeTo || item.unresolved) {
    return content;
  }

  return (
    <Link
      to={item.routeTo}
      className="block rounded-lg transition hover:border-sakura-200 hover:shadow-sm"
    >
      {content}
    </Link>
  );
}

function PerformerRelatedCatalogCard({
  item,
  kind,
}: {
  item: NonNullable<DetailSection["relatedCatalogRecords"]>[number];
  kind: "videos" | "images";
}) {
  const content = (
    <article className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm shadow-slate-950/[0.02]">
      <RelatedWideThumbnail
        aspectClass="aspect-square"
        icon={kind === "videos" ? Film : ImageIcon}
        label={kind === "videos" ? "Related video cover" : "Related image cover"}
        path={item.coverPath}
      />
      <div className="space-y-2 px-1 pb-1 pt-2.5">
        {item.unresolved && <Chip label="Unavailable" tone="orange" />}
        <p className="min-h-9 min-w-0 line-clamp-2 text-sm font-semibold leading-snug text-slate-950">
          {dashDetailText(item.title)}
        </p>
        <DetailSplitRow
          left={dashDetailText(item.code)}
          right={dashDetailText(item.metadata)}
        />
        <DetailSplitRow
          left={cardReleaseYearLabel(item.releaseDate)}
          right={<RatingPill rating={item.rating} />}
        />
      </div>
    </article>
  );

  if (!item.routeTo || item.unresolved) {
    return content;
  }

  return (
    <Link
      to={item.routeTo}
      className="block rounded-lg transition hover:border-sakura-200 hover:shadow-sm"
    >
      {content}
    </Link>
  );
}

function RatingPill({ rating }: { rating?: number | null }) {
  const label =
    typeof rating === "number" && Number.isFinite(rating)
      ? rating.toFixed(1)
      : "-";

  return (
    <span
      aria-label={`Rating ${label}`}
      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-sakura-100 bg-sakura-50 px-2 py-1 text-xs font-semibold text-sakura-600"
    >
      <Star size={13} fill="currentColor" />
      {label}
    </span>
  );
}

function DetailSplitRow({
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

function DetailIconStat({
  icon: Icon,
  label,
}: {
  icon: typeof Clapperboard;
  label: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center justify-center gap-1.5">
      <Icon size={14} className="shrink-0 text-slate-400" />
      <span className="truncate">{dashDetailText(label)}</span>
    </span>
  );
}

function DetailAliasChipList({ aliases }: { aliases?: string }) {
  const aliasList = splitDetailChips(aliases);
  const visibleAliases = aliasList.slice(0, 2);
  const hiddenCount = Math.max(0, aliasList.length - visibleAliases.length);

  return (
    <div className="flex min-h-7 min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
      {visibleAliases.length > 0 ? (
        visibleAliases.map((alias) => <DetailAliasChip key={alias} label={alias} />)
      ) : (
        <DetailAliasChip label="-" />
      )}
      {hiddenCount > 0 && <DetailAliasChip label={`+${hiddenCount}`} />}
    </div>
  );
}

function DetailAliasChip({ label }: { label: string }) {
  return (
    <span className="inline-flex max-w-full min-w-0 shrink rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500">
      <span className="truncate">{dashDetailText(label)}</span>
    </span>
  );
}

function DetailMeta({
  icon: Icon,
  label,
}: {
  icon: typeof Calendar;
  label: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon size={14} className="shrink-0 text-slate-400" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function RelatedControls({
  itemCount,
  page,
  pageSize,
  sortMode,
  totalPages,
  viewMode,
  onPageChange,
  onPageSizeChange,
  onSortModeChange,
  onViewModeChange,
}: {
  itemCount: number;
  page: number;
  pageSize: number;
  sortMode: RelatedSortMode;
  totalPages: number;
  viewMode: "card" | "table";
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortModeChange: (sortMode: RelatedSortMode) => void;
  onViewModeChange: (viewMode: "card" | "table") => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
      <p className="text-xs font-semibold text-slate-500">
        {itemCount} {itemCount === 1 ? "item" : "items"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onViewModeChange("card")}
          className={`h-9 rounded-lg px-3 text-xs font-semibold ${
            viewMode === "card"
              ? "bg-sakura-500 text-white"
              : "border border-slate-200 bg-white text-slate-700"
          }`}
        >
          Card
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange("table")}
          className={`h-9 rounded-lg px-3 text-xs font-semibold ${
            viewMode === "table"
              ? "bg-sakura-500 text-white"
              : "border border-slate-200 bg-white text-slate-700"
          }`}
        >
          Table
        </button>
        <label className="text-xs font-semibold text-slate-500">
          Sort
          <select
            className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700"
            value={sortMode}
            onChange={(event) =>
              onSortModeChange(event.target.value as RelatedSortMode)
            }
          >
            <option value="az">A-Z</option>
            <option value="za">Z-A</option>
            <option value="new">New Release</option>
            <option value="old">Old Release</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Per page
          <select
            aria-label="Per page"
            className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[12, 24, 48, 96].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-xs font-semibold text-slate-500">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function RelatedCatalogTable({
  items,
  kind,
}: {
  items: NonNullable<DetailSection["relatedCatalogRecords"]>;
  kind: "videos" | "images";
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-normal text-slate-500">
          <tr>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Release Date</th>
            <th className="px-4 py-3">
              {kind === "images" ? "Total" : "Duration"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {items.map((item, index) => (
            <tr key={`${item.title}-${index}`}>
              <td className="px-4 py-3 font-semibold text-slate-900">
                {item.routeTo && !item.unresolved ? (
                  <Link to={item.routeTo} className="hover:text-sakura-600">
                    {item.title}
                  </Link>
                ) : (
                  item.title
                )}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {item.releaseDate || "Not set"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {item.metadata || "Not available"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerformerRelatedCatalogTable({
  items,
  kind,
}: {
  items: NonNullable<DetailSection["relatedCatalogRecords"]>;
  kind: "videos" | "images";
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-normal text-slate-500">
          <tr>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Publisher / Label</th>
            <th className="px-4 py-3">Release Year</th>
            <th className="px-4 py-3">
              {kind === "images" ? "Images Total" : "Duration"}
            </th>
            <th className="px-4 py-3">Rating</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {items.map((item, index) => (
            <tr key={`${item.title}-${index}`}>
              <td className="px-4 py-3 font-semibold text-slate-900">
                {item.title}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {item.publisherLabel || "Not set"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {releaseYearLabel(item.releaseDate)}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {item.metadata || "Not set"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {typeof item.rating === "number" && Number.isFinite(item.rating)
                  ? item.rating.toFixed(1)
                  : "Not rated"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {item.routeTo && !item.unresolved ? (
                  <Link
                    to={item.routeTo}
                    className="text-xs font-semibold text-sakura-600 hover:text-sakura-700"
                  >
                    View
                  </Link>
                ) : (
                  "Unavailable"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function sortRelatedCatalogRecords(
  items: NonNullable<DetailSection["relatedCatalogRecords"]>,
  sortMode: RelatedSortMode,
) {
  return items
    .map((item, index) => ({
      item,
      index,
      title: item.title.toLocaleLowerCase(),
      time: releaseDateTime(item.releaseDate),
    }))
    .sort((a, b) => {
      if (sortMode === "az" || sortMode === "za") {
        const titleComparison = a.title.localeCompare(b.title);
        if (titleComparison !== 0) {
          return sortMode === "az" ? titleComparison : -titleComparison;
        }

        return a.index - b.index;
      }

      const aMissing = a.time === null;
      const bMissing = b.time === null;
      if (aMissing !== bMissing) {
        return aMissing ? 1 : -1;
      }

      if (a.time !== b.time) {
        return sortMode === "new"
          ? (b.time ?? 0) - (a.time ?? 0)
          : (a.time ?? 0) - (b.time ?? 0);
      }

      return a.index - b.index;
    })
    .map(({ item }) => item);
}

function releaseDateTime(value: string | undefined) {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function releaseYearLabel(value: string | undefined) {
  if (!value) {
    return "Not set";
  }

  const match = /^(\d{4})/.exec(value.trim());
  return match?.[1] ?? "Not set";
}

function cardReleaseYearLabel(value: string | undefined) {
  if (!value) {
    return "-";
  }

  const match = /^(\d{4})/.exec(value.trim());
  return match?.[1] ?? "-";
}

function dashDetailText(value: string | number | null | undefined) {
  const label = typeof value === "number" ? String(value) : value?.trim();
  if (
    !label ||
    label === "No aliases" ||
    label === "No code" ||
    label === "Not set" ||
    label === "Not rated" ||
    label === "Duration not set" ||
    label === "Images not set" ||
    label === "Unknown"
  ) {
    return "-";
  }

  return label;
}

function splitDetailChips(value: string | null | undefined) {
  const label = dashDetailText(value);
  if (label === "-") {
    return [];
  }

  return label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function RelatedThumbnail({
  icon: Icon,
  label,
  path,
}: {
  icon: typeof Info;
  label: string;
  path?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const assetSrc = localImagePathToAssetSrc(path);
  const showImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [assetSrc, mediaAssetScopeReady]);

  return (
    <div
      className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-slate-400"
      aria-label={showImage ? undefined : label}
    >
      {showImage ? (
        <img
          src={assetSrc ?? undefined}
          alt={label}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Icon size={24} strokeWidth={1.7} />
      )}
    </div>
  );
}

function RelatedWideThumbnail({
  aspectClass,
  icon: _Icon,
  label,
  path,
}: {
  aspectClass: string;
  icon: typeof Info;
  label: string;
  path?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const assetSrc = localImagePathToAssetSrc(path);
  const showImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [assetSrc, mediaAssetScopeReady]);

  return (
    <div
      className={`${aspectClass} relative flex w-full items-center justify-center overflow-hidden rounded-md bg-white`}
      aria-label={showImage ? undefined : label}
    >
      {showImage ? (
        <img
          src={assetSrc ?? undefined}
          alt={label}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <ContentThumbnailPlaceholder />
      )}
    </div>
  );
}

function RelatedEmptyState({
  title,
  message,
}: {
  title: string;
  message?: string;
}) {
  const fallbackMessage =
    message ??
    (title.includes("Image")
      ? "No related images saved."
      : title.includes("Video")
        ? "No related videos saved."
        : "No related performers saved.");

  return (
    <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4">
      <p className="text-sm font-medium text-slate-500">{fallbackMessage}</p>
    </div>
  );
}

const GALLERY_BATCH_SIZE = 16;
const GALLERY_CONTROLS_IDLE_DELAY_MS = 2000;
const MIN_GALLERY_ZOOM = 0.5;
const MAX_GALLERY_ZOOM = 3;
const GALLERY_ZOOM_STEP = 0.25;

function GalleryGrid({ paths }: { paths: string[] }) {
  const [visibleCount, setVisibleCount] = useState(GALLERY_BATCH_SIZE);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const visiblePaths = paths.slice(0, visibleCount);
  const canLoadMore = visibleCount < paths.length;

  useEffect(() => {
    setVisibleCount(GALLERY_BATCH_SIZE);
    setViewerIndex(null);
  }, [paths]);

  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle title="Gallery" icon={ImageIcon} />
          {paths.length > 0 && (
            <p className="text-xs font-medium text-slate-500">
              Showing {visiblePaths.length} of {paths.length} images
            </p>
          )}
        </div>
        {paths.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">
            No Gallery Images saved.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
              {visiblePaths.map((path, index) => (
                <GalleryImageTile
                  key={`${path}-${index}`}
                  path={path}
                  label={`Gallery image ${index + 1}`}
                  onPreview={() => setViewerIndex(index)}
                />
              ))}
            </div>
            {canLoadMore && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((current) => current + GALLERY_BATCH_SIZE)
                  }
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600"
                >
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </section>
      {viewerIndex !== null && paths[viewerIndex] && (
        <GalleryViewer
          initialIndex={viewerIndex}
          paths={paths}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
}

function GalleryImageTile({
  path,
  label,
  onPreview,
}: {
  path: string;
  label: string;
  onPreview: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const assetSrc = localImagePathToAssetSrc(path);
  const showImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [assetSrc, mediaAssetScopeReady]);

  return (
    <div
      className="relative aspect-square overflow-hidden rounded-lg bg-gradient-to-br from-slate-100 via-white to-sakura-50"
      role={showImage ? undefined : "img"}
      aria-label={showImage ? undefined : label}
    >
      {showImage ? (
        <button
          type="button"
          aria-label={`Preview ${label}`}
          className="absolute inset-0 cursor-zoom-in overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 focus-visible:ring-offset-2"
          onClick={onPreview}
        >
          <img
            src={assetSrc ?? undefined}
            alt={label}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        </button>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-300">
          <ImageIcon size={28} />
          <span className="text-xs font-medium text-slate-400">
            Image unavailable
          </span>
        </div>
      )}
    </div>
  );
}

function GalleryViewer({
  initialIndex,
  paths,
  onClose,
}: {
  initialIndex: number;
  paths: string[];
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageFailed, setImageFailed] = useState(false);
  const [isFitMode, setIsFitMode] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const hideControlsTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(
    null,
  );
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const path = paths[currentIndex] ?? "";
  const assetSrc = localImagePathToAssetSrc(path);
  const canShowImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < paths.length - 1;
  const zoomLabel = isFitMode ? "Fit" : `${Math.round(zoom * 100)}%`;
  const isFullscreenActive = isBrowserFullscreen || isExpanded;
  const controlsVisibilityClass = controlsVisible
    ? "opacity-100"
    : "pointer-events-none opacity-0";
  const overlayPillClass =
    "bg-white/85 text-slate-800 shadow-lg shadow-slate-950/10 ring-1 ring-sakura-100/80 backdrop-blur-md";
  const overlayButtonBaseClass =
    "inline-flex items-center justify-center rounded-full bg-white/85 text-slate-700 shadow-lg shadow-slate-950/10 ring-1 ring-sakura-100/80 backdrop-blur-md transition hover:bg-sakura-50 hover:text-sakura-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 disabled:cursor-not-allowed disabled:opacity-45";
  const overlayToggleClass =
    "inline-flex h-9 items-center justify-center rounded-full px-3 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300";
  const activeToggleClass = "bg-sakura-500 text-white shadow-sm";
  const inactiveToggleClass = "bg-white/70 text-slate-700 hover:bg-sakura-50 hover:text-sakura-600";

  function clearHideControlsTimer() {
    if (hideControlsTimerRef.current) {
      window.clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
  }

  function scheduleHideControls() {
    clearHideControlsTimer();
    hideControlsTimerRef.current = window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (
        viewerRef.current &&
        activeElement instanceof HTMLElement &&
        viewerRef.current.contains(activeElement) &&
        activeElement !== viewerRef.current
      ) {
        scheduleHideControls();
        return;
      }

      setControlsVisible(false);
    }, GALLERY_CONTROLS_IDLE_DELAY_MS);
  }

  function showControlsAndResetIdleTimer() {
    setControlsVisible(true);
    scheduleHideControls();
  }

  async function closeViewer() {
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        // Closing the viewer should still work if the browser denies exit.
      }
    }

    setIsExpanded(false);
    onClose();
  }

  function goToIndex(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= paths.length) {
      return;
    }

    setCurrentIndex(nextIndex);
    setImageFailed(false);
    setIsFitMode(true);
    setZoom(1);
    showControlsAndResetIdleTimer();
  }

  function zoomIn() {
    showControlsAndResetIdleTimer();
    setIsFitMode(false);
    setZoom((current) => Math.min(MAX_GALLERY_ZOOM, current + GALLERY_ZOOM_STEP));
  }

  function zoomOut() {
    showControlsAndResetIdleTimer();
    setIsFitMode(false);
    setZoom((current) => Math.max(MIN_GALLERY_ZOOM, current - GALLERY_ZOOM_STEP));
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
        setIsExpanded(false);
      } catch {
        setIsExpanded(false);
      }
      return;
    }

    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    if (document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
        return;
      } catch {
        setIsExpanded(true);
        return;
      }
    }

    setIsExpanded(true);
  }

  useEffect(() => {
    scheduleHideControls();
    return clearHideControlsTimer;
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      showControlsAndResetIdleTimer();

      if (event.key === "Escape") {
        if (document.fullscreenElement) {
          return;
        }

        if (isExpanded) {
          setIsExpanded(false);
          return;
        }

        void closeViewer();
        return;
      }

      if (event.key === "ArrowLeft") {
        goToIndex(currentIndex - 1);
        return;
      }

      if (event.key === "ArrowRight") {
        goToIndex(currentIndex + 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, isExpanded, onClose, paths.length]);

  useEffect(() => {
    function syncFullscreenState() {
      setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    syncFullscreenState();
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gallery full-size viewer"
      ref={viewerRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 m-0 h-screen w-screen overflow-hidden bg-slate-950 text-white"
      onMouseMove={showControlsAndResetIdleTimer}
      onMouseEnter={showControlsAndResetIdleTimer}
      onPointerDown={showControlsAndResetIdleTimer}
      onFocusCapture={showControlsAndResetIdleTimer}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          void closeViewer();
        }
      }}
    >
        <div
          className={`pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-5.5rem)] flex-wrap items-center gap-2 transition-opacity duration-300 sm:left-4 sm:top-4 ${controlsVisibilityClass}`}
        >
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${overlayPillClass}`}>
            {currentIndex + 1} / {paths.length}
          </span>
          <span className={`max-w-[52vw] truncate rounded-full px-3 py-1 text-xs font-medium ${overlayPillClass}`}>
            {fileNameFromPath(path) || "Gallery image"}
          </span>
        </div>

        <button
          type="button"
          aria-label="Close gallery viewer"
          onClick={() => void closeViewer()}
          className={`absolute right-3 top-3 z-20 h-10 w-10 transition-opacity duration-300 sm:right-4 sm:top-4 ${overlayButtonBaseClass} ${controlsVisibilityClass}`}
        >
          <X size={18} />
        </button>

        {canGoPrevious && (
          <button
            type="button"
            aria-label="Previous gallery image"
            onClick={() => goToIndex(currentIndex - 1)}
            className={`absolute left-3 top-1/2 z-20 h-11 w-11 -translate-y-1/2 transition-opacity duration-300 sm:left-4 ${overlayButtonBaseClass} ${controlsVisibilityClass}`}
          >
            <ArrowLeft size={22} />
          </button>
        )}

        {canGoNext && (
          <button
            type="button"
            aria-label="Next gallery image"
            onClick={() => goToIndex(currentIndex + 1)}
            className={`absolute right-3 top-1/2 z-20 h-11 w-11 -translate-y-1/2 transition-opacity duration-300 sm:right-4 ${overlayButtonBaseClass} ${controlsVisibilityClass}`}
          >
            <ArrowRight size={22} />
          </button>
        )}

        <div className="absolute inset-0 h-full w-full overflow-auto">
          <div className="flex min-h-full min-w-full items-center justify-center">
            {canShowImage && assetSrc ? (
              <img
                src={assetSrc}
                alt={`Gallery image ${currentIndex + 1} full size`}
                className={isFitMode ? "block max-h-screen max-w-full object-contain" : "block"}
                style={
                  isFitMode
                    ? undefined
                    : {
                        maxWidth: "none",
                        width: `${zoom * 100}%`,
                        height: "auto",
                      }
                }
                onError={() => setImageFailed(true)}
              />
            ) : (
              <div
                role="img"
                aria-label={`Gallery image ${currentIndex + 1} unavailable`}
                className="flex min-h-52 min-w-64 flex-col items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 px-8 py-10 text-center text-slate-300"
              >
                <ImageIcon size={42} />
                <p className="text-sm font-semibold">Image unavailable</p>
              </div>
            )}
          </div>
        </div>

        <div
          className={`absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full bg-white/85 px-2 py-2 text-slate-700 shadow-lg shadow-slate-950/10 ring-1 ring-sakura-100/80 backdrop-blur-md transition-opacity duration-300 sm:bottom-4 ${controlsVisibilityClass}`}
        >
          <button
            type="button"
            onClick={() => {
              setIsFitMode(true);
              setZoom(1);
            }}
            aria-label="Fit gallery image"
            className={`${overlayToggleClass} ${
              isFitMode
                ? activeToggleClass
                : inactiveToggleClass
            }`}
          >
            Fit
          </button>
          <button
            type="button"
            onClick={() => {
              setIsFitMode(false);
              setZoom(1);
            }}
            aria-label="Show gallery image at 100 percent"
            className={`${overlayToggleClass} ${
              !isFitMode && zoom === 1
                ? activeToggleClass
                : inactiveToggleClass
            }`}
          >
            100%
          </button>
          <button
            type="button"
            onClick={zoomOut}
            disabled={!isFitMode && zoom <= MIN_GALLERY_ZOOM}
            aria-label="Zoom out gallery image"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-slate-700 transition hover:bg-sakura-50 hover:text-sakura-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Minus size={16} />
          </button>
          <span className="min-w-12 text-center text-xs font-semibold text-slate-700">
            {zoomLabel}
          </span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={!isFitMode && zoom >= MAX_GALLERY_ZOOM}
            aria-label="Zoom in gallery image"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-slate-700 transition hover:bg-sakura-50 hover:text-sakura-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={
              isFullscreenActive
                ? "Exit fullscreen gallery mode"
                : "Enter fullscreen gallery mode"
            }
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-slate-700 transition hover:bg-sakura-50 hover:text-sakura-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300"
          >
            {isFullscreenActive ? (
              <Minimize2 size={16} />
            ) : (
              <Maximize2 size={16} />
            )}
          </button>
        </div>
    </div>
  );
}

function fileNameFromPath(path: string) {
  const normalized = path.trim().replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function CardTitle({
  title,
  icon: Icon,
}: {
  title: string;
  icon: typeof Info;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={18} className="text-sakura-500" />
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
    </div>
  );
}

function LabelBlock({ title, labels }: { title: string; labels: string[] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {labels.map((label) => (
          <Chip key={label} label={label} tone="pinkSoft" />
        ))}
      </div>
    </div>
  );
}

function Chip({
  label,
  tone,
  icon: Icon,
}: {
  label: string;
  tone: "green" | "orange" | "pink" | "pinkSoft" | "neutral";
  icon?: typeof Heart;
}) {
  const toneClass = {
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    orange: "border-orange-100 bg-orange-50 text-orange-600",
    pink: "border-sakura-100 bg-sakura-50 text-sakura-600",
    pinkSoft: "border-sakura-100 bg-sakura-50/70 text-sakura-600",
    neutral: "border-slate-200 bg-slate-100 text-slate-600",
  }[tone];

  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${toneClass}`}
    >
      {Icon && <Icon size={14} fill="currentColor" />}
      <span className="min-w-0 truncate whitespace-nowrap">{label}</span>
    </span>
  );
}

function Divider() {
  return <div className="my-5 border-t border-dashed border-slate-200" />;
}

export default DetailPage;
