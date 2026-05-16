import {
  ArrowLeft,
  Calendar,
  Clapperboard,
  Edit3,
  FileImage,
  Film,
  Folder,
  Heart,
  Image as ImageIcon,
  Info,
  Play,
  Ruler,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
  DetailConfig,
  DetailSection,
  MediaPathItem,
  PerformerDetailConfig,
} from "../lib/detailData";
import { localImagePathToAssetSrc } from "../runtime/localAsset";
import { openMediaPath } from "../runtime/mediaOpenCommands";
import { useMediaAssetScopeReady } from "../runtime/MediaAssetScopeContext";
import {
  checkPathStatus,
  type PathKind,
  type PathStatusKind,
  type PathStatusResult,
} from "../runtime/pathStatusCommands";

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
  return (
    <div className="space-y-5">
      <DetailHeader config={config} deleteAction={deleteAction} />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.9fr)_1.1fr]">
          <LargePlaceholder config={config} />
          <CatalogIdentity config={config} />
        </div>
      </section>

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

      <MediaPathStatusCard items={config.mediaPaths} />
      <NotesCard notes={config.notes} />
      <RelatedRows sections={config.relatedSections} />

      {config.kind === "images" && (
        <GalleryGrid paths={config.galleryImagePaths} />
      )}
      <SystemInfoCard items={config.systemInfo} />
    </div>
  );
}

function CatalogIdentity({ config }: DetailPageProps) {
  return (
    <div className="flex min-h-full flex-col justify-start py-2">
      <h2 className="text-2xl font-semibold tracking-normal text-slate-950">
        {config.displayTitle}
      </h2>
      <p className="mt-2 text-base text-slate-500">{config.originalTitle}</p>

      {"code" in config && (
        <div className="mt-4">
          <Chip label={config.code} tone="neutral" />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <Chip label="Favorite" icon={Heart} tone="pink" />
        {config.chips.map((chip) => (
          <Chip
            key={chip}
            label={chip}
            tone={chip === "Owned" || chip === "Active" ? "green" : "orange"}
          />
        ))}
      </div>

      <div className="mt-6 border-t border-slate-100 pt-4">
        <p className="text-sm font-semibold text-slate-800">Categories:</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {config.categories.map((category) => (
            <Chip key={category} label={category} tone="pinkSoft" />
          ))}
        </div>
      </div>
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
          <MediaPathStatusCard items={config.mediaPaths} />
          <RatingSummaryCard title={config.ratingTitle} rating={config.rating} />
          <section className="grid gap-5 lg:grid-cols-2">
            <RowsCard title="Personal" icon={UserRound} items={config.personal} />
            <RowsCard title="Physical" icon={Ruler} items={config.physical} />
          </section>
          <NotesCard notes={config.notes} />
        </div>
      </div>

      <RelatedRows sections={config.relatedSections} />
      <SystemInfoCard items={config.systemInfo} />
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

      <div className="mt-5">
        <h2 className="text-2xl font-semibold tracking-normal text-slate-950">
          {config.displayTitle}
        </h2>
        <p className="mt-2 text-sm text-slate-500">{config.originalTitle}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {config.chips.map((chip) => (
          <Chip
            key={chip}
            label={chip}
            tone={chip === "Active" ? "green" : "orange"}
          />
        ))}
        {config.favorite && <Chip label="Favorite" icon={Heart} tone="pink" />}
      </div>

      <Divider />
      <LabelBlock title="Aliases" labels={config.aliases} />
      <Divider />
      <LabelBlock title="Categories" labels={config.categories} />
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
              <p className="mt-1 text-xl font-semibold text-slate-950">
                {item.value}
              </p>
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
          Read-only placeholder
        </p>
      )}
    </section>
  );
}

type PathStatusState = PathStatusResult & {
  label: string;
  playable?: boolean;
};

function MediaPathStatusCard({ items }: { items: MediaPathItem[] }) {
  const [statuses, setStatuses] = useState<PathStatusState[]>(() =>
    initialPathStatuses(items),
  );
  const [openingLabel, setOpeningLabel] = useState<string | null>(null);
  const [playFeedback, setPlayFeedback] = useState<{
    label: string;
    message: string;
    tone: "success" | "error";
  } | null>(null);

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

  async function handlePlay(status: PathStatusState) {
    if (status.status !== "exists" || openingLabel) {
      return;
    }

    setOpeningLabel(status.label);
    setPlayFeedback(null);

    try {
      const result = await openMediaPath(status.path);
      setPlayFeedback({
        label: status.label,
        message: result.opened
          ? "Opening with default app."
          : result.message || "Media file could not be opened.",
        tone: result.opened ? "success" : "error",
      });
    } catch {
      setPlayFeedback({
        label: status.label,
        message: "Media file could not be opened.",
        tone: "error",
      });
    } finally {
      setOpeningLabel(null);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <CardTitle title="Media File Status" icon={Folder} />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {statuses.map((status) => {
          const display = pathStatusDisplay(status.status, status.kind);

          return (
            <div
              key={status.label}
              className={`rounded-lg border px-3 py-3 ${display.containerClass}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">
                  {status.label}
                </p>
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${display.badgeClass}`}
                >
                  {display.label}
                </span>
              </div>
              <p className="mt-2 text-xs font-medium text-slate-500">
                {display.detail}
              </p>
              {status.message && status.message !== display.detail && (
                <p className="mt-1 text-xs text-slate-400">{status.message}</p>
              )}
              {status.playable && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePlay(status)}
                    disabled={status.status !== "exists" || openingLabel !== null}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Play size={14} fill="currentColor" />
                    {openingLabel === status.label ? "Opening..." : "Play"}
                  </button>
                  {playFeedback?.label === status.label && (
                    <span
                      className={`text-xs font-medium ${
                        playFeedback.tone === "success"
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {playFeedback.message}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
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

function pathStatusDisplay(status: PathStatusKind, kind: PathKind) {
  if (status === "exists") {
    return {
      label: "Exists",
      detail:
        kind === "folder"
          ? "Folder path found"
          : kind === "file"
            ? "File path found"
            : "Path found",
      badgeClass: "border-emerald-100 bg-emerald-50 text-emerald-700",
      containerClass: "border-emerald-100 bg-emerald-50/30",
    };
  }

  if (status === "missing") {
    return {
      label: "Missing",
      detail: "Saved path was not found",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
      containerClass: "border-amber-200 bg-amber-50/40",
    };
  }

  if (status === "inaccessible") {
    return {
      label: "Inaccessible",
      detail: "Path cannot be accessed",
      badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
      containerClass: "border-rose-200 bg-rose-50/40",
    };
  }

  if (status === "notSet") {
    return {
      label: "Not Set",
      detail: "No path saved",
      badgeClass: "border-slate-200 bg-slate-100 text-slate-600",
      containerClass: "border-slate-200 bg-slate-50/70",
    };
  }

  return {
    label: "Unknown",
    detail: "Not checked",
    badgeClass: "border-slate-200 bg-white text-slate-600",
    containerClass: "border-slate-200 bg-white",
  };
}

function SystemInfoCard({
  items,
}: {
  items: { label: string; value: string }[];
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
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
      <CardTitle title={title} icon={Star} />
      <div className="mt-4 grid gap-6 [@media(min-width:1800px)]:grid-cols-[minmax(0,1fr)_260px] [@media(min-width:1800px)]:gap-8">
        <RadarPlaceholder rating={rating} />
        <div className="min-w-0 space-y-3 [@media(min-width:1800px)]:order-first">
          {rating.map((axis) => (
            <div
              key={axis.label}
              className="grid grid-cols-[minmax(0,1fr)_3rem_7rem] items-center gap-3 text-sm"
            >
              <span className="min-w-0 break-words font-medium leading-5 text-slate-700">
                {axis.label}
              </span>
              <span className="shrink-0 text-right text-slate-600">
                {axis.value.toFixed(1)}
              </span>
              <Stars value={axis.value} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RadarPlaceholder({
  rating,
}: {
  rating: { label: string; value: number }[];
}) {
  const labels = rating.slice(0, 6);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[230px]">
      <div className="absolute inset-8 rounded-full border border-sakura-100 bg-sakura-50/45" />
      <div className="absolute inset-14 rounded-full border border-sakura-100" />
      <div className="absolute inset-[4.5rem] rounded-full border border-sakura-100" />
      <div
        className="absolute inset-11 bg-sakura-300/35"
        style={{
          clipPath:
            "polygon(50% 0%, 82% 20%, 83% 72%, 50% 94%, 18% 76%, 17% 24%)",
        }}
      />
      <div
        className="absolute inset-11 border-2 border-sakura-400"
        style={{
          clipPath:
            "polygon(50% 0%, 82% 20%, 83% 72%, 50% 94%, 18% 76%, 17% 24%)",
        }}
      />
      {labels.map((axis, index) => (
        <span
          key={axis.label}
          className={[
            "absolute text-[11px] font-medium text-slate-500",
            radarLabelClass(index),
          ].join(" ")}
        >
          {axis.label}
        </span>
      ))}
    </div>
  );
}

function radarLabelClass(index: number) {
  const classes = [
    "left-1/2 top-0 -translate-x-1/2",
    "right-0 top-1/4",
    "right-1 bottom-1/4",
    "bottom-0 left-1/2 -translate-x-1/2",
    "bottom-1/4 left-0",
    "left-0 top-1/4",
  ];

  return classes[index] ?? "";
}

function Stars({ value }: { value: number }) {
  return (
    <span
      className="flex shrink-0 justify-end gap-1 text-sakura-500"
      aria-label={`${value}/5`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={15}
          fill={index + 1 <= Math.round(value) ? "currentColor" : "none"}
          className={index + 1 <= Math.round(value) ? "" : "text-slate-300"}
        />
      ))}
    </span>
  );
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
    <section className="space-y-3">
      {sections.map((section) => (
        <div
          key={section.title}
          className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-4"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-400">
            {section.title.includes("Image") ? (
              <ImageIcon size={17} />
            ) : section.title.includes("Video") ? (
              <Film size={17} />
            ) : (
              <UserRound size={17} />
            )}
          </div>
          <p className="min-w-[150px] text-sm font-semibold text-slate-800">
            {section.title}
          </p>
          {section.relatedPerformers ? (
            <RelatedPerformerSummary section={section} />
          ) : section.relatedCatalogRecords ? (
            <RelatedCatalogSummary section={section} />
          ) : (
            <p className="text-sm text-slate-500">{section.description}</p>
          )}
        </div>
      ))}
    </section>
  );
}

function RelatedCatalogSummary({ section }: { section: DetailSection }) {
  const relatedCatalogRecords = section.relatedCatalogRecords ?? [];
  const emptyText = section.title.includes("Image")
    ? "No related Images saved."
    : "No related Videos saved.";

  if (relatedCatalogRecords.length === 0) {
    return <p className="text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap gap-2">
      {relatedCatalogRecords.map((record, index) => (
        <span
          key={`${record.title}-${index}`}
          className={`inline-flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
            record.unresolved
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-sakura-100 bg-sakura-50 text-sakura-600"
          }`}
        >
          <span className="min-w-0 break-words">{record.title}</span>
          {record.originalTitle && (
            <span className="font-medium text-slate-500">
              {record.originalTitle}
            </span>
          )}
          {record.unresolved && (
            <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] uppercase tracking-normal">
              Unresolved
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function RelatedPerformerSummary({ section }: { section: DetailSection }) {
  const relatedPerformers = section.relatedPerformers ?? [];

  if (relatedPerformers.length === 0) {
    return <p className="text-sm text-slate-500">No related Performers saved.</p>;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap gap-2">
      {relatedPerformers.map((performer, index) => (
        <span
          key={`${performer.name}-${index}`}
          className={`inline-flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
            performer.unresolved
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-sakura-100 bg-sakura-50 text-sakura-600"
          }`}
        >
          <span className="min-w-0 break-words">{performer.name}</span>
          {performer.originalName && (
            <span className="font-medium text-slate-500">
              {performer.originalName}
            </span>
          )}
          {performer.unresolved && (
            <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] uppercase tracking-normal">
              Unresolved
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

const GALLERY_BATCH_SIZE = 24;

function GalleryGrid({ paths }: { paths: string[] }) {
  const [visibleCount, setVisibleCount] = useState(GALLERY_BATCH_SIZE);
  const visiblePaths = paths.slice(0, visibleCount);
  const canLoadMore = visibleCount < paths.length;

  useEffect(() => {
    setVisibleCount(GALLERY_BATCH_SIZE);
  }, [paths]);

  return (
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
  );
}

function GalleryImageTile({ path, label }: { path: string; label: string }) {
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
        className="relative aspect-square overflow-hidden rounded-lg bg-gradient-to-br from-slate-100 via-white to-sakura-50"
        role={showImage ? undefined : "img"}
        aria-label={showImage ? undefined : label}
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
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${toneClass}`}
    >
      {Icon && <Icon size={14} fill="currentColor" />}
      {label}
    </span>
  );
}

function Divider() {
  return <div className="my-5 border-t border-dashed border-slate-200" />;
}

export default DetailPage;
