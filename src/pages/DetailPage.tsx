import {
  ArrowLeft,
  ArrowUpDown,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Clock,
  Edit3,
  ExternalLink,
  FileImage,
  Film,
  Globe2,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  Info,
  List,
  Play,
  Ruler,
  Search,
  Star,
  type LucideIcon,
  UserRound,
} from "lucide-react";
import {
  Children,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { VideoLiteCard, ImageLiteCard, PerformerLiteCard } from "../components/cards";
import ContentThumbnailPlaceholder from "../components/ContentThumbnailPlaceholder";
import SakuravaSelect from "../components/SakuravaSelect";
import StickyHorizontalScroll from "../components/StickyHorizontalScroll";
import GlobalImageViewer from "../components/gallery/GlobalImageViewer";
import type {
  DetailConfig,
  DetailSection,
  CreditDetailItem,
  FilmographyDetailItem,
  MediaPathItem,
  PerformerDetailConfig,
  SourceLinkItem,
} from "../lib/detailData";
import type { HomeRecentItem } from "../lib/homeData";
import { calculateAverageRating } from "../lib/ratingSummary";
import { updateImage } from "../runtime/imageCommands";
import { localImagePathToAssetSrc } from "../runtime/localAsset";
import {
  createGlobalImageViewerWindowPayload,
  openGlobalImageViewerWindow,
  type GlobalImageViewerWindowPayload,
  type GlobalImageViewerWindowResult,
} from "../runtime/globalImageViewerWindow";
import { formatDateOnlyDisplay, isDateOnlyValue } from "../lib/dateDisplay";
import {
  readSessionFilterState,
  writeSessionFilterState,
} from "../lib/sessionFilterState";
import { openMediaPath } from "../runtime/mediaOpenCommands";
import {
  normalizeHttpSourceUrl,
  openSourceLink,
} from "../runtime/sourceLinkCommands";
import { useMediaAssetScopeReady } from "../runtime/MediaAssetScopeContext";
import {
  checkPathStatus,
  type PathStatusKind,
  type PathStatusResult,
} from "../runtime/pathStatusCommands";
import { updatePerformer } from "../runtime/performerCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";
import { updateVideo } from "../runtime/videoCommands";

type DetailPageProps = {
  config: DetailConfig;
};

function logGlobalViewerFallback(
  context: string,
  result: GlobalImageViewerWindowResult,
) {
  if (result.mode !== "fallback") {
    return;
  }

  const meta = import.meta as ImportMeta & { env?: { MODE?: string } };
  if (meta.env?.MODE === "production") {
    return;
  }

  console.warn(`[GlobalImageViewerWindow] ${context} fallback`, {
    reason: result.reason,
  });
}

type DetailFavoriteAction = {
  errorMessage: string | null;
  isPending: boolean;
  onToggle: () => void;
};

const DETAIL_CHIP_VISIBLE_LIMIT = 5;
const RELATED_CAROUSEL_VISIBLE_COUNT = 5;

function DetailPage({ config }: DetailPageProps) {
  const [favorite, setFavorite] = useState(config.favorite);
  const [favoritePending, setFavoritePending] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  useEffect(() => {
    setFavorite(config.favorite);
    setFavoritePending(false);
    setFavoriteError(null);
  }, [config.kind, config.recordId, config.favorite]);

  async function handleFavoriteToggle() {
    if (favoritePending) {
      return;
    }

    const previousFavorite = favorite;
    const nextFavorite = !favorite;
    setFavorite(nextFavorite);
    setFavoriteError(null);

    if (!config.recordId || !isTauriRuntimeAvailable()) {
      return;
    }

    setFavoritePending(true);

    try {
      const updatedRecord =
        config.kind === "videos"
          ? await updateVideo(config.recordId, { favorite: nextFavorite })
          : config.kind === "images"
            ? await updateImage(config.recordId, { favorite: nextFavorite })
            : await updatePerformer(config.recordId, { favorite: nextFavorite });

      if (!updatedRecord) {
        setFavorite(previousFavorite);
        setFavoriteError("Favorite update failed. The saved record was not changed.");
        return;
      }

      setFavorite(updatedRecord.favorite);
    } catch {
      setFavorite(previousFavorite);
      setFavoriteError("Favorite update failed. The saved record was not changed.");
    } finally {
      setFavoritePending(false);
    }
  }

  const localConfig = { ...config, favorite } as DetailConfig;
  const favoriteAction: DetailFavoriteAction = {
    errorMessage: favoriteError,
    isPending: favoritePending,
    onToggle: handleFavoriteToggle,
  };

  if (localConfig.kind === "performers") {
    return (
      <PerformerDetailPage
        config={localConfig}
        favoriteAction={favoriteAction}
      />
    );
  }

  return (
    <CatalogDetailPage
      config={localConfig}
      favoriteAction={favoriteAction}
    />
  );
}

function DetailHeader({ config }: DetailPageProps) {
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
    </div>
  );
}

function CatalogDetailPage({
  config,
  favoriteAction,
}: DetailPageProps & {
  favoriteAction: DetailFavoriteAction;
}) {
  const heroSection = (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(360px,0.9fr)_1.1fr]">
        <LargePlaceholder config={config} />
        <CatalogIdentity config={config} favoriteAction={favoriteAction} />
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
      />
    </section>
  );

  if (config.kind === "images") {
    return (
      <div className="space-y-5">
        <DetailHeader config={config} />
        {heroSection}
        <GalleryGrid paths={config.galleryImagePaths} />
        {detailSummarySection}
        <NotesCard notes={config.notes} />
        <RelatedRows sections={config.relatedSections} />
        <SourceLinksCard links={config.sourceLinks} />
        <SystemInfoCard items={config.systemInfo} mediaPaths={config.mediaPaths} />
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <DetailHeader config={config} />
      {heroSection}
      {detailSummarySection}
      <NotesCard notes={config.notes} />
      <RelatedRows sections={config.relatedSections} />
      <SourceLinksCard links={config.sourceLinks} />
      <SystemInfoCard items={config.systemInfo} mediaPaths={config.mediaPaths} />
    </div>
  );
}

function CatalogIdentity({
  config,
  favoriteAction,
}: DetailPageProps & {
  favoriteAction: DetailFavoriteAction;
}) {
  const playableMedia =
    config.kind === "videos"
      ? config.mediaPaths.find((item) => item.playable)
      : undefined;

  return (
    <div className="flex min-h-full flex-col gap-6 py-1">
      <div>
        <div className="flex min-h-7 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {"code" in config && !isEmptyDetailValue(config.code) && (
              <Chip label={config.code} tone="neutral" />
            )}
          </div>
          <MainFavoriteButton
            favorite={config.favorite}
            favoriteAction={favoriteAction}
          />
        </div>
        {favoriteAction.errorMessage && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {favoriteAction.errorMessage}
          </p>
        )}

        <ExpandableTitle
          className="mt-4"
          originalTitle={config.originalTitle}
          title={config.displayTitle}
        />

        <div className="mt-5 flex min-w-0 flex-wrap gap-2">
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
          <OverflowChipList
            ariaLabel="Detail categories"
            labels={config.categories}
          />
        </div>
      )}
    </div>
  );
}

function PerformerDetailPage({
  config,
  favoriteAction,
}: {
  config: PerformerDetailConfig;
  favoriteAction: DetailFavoriteAction;
}) {
  const physicalItems = [
    config.bodyType ?? { label: "Body Type", value: "N/A" },
    ...config.physical,
  ];

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <DetailHeader config={config} />

      <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <PerformerProfileCard
          config={config}
          favoriteAction={favoriteAction}
        />

        <div className="min-w-0 space-y-5">
          <PerformerSummaryCards config={config} />
          <RatingSummaryCard title={config.ratingTitle} rating={config.rating} />
          <section className="grid gap-5 lg:grid-cols-2">
            <RowsCard title="Personal" icon={UserRound} items={config.personal} />
            <RowsCard title="Physical" icon={Ruler} items={physicalItems} />
          </section>
          <NotesCard notes={config.notes} />
        </div>
      </div>

      <RelatedRows sections={config.relatedSections} />
      <SourceLinksCard links={config.sourceLinks} />
      <SystemInfoCard items={config.systemInfo} mediaPaths={config.mediaPaths} />
    </div>
  );
}

function PerformerProfileCard({
  config,
  favoriteAction,
}: {
  config: PerformerDetailConfig;
  favoriteAction: DetailFavoriteAction;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="relative">
        <LargePlaceholder config={config} />
        <div className="absolute right-3 top-3 z-10">
          <MainFavoriteButton
            favorite={config.favorite}
            favoriteAction={favoriteAction}
          />
        </div>
      </div>
      {favoriteAction.errorMessage && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {favoriteAction.errorMessage}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => {
          const label =
            config.techItems[index]?.label ?? `Performer Thumbnail ${index + 1}`;

          return (
            <SmallThumbnail
              key={label}
              label={label}
              path={config.thumbnailPaths[index]}
              paths={config.thumbnailPaths}
              index={index}
            />
          );
        })}
      </div>

      <ExpandableTitle
        className="mt-5"
        originalClassName="text-sm"
        originalTitle={config.originalTitle}
        title={config.displayTitle}
      />

      <div
        aria-label="Performer hero chips"
        className="mt-4 flex flex-wrap gap-2"
      >
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
          <LabelBlock title="Categories" labels={config.categories} oneRowOverflow />
        </>
      )}
    </section>
  );
}

function MainFavoriteButton({
  favorite,
  favoriteAction,
}: {
  favorite: boolean;
  favoriteAction: DetailFavoriteAction;
}) {
  const label = favorite ? "Remove from Favorites" : "Add to Favorites";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={favoriteAction.isPending}
      onClick={favoriteAction.onToggle}
      className={[
        "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border shadow-sm transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70",
        favorite
          ? "border-sakura-200 bg-sakura-500 text-white shadow-sakura-100"
          : "border-sakura-100 bg-white text-sakura-500 hover:bg-sakura-50",
      ].join(" ")}
    >
      <Heart size={20} fill={favorite ? "currentColor" : "none"} />
    </button>
  );
}

function ExpandableTitle({
  className = "",
  originalClassName = "text-base",
  originalTitle,
  title,
}: {
  className?: string;
  originalClassName?: string;
  originalTitle?: string;
  title: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOriginalTitle = Boolean(originalTitle?.trim());
  const canExpand =
    title.trim().length > 72 || (originalTitle?.trim().length ?? 0) > 72;
  const titleClampClass = expanded ? "" : "line-clamp-2";
  const originalClampClass = expanded ? "" : "line-clamp-2";

  return (
    <div className={`${className} min-w-0`}>
      <div className="flex min-w-0 items-start gap-1.5">
        <h2
          className={[
            "min-w-0 flex-1 break-words text-3xl font-semibold leading-tight tracking-normal text-slate-950 [overflow-wrap:anywhere]",
            titleClampClass,
          ].join(" ")}
        >
          {title}
        </h2>
        {canExpand && (
          <button
            type="button"
            aria-label={expanded ? "Collapse title" : "Expand full title"}
            aria-expanded={expanded}
            title={expanded ? "Collapse title" : "Expand full title"}
            onClick={() => setExpanded((current) => !current)}
            className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-sakura-50 hover:text-sakura-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 focus-visible:ring-offset-2"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        )}
      </div>
      {hasOriginalTitle && (
        <p
          className={[
            "mt-2 min-w-0 break-words text-slate-500 [overflow-wrap:anywhere]",
            originalClassName,
            originalClampClass,
          ].join(" ")}
        >
          {originalTitle}
        </p>
      )}
    </div>
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
  const aspectClass =
    config.kind === "performers" ? "aspect-[4/5]" : "aspect-video";
  const [imageFailed, setImageFailed] = useState(false);
  const [previewPayload, setPreviewPayload] =
    useState<GlobalImageViewerWindowPayload | null>(null);
  const previewOpeningRef = useRef(false);
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const assetSrc = localImagePathToAssetSrc(config.coverPath);
  const showImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);
  const previewTitle = coverPreviewTitle(config.kind);
  const imageAlt = `${config.displayTitle} ${
    config.kind === "performers" ? "profile image" : "cover"
  }`;

  useEffect(() => {
    setImageFailed(false);
    setPreviewPayload(null);
    previewOpeningRef.current = false;
  }, [assetSrc, mediaAssetScopeReady]);

  async function handlePreviewOpen() {
    if (previewOpeningRef.current) {
      return;
    }

    previewOpeningRef.current = true;
    const payload = createGlobalImageViewerWindowPayload({
      ariaLabel: previewTitle,
      images: [{ path: config.coverPath ?? "", title: previewTitle }],
      initialIndex: 0,
    });
    try {
      const viewerResult = await openGlobalImageViewerWindow(payload);

      if (viewerResult.mode === "fallback") {
        logGlobalViewerFallback("detail cover preview", viewerResult);
        setPreviewPayload(payload);
      }
    } finally {
      previewOpeningRef.current = false;
    }
  }

  return (
    <>
      <div
        className={`${aspectClass} relative flex min-h-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 via-white to-sakura-50 text-sakura-200`}
        aria-label={showImage ? undefined : config.placeholderLabel}
        data-testid={showImage ? undefined : "detail-thumbnail-placeholder"}
      >
        {showImage ? (
          <button
            type="button"
            aria-label={`Preview ${previewTitle}`}
            className="absolute inset-0 cursor-zoom-in overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 focus-visible:ring-offset-2"
            onClick={() => void handlePreviewOpen()}
          >
            <img
              src={assetSrc ?? undefined}
              alt={imageAlt}
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          </button>
        ) : (
          <ContentThumbnailPlaceholder />
        )}
      </div>
      {showImage && assetSrc && previewPayload && (
        <GlobalImageViewer
          ariaLabel={previewPayload.ariaLabel}
          images={previewPayload.images}
          initialIndex={previewPayload.initialIndex}
          onClose={() => setPreviewPayload(null)}
          openRequestId={previewPayload.openRequestId}
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

function SmallThumbnail({
  index,
  label,
  path,
  paths = path ? [path] : [],
}: {
  index?: number;
  label: string;
  path?: string;
  paths?: string[];
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [previewPayload, setPreviewPayload] =
    useState<GlobalImageViewerWindowPayload | null>(null);
  const previewOpeningRef = useRef(false);
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const assetSrc = localImagePathToAssetSrc(path);
  const showImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
    setPreviewPayload(null);
    previewOpeningRef.current = false;
  }, [assetSrc, mediaAssetScopeReady]);

  async function handlePreviewOpen() {
    if (previewOpeningRef.current) {
      return;
    }

    previewOpeningRef.current = true;
    const viewerImages = paths
      .map((thumbnailPath, thumbnailIndex) => ({
        path: thumbnailPath,
        title: `Performer Thumbnail ${thumbnailIndex + 1}`,
      }))
      .filter((image) => image.path.trim());
    const initialIndex = Math.max(
      0,
      viewerImages.findIndex((image) => image.path === path),
    );
    const payload = createGlobalImageViewerWindowPayload({
      ariaLabel: label,
      images: viewerImages.length > 0
        ? viewerImages
        : [{ path: path ?? "", title: label }],
      initialIndex: typeof index === "number" ? initialIndex : 0,
    });
    try {
      const viewerResult = await openGlobalImageViewerWindow(payload);

      if (viewerResult.mode === "fallback") {
        logGlobalViewerFallback("detail thumbnail preview", viewerResult);
        setPreviewPayload(payload);
      }
    } finally {
      previewOpeningRef.current = false;
    }
  }

  return (
    <>
      <div
        className="relative aspect-[4/5] overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 via-white to-sakura-50"
        aria-label={showImage ? undefined : label}
        data-testid={showImage ? undefined : "detail-thumbnail-placeholder"}
      >
        {showImage ? (
          <button
            type="button"
            aria-label={`Preview ${label}`}
            className="absolute inset-0 cursor-zoom-in overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 focus-visible:ring-offset-2"
            onClick={() => void handlePreviewOpen()}
          >
            <img
              src={assetSrc ?? undefined}
              alt={label}
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          </button>
        ) : (
          <ContentThumbnailPlaceholder />
        )}
      </div>
      {showImage && assetSrc && previewPayload && (
        <GlobalImageViewer
          ariaLabel={previewPayload.ariaLabel}
          images={previewPayload.images}
          initialIndex={previewPayload.initialIndex}
          onClose={() => setPreviewPayload(null)}
          openRequestId={previewPayload.openRequestId}
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
}: {
  title: string;
  icon: typeof Info;
  items: { label: string; value: string }[];
  message?: string;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
      <CardTitle title={title} icon={Icon} />
      {message && <p className="mt-3 text-xs text-slate-500">{message}</p>}
      <div className="mt-4 divide-y divide-slate-100">
        {items.map((item) => (
          <div
            key={item.label}
            className="grid min-w-0 grid-cols-[minmax(7rem,0.85fr)_minmax(0,1.15fr)] gap-4 py-3 text-sm"
          >
            <span className="min-w-0 truncate font-medium text-slate-700" title={item.label}>
              {item.label}
            </span>
            <span
              className="min-w-0 break-words text-slate-500 [overflow-wrap:anywhere]"
              title={detailDisplayValue(item.value)}
            >
              {detailDisplayValue(item.value)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function detailDisplayValue(value: string | number | null | undefined) {
  const label = typeof value === "number" ? String(value) : value?.trim();

  if (isEmptyDetailValue(label)) {
    return "N/A";
  }

  if (isDateOnlyValue(label)) {
    return formatDateOnlyDisplay(label);
  }

  return label;
}

function isEmptyDetailValue(value: string | number | null | undefined) {
  const label = typeof value === "number" ? String(value) : value?.trim();

  if (!label) {
    return true;
  }

  return [
    "-",
    "No code",
    "No aliases",
    "Not set",
    "Not available",
    "Not detected yet",
    "Unspecified",
    "Unknown",
    "n/a",
  ].includes(label);
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
      label: "N/A",
    };
  }

  return {
    label: "N/A",
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
            <p className="mt-1 text-slate-500">
              {detailDisplayValue(item.value)}
            </p>
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
  const canRenderChart = rating.length >= 3 && rating.length <= 8;

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
      <CardTitle title={title} icon={Star} />
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
  average: number | null;
}) {
  const gradientId = useId().replace(/:/g, "");
  const center = 210;
  const radius = 84;
  const labelRadius = 158;
  const levels = [0.2, 0.4, 0.6, 0.8, 1];
  const dimensionCount = dimensions.length;
  const shapeName = spiderShapeName(dimensionCount);
  const normalizedDimensions = dimensions.map((dimension) => ({
    ...dimension,
    value: normalizeRadarValue(dimension.value),
  }));
  const outerPoints = dimensions.map((_, index) =>
    polarPoint(index, dimensionCount, radius, center),
  );
  const scorePoints = normalizedDimensions.map((dimension, index) =>
    polarPoint(index, dimensionCount, radius * (dimension.value / 5), center),
  );
  const radarPath = buildSmoothClosedPath(scorePoints);

  return (
    <div className="mt-4 flex justify-center">
      <svg
        viewBox="0 0 420 420"
        className="aspect-square w-full max-w-[420px]"
        role="img"
        aria-label={`${dimensionCount}-dimension radar map`}
        data-testid="spider-chart"
        data-dimension-count={dimensionCount}
        data-shape={shapeName}
      >
        <title>Rating radar map</title>
        <desc>
          {dimensions
            .map((dimension) => `${dimension.label}: ${formatRadarValue(dimension.value)}`)
            .join(", ")}
        </desc>
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="42%" r="74%">
            <stop offset="0%" stopColor="rgb(255 255 255)" stopOpacity="0.28" />
            <stop
              offset="58%"
              stopColor="var(--appearance-accent-muted)"
              stopOpacity="0.22"
            />
            <stop
              offset="100%"
              stopColor="var(--appearance-accent)"
              stopOpacity="0.06"
            />
          </radialGradient>
        </defs>
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
            fill="none"
            stroke={level === 1 ? "rgb(203 213 225)" : "rgb(226 232 240)"}
            strokeWidth={level === 1 ? "1" : "0.85"}
            opacity={level === 1 ? "0.9" : "0.72"}
            vectorEffect="non-scaling-stroke"
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
            strokeWidth="0.85"
            opacity="0.72"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          d={radarPath}
          data-testid="spider-chart-path"
          fill={`url(#${gradientId})`}
          stroke="var(--appearance-accent)"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {scorePoints.map((point, index) => (
          <circle
            key={`${dimensions[index].label}-point`}
            cx={point.x}
            cy={point.y}
            r="3.2"
            fill="var(--appearance-accent)"
            stroke="white"
            strokeWidth="1.25"
          />
        ))}
        {dimensions.map((dimension, index) => {
          const point = polarPoint(index, dimensionCount, labelRadius, center);
          const anchor = labelAnchor(point.x, center);
          const labelX = point.x + (anchor === "end" ? -14 : anchor === "start" ? 14 : 0);
          return (
            <g key={dimension.label}>
              <text
                x={labelX}
                y={point.y - 9}
                textAnchor={anchor}
                dominantBaseline="middle"
                className="fill-slate-600 text-[11px] font-medium"
              >
                {dimension.label}
              </text>
              <text
                x={labelX}
                y={point.y + 8}
                textAnchor={anchor}
                dominantBaseline="middle"
                className="fill-slate-400 text-[10px] font-medium"
              >
                {formatRadarValue(dimension.value)}
              </text>
            </g>
          );
        })}
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-slate-900 text-[16px] font-semibold [paint-order:stroke] [stroke:#ffffff] [stroke-width:4px]"
        >
          {average === null ? "N/A" : average.toFixed(1)}
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

function buildSmoothClosedPath(points: { x: number; y: number }[]) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${pointString(points[0])}`;
  }

  const segments = points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = point;
    const next = points[(index + 1) % points.length];
    const afterNext = points[(index + 2) % points.length];

    const control1 = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    };
    const control2 = {
      x: next.x - (afterNext.x - current.x) / 6,
      y: next.y - (afterNext.y - current.y) / 6,
    };

    return `${index === 0 ? `M ${pointString(current)} ` : ""}C ${pointString(
      control1,
    )} ${pointString(control2)} ${pointString(next)}`;
  });

  return `${segments.join(" ")} Z`;
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
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
      <CardTitle title="Notes" icon={FileImage} />
      <div className="mt-4 min-w-0 rounded-lg border border-sakura-100 bg-sakura-50/30 px-4 py-3">
        <p className="min-w-0 break-words text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">
          {notes}
        </p>
      </div>
    </section>
  );
}

function SourceLinksCard({ links }: { links?: SourceLinkItem[] }) {
  const visibleLinks = normalizeSourceLinks(links);
  const [openError, setOpenError] = useState("");

  async function handleOpen(url: string) {
    setOpenError("");
    const result = await openSourceLink(url);
    if (!result.opened) {
      setOpenError(result.message);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <CardTitle title="Source Links" icon={Globe2} />
      <div className="mt-4 divide-y divide-slate-100">
        {visibleLinks.length === 0 ? (
          <div
            className="grid min-w-0 gap-2 py-3 text-sm md:grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)]"
          >
            <span className="font-semibold text-slate-700">Source Link</span>
            <span className="text-slate-500">N/A</span>
          </div>
        ) : (
          visibleLinks.map((link) => (
            <div
              key={`${link.title}-${link.url}`}
              className="grid min-w-0 gap-2 py-3 text-sm md:grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)_auto]"
            >
              <span className="min-w-0 truncate font-semibold text-slate-700" title={link.title}>
                {link.title}
              </span>
              <span
                className={[
                  "min-w-0 truncate",
                  link.safeUrl ? "text-sakura-600" : "text-slate-500",
                ].join(" ")}
                title={link.url}
              >
                {link.url || "N/A"}
              </span>
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                disabled={!link.safeUrl}
                aria-label={`Open Source Link ${link.title}`}
                title={link.safeUrl ? "Open in external browser" : "Invalid Source Link URL"}
                onClick={() => void handleOpen(link.url)}
              >
                <ExternalLink size={14} />
                Open
              </button>
            </div>
          ))
        )}
      </div>
      {openError && (
        <p role="status" className="mt-3 text-xs font-semibold text-rose-600">
          {openError}
        </p>
      )}
    </section>
  );
}

function safeSourceUrl(url: string) {
  return normalizeHttpSourceUrl(url);
}

function normalizeSourceLinks(links: SourceLinkItem[] | undefined) {
  return (links ?? [])
    .map((link) => {
      const url = link.url?.trim() ?? "";
      const title = link.title?.trim() || sourceLabelFromUrl(url);
      return {
        title,
        url,
        safeUrl: safeSourceUrl(url),
      };
    })
    .filter((link) => link.title || link.url);
}

function sourceLabelFromUrl(url: string) {
  if (!url) {
    return "N/A";
  }

  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function RelatedRows({
  sections,
}: {
  sections: DetailSection[];
}) {
  return (
    <section className="grid min-w-0 max-w-full gap-4">
      {sections.map((section) => (
        <section
          key={section.title}
          className="min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <CardTitle title={section.title} icon={relatedSectionIcon(section.title)} />
            <span className="shrink-0 text-sm font-semibold text-slate-500">
              {relatedCountLabel(section)}
            </span>
          </div>
          {section.filmography?.length ? (
            <FilmographySummary items={section.filmography} />
          ) : section.credits?.length ? (
            <CreditSummary credits={section.credits} />
          ) : section.relatedPerformers ? (
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

function relatedCountLabel(section: DetailSection) {
  const count =
    (section.filmography?.length ||
      (section.credits
        ? new Set(section.credits.map((credit) => credit.performerId)).size
        : 0) ||
      section.relatedPerformers?.length) ??
    section.relatedCatalogRecords?.length ??
    0;
  const singular = section.title.includes("Credits")
    ? "Credit"
    : section.title.includes("Performer")
    ? "Performer"
    : section.title.includes("Video")
      ? "Video"
      : "Image";
  const label = count === 1 ? singular : `${singular}s`;

  return `${count} ${label}`;
}

function FilmographySummary({
  items,
}: {
  items: FilmographyDetailItem[];
}) {
  return (
    <div className="mt-4 grid gap-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-lg border border-slate-200 bg-slate-50/40 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {item.workRouteTo ? (
                  <Link
                    to={item.workRouteTo}
                    className="font-semibold text-sakura-600 hover:text-sakura-700"
                  >
                    {item.workTitle}
                  </Link>
                ) : (
                  <p className="font-semibold text-slate-800">
                    {item.workTitle}
                  </p>
                )}
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {item.workType}
                </span>
              </div>
              {item.workOriginalTitle && (
                <p className="mt-1 text-sm text-slate-500">
                  {item.workOriginalTitle}
                </p>
              )}
              {(item.releaseDate || item.publisherLabel) && (
                <p className="mt-1 text-xs text-slate-400">
                  {[item.releaseDate, item.publisherLabel].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
          <dl className="mt-3 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
            <CreditField
              label="Role"
              value={item.characterName}
            />
            <CreditField label="Credit Type" value={item.creditType} />
          </dl>
        </article>
      ))}
    </div>
  );
}

function CreditSummary({ credits }: { credits: CreditDetailItem[] }) {
  const groupedCredits = groupCreditsByPerformer(credits);

  return (
    <RelatedCarousel label="Related Performers">
      {groupedCredits.map((group, index) => {
        const credit = group[0];
        const liteItem: HomeRecentItem = {
          kind: "performers",
          key: credit.performerRouteTo?.split("/").pop() ?? `credit-${index}`,
          title: credit.performerName,
          detail: credit.performerOriginalName ?? "",
          typeLabel: "Performer",
          coverPath: credit.performerCoverPath,
          favorite: credit.performerFavorite ?? false,
          aliases: credit.performerAliases,
          rating: credit.performerRating,
          filmographyCount: credit.performerFilmographyCount,
          pictorialsCount: credit.performerPictorialsCount,
        };
        const creditMetadata = group
          .filter((item) => item.characterName || item.creditType)
          .map((item) => ({
            id: item.id,
            roleName: item.characterName,
            creditType: item.creditType,
          }));

        return (
          <div
            key={credit.performerId || credit.id}
            className="relative flex h-full min-w-0 flex-col"
          >
            {!credit.performerRouteTo && (
              <span className="absolute left-2 top-2 z-10 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                Unavailable
              </span>
            )}
            <div className="min-h-0 flex-1 [&>*]:h-full">
              <RelatedLiteCard
                kind="performers"
                item={liteItem}
                linkTo={credit.performerRouteTo ?? "#"}
                favoriteInteractive={Boolean(credit.performerRouteTo)}
                creditMetadata={creditMetadata}
              />
            </div>
          </div>
        );
      })}
    </RelatedCarousel>
  );
}

function groupCreditsByPerformer(credits: CreditDetailItem[]) {
  const groups: CreditDetailItem[][] = [];
  const groupByPerformer = new Map<string, CreditDetailItem[]>();

  credits.forEach((credit) => {
    const key = credit.performerId || `credit:${credit.id}`;
    const existing = groupByPerformer.get(key);
    if (existing) {
      existing.push(credit);
      return;
    }

    const group = [credit];
    groupByPerformer.set(key, group);
    groups.push(group);
  });

  return groups;
}

function CreditField({
  label,
  value,
  secondaryValue,
}: {
  label: string;
  value?: string;
  secondaryValue?: string;
}) {
  return (
    <div>
      <dt className="font-semibold text-slate-700">{label}</dt>
      <dd className="mt-0.5 text-slate-500">
        {value || "N/A"}
        {secondaryValue && (
          <span className="ml-1 text-slate-400">({secondaryValue})</span>
        )}
      </dd>
    </div>
  );
}

function RelatedLiteCard({
  kind,
  item,
  linkTo,
  favoriteInteractive,
  creditMetadata,
}: {
  kind: "videos" | "images" | "performers";
  item: HomeRecentItem;
  linkTo: string;
  favoriteInteractive: boolean;
  creditMetadata?: Array<{
    id: string;
    roleName?: string;
    creditType?: string;
  }>;
}) {
  const [favorite, setFavorite] = useState(item.favorite);
  const currentItem = { ...item, favorite };

  useEffect(() => {
    setFavorite(item.favorite);
  }, [item.favorite, item.key]);

  function handleFavoriteClick() {
    if (!favoriteInteractive) {
      return;
    }

    const next = !favorite;
    setFavorite(next);

    if (isTauriRuntimeAvailable()) {
      const key = item.key;
      const updateFn =
        kind === "videos" ? updateVideo :
        kind === "images" ? updateImage :
        updatePerformer;
      updateFn(key, { favorite: next })
        .then((updatedRecord) => {
          if (!updatedRecord) {
            setFavorite(!next);
            return;
          }

          setFavorite(updatedRecord.favorite);
        })
        .catch(() => setFavorite(!next));
    }
  }

  if (kind === "performers") {
    return (
      <PerformerLiteCard
        item={currentItem}
        linkTo={linkTo}
        favoriteInteractive={favoriteInteractive}
        onFavoriteClick={favoriteInteractive ? handleFavoriteClick : undefined}
        creditMetadata={creditMetadata}
      />
    );
  }
  if (kind === "images") {
    return (
      <ImageLiteCard
        item={currentItem}
        linkTo={linkTo}
        favoriteInteractive={favoriteInteractive}
        onFavoriteClick={favoriteInteractive ? handleFavoriteClick : undefined}
      />
    );
  }
  return (
    <VideoLiteCard
      item={currentItem}
      linkTo={linkTo}
      favoriteInteractive={favoriteInteractive}
      onFavoriteClick={favoriteInteractive ? handleFavoriteClick : undefined}
    />
  );
}

function RelatedCatalogSummary({ section }: { section: DetailSection }) {
  const relatedCatalogRecords = section.relatedCatalogRecords ?? [];
  const emptyText = section.title.includes("Image")
    ? "No related images saved."
    : "No related videos saved.";
  const hasControls = section.controls === "performer-related";
  const kind = section.title.includes("Image") ? "images" : "videos";
  const sessionKey = hasControls ? performerRelatedSessionKey(kind) : "";
  const initialSessionState = readSessionFilterState(sessionKey, {
    viewMode: "card",
    sortMode: "new",
    pageSize: 20,
    searchQuery: "",
  });
  const [viewMode, setViewMode] = useState<"card" | "table">(
    initialSessionState.viewMode === "table" ? "table" : "card",
  );
  const [sortMode, setSortMode] = useState<RelatedSortMode>(
    isRelatedSortMode(initialSessionState.sortMode)
      ? initialSessionState.sortMode
      : "new",
  );
  const [pageSize, setPageSize] = useState(
    isRelatedPageSize(initialSessionState.pageSize)
      ? initialSessionState.pageSize
      : 20,
  );
  const [searchQuery, setSearchQuery] = useState(
    typeof initialSessionState.searchQuery === "string"
      ? initialSessionState.searchQuery
      : "",
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!hasControls) {
      return;
    }

    writeSessionFilterState(sessionKey, {
      viewMode,
      sortMode,
      pageSize,
      searchQuery,
    });
  }, [hasControls, pageSize, searchQuery, sessionKey, sortMode, viewMode]);

  if (relatedCatalogRecords.length === 0) {
    return <RelatedEmptyState message={emptyText} title={section.title} />;
  }

  const filteredRecords = hasControls
    ? filterRelatedCatalogRecords(relatedCatalogRecords, searchQuery)
    : relatedCatalogRecords;
  const sortedRecords = hasControls
    ? sortRelatedCatalogRecords(filteredRecords, sortMode)
    : filteredRecords;
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
          resultCount={sortedRecords.length}
          searchQuery={searchQuery}
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
          onSearchQueryChange={(nextSearchQuery) => {
            setSearchQuery(nextSearchQuery);
            setPage(1);
          }}
          onViewModeChange={(nextViewMode) => {
            setViewMode(nextViewMode);
            setPage(1);
          }}
        />
      )}
      {viewMode === "table" && hasControls ? (
        <PerformerRelatedCatalogTable
          items={visibleRecords}
          kind={kind}
          sortMode={sortMode}
          onSortModeChange={(nextSortMode) => {
            setSortMode(nextSortMode);
            setPage(1);
          }}
        />
      ) : hasControls ? (
        <div
          className="mt-4 grid min-w-0 max-w-full gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]"
          data-testid={`performer-related-${kind}-card-grid`}
        >
          {visibleRecords.map((record, index) => {
            const liteItem: HomeRecentItem = {
              kind,
              key: record.routeTo?.split("/").pop() ?? `catalog-${index}`,
              title: record.title,
              detail: record.code ?? "",
              typeLabel: kind === "videos" ? "Video" : "Image",
              coverPath: record.coverPath,
              favorite: record.favorite ?? false,
              code: record.code,
              releaseYear: record.releaseDate?.slice(0, 4),
              rating: record.rating,
              duration: kind === "videos" ? record.metadata : undefined,
              imageCount: kind === "images" ? record.metadata : undefined,
            };

            return (
              <div
                key={`${record.title}-${index}`}
                className="relative flex min-w-0 flex-col"
              >
                {record.unresolved && (
                  <span className="absolute left-2 top-2 z-10 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    Unavailable
                  </span>
                )}
                <div className="min-h-0 flex-1 [&>*]:h-full">
                  <RelatedLiteCard
                    kind={kind}
                    item={liteItem}
                    linkTo={record.routeTo ?? "#"}
                    favoriteInteractive={Boolean(record.routeTo && !record.unresolved)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <RelatedCarousel label={section.title}>
          {visibleRecords.map((record, index) => {
            const liteItem: HomeRecentItem = {
              kind,
              key: record.routeTo?.split("/").pop() ?? `catalog-${index}`,
              title: record.title,
              detail: record.code ?? "",
              typeLabel: kind === "videos" ? "Video" : "Image",
              coverPath: record.coverPath,
              favorite: record.favorite ?? false,
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
                  <RelatedLiteCard
                    kind={kind}
                    item={liteItem}
                    linkTo={record.routeTo ?? "#"}
                    favoriteInteractive={false}
                  />
                </div>
              );
            }

            return (
              <RelatedLiteCard
                key={`${record.title}-${index}`}
                kind={kind}
                item={liteItem}
                linkTo={record.routeTo}
                favoriteInteractive
              />
            );
          })}
        </RelatedCarousel>
      )}
    </>
  );
}

type RelatedSortMode =
  | "az"
  | "za"
  | "new"
  | "old"
  | "availabilityAsc"
  | "availabilityDesc"
  | "codeAsc"
  | "codeDesc"
  | "metricAsc"
  | "metricDesc"
  | "censorshipAsc"
  | "censorshipDesc"
  | "ratingAsc"
  | "ratingDesc";

const RELATED_SORT_OPTIONS: Array<{ label: string; value: RelatedSortMode }> = [
  { label: "A-Z", value: "az" },
  { label: "Z-A", value: "za" },
  { label: "New Release", value: "new" },
  { label: "Old Release", value: "old" },
];

function performerRelatedSessionKey(kind: "videos" | "images") {
  return kind === "videos"
    ? "detail:performer:related-videos"
    : "detail:performer:related-images";
}

function isRelatedSortMode(value: unknown): value is RelatedSortMode {
  return (
    value === "az" ||
    value === "za" ||
    value === "new" ||
    value === "old" ||
    value === "availabilityAsc" ||
    value === "availabilityDesc" ||
    value === "codeAsc" ||
    value === "codeDesc" ||
    value === "metricAsc" ||
    value === "metricDesc" ||
    value === "censorshipAsc" ||
    value === "censorshipDesc" ||
    value === "ratingAsc" ||
    value === "ratingDesc"
  );
}

function isRelatedPageSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    [20, 40, 80, 120].includes(value)
  );
}

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
    <RelatedCarousel label={section.title}>
      {relatedPerformers.map((performer, index) => {
        const liteItem: HomeRecentItem = {
          kind: "performers",
          key: performer.routeTo?.split("/").pop() ?? `performer-${index}`,
          title: performer.name,
          detail: performer.originalName ?? "",
          typeLabel: "Performer",
          coverPath: performer.coverPath,
          favorite: performer.favorite ?? false,
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
              <RelatedLiteCard
                kind="performers"
                item={liteItem}
                linkTo={performer.routeTo ?? "#"}
                favoriteInteractive={false}
              />
            </div>
          );
        }

        return (
          <RelatedLiteCard
            key={`${performer.name}-${index}`}
            kind="performers"
            item={liteItem}
            linkTo={performer.routeTo}
            favoriteInteractive
          />
        );
      })}
    </RelatedCarousel>
  );
}

function RelatedCarousel({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const items = Children.toArray(children);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(RELATED_CAROUSEL_VISIBLE_COUNT);
  const pages = chunkRelatedCarouselItems(items, visibleCount);
  const pageCount = Math.max(
    1,
    pages.length,
  );
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, pageCount - 1);
  const canNavigate = pageCount > 1;
  const trackStyle: CSSProperties = {
    transform: `translateX(-${safePage * 100}%)`,
  };

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    const target = carouselRef.current;

    function updateVisibleCount(width?: number) {
      const measuredWidth =
        width && width > 0
          ? width
          : target?.getBoundingClientRect().width || window.innerWidth;
      setVisibleCount(relatedCarouselVisibleCount(measuredWidth));
    }

    const handleResize = () => updateVisibleCount();

    updateVisibleCount();
    window.addEventListener("resize", handleResize);

    if (!target || typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", handleResize);
    }

    const observer = new ResizeObserver((entries) => {
      updateVisibleCount(entries[0]?.contentRect.width);
    });
    observer.observe(target);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  function goToPage(nextPage: number) {
    const targetPage = Math.max(0, Math.min(pageCount - 1, nextPage));
    setPage(targetPage);
  }

  function handleControlClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!canNavigate) {
      return;
    }

    if (
      event.key !== "ArrowRight" &&
      event.key !== "ArrowLeft" &&
      event.key !== "Home" &&
      event.key !== "End" &&
      event.key !== "PageDown" &&
      event.key !== "PageUp"
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "ArrowRight" || event.key === "PageDown") {
      goToPage(safePage + 1);
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      goToPage(safePage - 1);
    } else if (event.key === "Home") {
      goToPage(0);
    } else if (event.key === "End") {
      goToPage(pageCount - 1);
    }
  }

  return (
    <div
      aria-label={`${label} carousel`}
      data-testid="detail-related-carousel"
      data-visible-count={visibleCount}
      data-rendered-count={items.length}
      data-total-count={items.length}
      data-page-count={pageCount}
      data-active-page={safePage + 1}
      ref={carouselRef}
      className="group/carousel mt-4 min-w-0 overflow-hidden focus:outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div
        className="min-w-0 overflow-hidden"
        data-testid="detail-related-carousel-viewport"
      >
        <div
          className="flex w-full min-w-0 transition-transform duration-300 ease-out motion-reduce:transition-none"
          data-testid="detail-related-carousel-track"
          style={trackStyle}
        >
          {pages.map((pageItems, pageIndex) => (
            <div
              key={`related-page-${pageIndex}`}
              className="grid min-w-0 shrink-0 basis-full items-stretch gap-2"
              data-page={pageIndex + 1}
              data-testid="detail-related-carousel-window"
              style={{
                gridTemplateColumns: `repeat(${visibleCount}, minmax(0, 1fr))`,
              }}
            >
              {pageItems.map((child, itemIndex) => (
                <div
                  key={`related-slide-${pageIndex * visibleCount + itemIndex}`}
                  className="flex w-full min-w-0 [&>*]:h-full [&>*]:min-w-0 [&>*]:w-full"
                  data-testid="detail-related-carousel-card"
                >
                  {child}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {canNavigate && (
        <div
          className="mt-4 flex min-h-9 items-center justify-center gap-3"
          data-testid="detail-related-carousel-controls"
        >
          <button
            type="button"
            aria-label="Previous related items"
            disabled={safePage === 0}
            onClick={(event) => {
              handleControlClick(event);
              goToPage(safePage - 1);
            }}
            className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2" aria-label={`${label} pages`}>
            {Array.from({ length: pageCount }, (_, index) => (
              <button
                key={index}
                type="button"
                aria-current={index === safePage ? "page" : undefined}
                aria-label={`Go to ${label} page ${index + 1}`}
                onClick={(event) => {
                  handleControlClick(event);
                  goToPage(index);
                }}
                className={[
                  "size-2.5 rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 focus-visible:ring-offset-2",
                  index === safePage
                    ? "border-sakura-500 bg-sakura-500"
                    : "border-slate-300 bg-white hover:border-sakura-300",
                ].join(" ")}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next related items"
            disabled={safePage >= pageCount - 1}
            onClick={(event) => {
              handleControlClick(event);
              goToPage(safePage + 1);
            }}
            className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowLeft size={16} className="rotate-180" />
          </button>
        </div>
      )}
    </div>
  );
}

function chunkRelatedCarouselItems(items: ReactNode[], visibleCount: number) {
  const pages: ReactNode[][] = [];

  for (let index = 0; index < items.length; index += visibleCount) {
    pages.push(items.slice(index, index + visibleCount));
  }

  return pages.length > 0 ? pages : [[]];
}

function relatedCarouselVisibleCount(width: number) {
  if (width >= 980) {
    return 5;
  }
  if (width >= 760) {
    return 4;
  }
  if (width >= 560) {
    return 3;
  }
  if (width >= 360) {
    return 2;
  }

  return 1;
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
  resultCount,
  searchQuery,
  sortMode,
  totalPages,
  viewMode,
  onPageChange,
  onPageSizeChange,
  onSearchQueryChange,
  onSortModeChange,
  onViewModeChange,
}: {
  itemCount: number;
  page: number;
  pageSize: number;
  resultCount: number;
  searchQuery: string;
  sortMode: RelatedSortMode;
  totalPages: number;
  viewMode: "card" | "table";
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSearchQueryChange: (query: string) => void;
  onSortModeChange: (sortMode: RelatedSortMode) => void;
  onViewModeChange: (viewMode: "card" | "table") => void;
}) {
  const rangeStart = resultCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, resultCount);
  const sortControlRef = useRef<HTMLDivElement | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const selectedSort =
    RELATED_SORT_OPTIONS.find((option) => option.value === sortMode) ??
    RELATED_SORT_OPTIONS[0];
  const viewAction = viewMode === "card" ? "table" : "card";
  const viewLabel =
    viewMode === "card" ? "Switch to table view" : "Switch to card view";
  const ViewIcon = viewMode === "card" ? List : Grid2X2;

  useEffect(() => {
    if (!sortOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && sortControlRef.current?.contains(target)) {
        return;
      }
      setSortOpen(false);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setSortOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sortOpen]);

  function selectSortMode(nextSortMode: RelatedSortMode) {
    onSortModeChange(nextSortMode);
    setSortOpen(false);
  }

  return (
    <div className="mt-4 min-w-0 max-w-full space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="grid min-w-0 items-center gap-3 lg:grid-cols-[minmax(16rem,1fr)_auto_auto]">
        <label
          className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500"
          data-testid="performer-related-search-control"
        >
          <span className="shrink-0">Search</span>
          <input
            aria-label="Search related items"
            className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
        </label>
        <div className="relative min-w-0 shrink-0" ref={sortControlRef}>
          <button
            type="button"
            aria-label={`Sort ${selectedSort.label}`}
            aria-haspopup="listbox"
            aria-expanded={sortOpen}
            className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600 focus:outline-none focus:ring-4 focus:ring-sakura-100 sm:w-44"
            data-testid="performer-related-sort-control"
            onClick={() => setSortOpen((open) => !open)}
          >
            <ArrowUpDown size={16} className="shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-950">
              {selectedSort.label}
            </span>
            <ChevronDown
              size={16}
              className={sortOpen ? "rotate-180 transition" : "transition"}
            />
          </button>
          {sortOpen && (
            <div className="absolute right-0 z-50 mt-2 w-full min-w-44 rounded-lg border border-slate-200 bg-white shadow-lg">
              <div
                role="listbox"
                aria-label="Related sort options"
                className="sakurava-scrollbar max-h-64 overflow-y-auto p-1"
              >
                {RELATED_SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === selectedSort.value}
                    className={[
                      "flex min-h-9 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold transition",
                      option.value === selectedSort.value
                        ? "bg-sakura-50 text-sakura-700"
                        : "text-slate-700 hover:bg-sakura-50 hover:text-sakura-700",
                    ].join(" ")}
                    onClick={() => selectSortMode(option.value)}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={viewLabel}
          title={viewLabel}
          onClick={() => {
            setSortOpen(false);
            onViewModeChange(viewAction);
          }}
          className={[
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border px-2 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-sakura-100",
            viewMode === "table"
              ? "border-sakura-200 bg-sakura-50 text-sakura-700 hover:border-sakura-300"
              : "border-slate-200 bg-white text-slate-700 hover:border-sakura-200 hover:text-sakura-600",
          ].join(" ")}
          data-testid="performer-related-view-button"
        >
          <ViewIcon size={16} aria-hidden="true" />
          <span className="sr-only">View</span>
        </button>
      </div>
      <nav
        className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"
        aria-label="Related section pagination"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <p className="text-sm font-semibold text-slate-600">
            Showing {rangeStart}-{rangeEnd} of {resultCount}
            {resultCount !== itemCount ? ` filtered from ${itemCount}` : ""}
          </p>
        <label className="flex items-center text-xs font-semibold text-slate-500">
          Page size
          <SakuravaSelect
            ariaLabel="Related items per page"
            className="ml-2 w-24"
            placement="down"
            value={pageSize}
            onChange={onPageSizeChange}
            options={[20, 40, 80, 120].map((option) => ({
              value: option,
              label: String(option),
            }))}
          />
          <span className="ml-2">per page</span>
        </label>
        </div>
        <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-500 disabled:opacity-50"
        >
          Previous
        </button>
        {buildDetailPaginationPages(page, totalPages).map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onPageChange(pageNumber)}
            aria-current={pageNumber === page ? "page" : undefined}
            aria-label={`Page ${pageNumber}`}
            className={`flex size-9 items-center justify-center rounded-lg text-sm font-semibold ${
              pageNumber === page
                ? "bg-sakura-500 text-white"
                : "border border-slate-200 bg-white text-slate-500"
            }`}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-500 disabled:opacity-50"
        >
          Next
        </button>
      </div>
      </nav>
    </div>
  );
}

function normalizeRadarValue(value: number) {
  return Number.isFinite(value) && value >= 1 && value <= 5 ? value : 0;
}

function formatRadarValue(value: number) {
  return Number.isFinite(value) && value >= 1 && value <= 5
    ? `${value}/5`
    : "N/A";
}

function buildDetailPaginationPages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

function RelatedCatalogTable({
  items,
  kind,
}: {
  items: NonNullable<DetailSection["relatedCatalogRecords"]>;
  kind: "videos" | "images";
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-[760px] table-fixed divide-y divide-slate-200 text-left text-sm">
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[24%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[10%]" />
          <col className="w-[8%]" />
        </colgroup>
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
                {detailDisplayValue(item.releaseDate)}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {detailDisplayValue(item.metadata)}
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
  sortMode,
  onSortModeChange,
}: {
  items: NonNullable<DetailSection["relatedCatalogRecords"]>;
  kind: "videos" | "images";
  sortMode: RelatedSortMode;
  onSortModeChange: (sortMode: RelatedSortMode) => void;
}) {
  const tableWidth = 1040;

  return (
    <div className="mt-4 min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
      <StickyHorizontalScroll testId={`performer-related-${kind}-table-scroll`}>
      <table
        className="w-full min-w-[1040px] table-fixed divide-y divide-slate-200 text-left text-sm"
        data-testid={`performer-related-${kind}-table`}
        style={{ minWidth: `${tableWidth}px`, width: "100%" }}
      >
        <colgroup data-testid={`performer-related-${kind}-table-colgroup`}>
          <col className="w-[11%]" data-column-id="availability" />
          <col className="w-[6%]" data-column-id="favorite" />
          <col className="w-[31%]" data-column-id="title" />
          <col className="w-[15%]" data-column-id="code" />
          <col className="w-[14%]" data-column-id="metric" />
          <col className="w-[14%]" data-column-id="censorship" />
          <col className="w-[9%]" data-column-id="rating" />
        </colgroup>
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-normal text-slate-500">
          <tr>
            <RelatedSortableHeader
              label="AVAIL"
              sortMode={sortMode}
              sortAsc="availabilityAsc"
              sortDesc="availabilityDesc"
              onSortModeChange={onSortModeChange}
            />
            <th className="min-w-0 overflow-hidden px-3 py-3">
              <span className="block truncate">FAV</span>
            </th>
            <RelatedSortableHeader
              label="TITLE"
              sortLabel="Title"
              sortMode={sortMode}
              sortAsc="az"
              sortDesc="za"
              onSortModeChange={onSortModeChange}
            />
            <RelatedSortableHeader
              label="CODE"
              sortMode={sortMode}
              sortAsc="codeAsc"
              sortDesc="codeDesc"
              onSortModeChange={onSortModeChange}
            />
            <RelatedSortableHeader
              label={kind === "images" ? "TOTAL" : "DURATION"}
              sortMode={sortMode}
              sortAsc="metricAsc"
              sortDesc="metricDesc"
              onSortModeChange={onSortModeChange}
            />
            <RelatedSortableHeader
              label="CENSOR"
              sortMode={sortMode}
              sortAsc="censorshipAsc"
              sortDesc="censorshipDesc"
              onSortModeChange={onSortModeChange}
            />
            <RelatedSortableHeader
              label="RATING"
              sortMode={sortMode}
              sortAsc="ratingAsc"
              sortDesc="ratingDesc"
              onSortModeChange={onSortModeChange}
            />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item, index) => (
            <tr
              key={`${item.title}-${index}`}
              className="h-[4.25rem] transition hover:bg-slate-50/80"
            >
              <td className="min-w-0 overflow-hidden px-3 py-3">
                <RelatedTableStatusChip value={detailTableValue(item.availability)} tone="availability" />
              </td>
              <td className="min-w-0 overflow-hidden px-3 py-3">
                <RelatedTableFavorite item={item} kind={kind} index={index} />
              </td>
              <td className="min-w-0 overflow-hidden px-3 py-3 font-semibold text-slate-900">
                {item.routeTo && !item.unresolved ? (
                  <Link to={item.routeTo} className="block min-w-0 max-w-full truncate whitespace-nowrap hover:text-sakura-600" title={item.title}>
                    {detailTableValue(item.title)}
                  </Link>
                ) : (
                  <span className="block min-w-0 max-w-full truncate whitespace-nowrap" title={detailTableValue(item.title)}>
                    {detailTableValue(item.title)}
                  </span>
                )}
              </td>
              <td className="min-w-0 overflow-hidden px-3 py-3 text-slate-600">
                <RelatedTablePlainValue value={detailTableValue(item.code)} />
              </td>
              <td className="min-w-0 overflow-hidden px-3 py-3 text-slate-600">
                <RelatedTablePlainValue value={detailTableValue(item.metadata)} />
              </td>
              <td className="min-w-0 overflow-hidden px-3 py-3">
                <RelatedTableStatusChip value={detailTableValue(item.censorship)} tone="censorship" />
              </td>
              <td className="min-w-0 overflow-hidden px-3 py-3">
                <RelatedTableRatingChip rating={item.rating} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </StickyHorizontalScroll>
    </div>
  );
}

function RelatedSortableHeader({
  label,
  sortLabel = label,
  sortMode,
  sortAsc,
  sortDesc,
  onSortModeChange,
}: {
  label: string;
  sortLabel?: string;
  sortMode: RelatedSortMode;
  sortAsc: RelatedSortMode;
  sortDesc: RelatedSortMode;
  onSortModeChange: (sortMode: RelatedSortMode) => void;
}) {
  const activeAscending = sortMode === sortAsc;
  const activeDescending = sortMode === sortDesc;
  const active = activeAscending || activeDescending;
  const nextSortMode = activeAscending ? sortDesc : sortAsc;

  return (
    <th
      aria-sort={
        activeAscending ? "ascending" : activeDescending ? "descending" : "none"
      }
      className="min-w-0 overflow-hidden px-3 py-3"
    >
      <button
        type="button"
        aria-label={`Sort by ${sortLabel}`}
        title={`Sort by ${sortLabel}`}
        className={[
          "inline-flex max-w-full items-center gap-1 text-left font-semibold transition hover:text-sakura-700 focus:outline-none",
          active ? "text-sakura-800" : "",
        ].join(" ")}
        onClick={() => onSortModeChange(nextSortMode)}
      >
        <span className="truncate">{label}</span>
        {active && (
          <span aria-hidden="true" className="text-[10px] text-sakura-700">
            {activeAscending ? "↑" : "↓"}
          </span>
        )}
      </button>
    </th>
  );
}

function RelatedTablePlainValue({ value }: { value: string }) {
  return (
    <span className="block min-w-0 max-w-full truncate whitespace-nowrap" title={value}>
      {value}
    </span>
  );
}

function RelatedTableStatusChip({
  value,
  tone,
}: {
  value: string;
  tone: "availability" | "censorship";
}) {
  return (
    <span
      className={[
        "inline-flex w-fit max-w-full items-center overflow-hidden rounded-md border px-2.5 py-1 text-xs font-semibold",
        relatedTableStatusToneClass(value, tone),
      ].join(" ")}
      title={value}
      data-testid="performer-related-table-status-chip"
    >
      <span className="truncate">{value}</span>
    </span>
  );
}

function RelatedTableRatingChip({ rating }: { rating?: number | null }) {
  const value =
    typeof rating === "number" && Number.isFinite(rating)
      ? rating.toFixed(1)
      : "N/A";

  return (
    <span
      className="inline-flex w-fit max-w-full items-center overflow-hidden rounded-md border border-sakura-200 bg-sakura-50 px-2.5 py-1 text-xs font-semibold text-sakura-700"
      title={value}
      data-testid="performer-related-table-rating-chip"
    >
      {value}
    </span>
  );
}

function RelatedTableFavorite({
  item,
  kind,
  index,
}: {
  item: NonNullable<DetailSection["relatedCatalogRecords"]>[number];
  kind: "videos" | "images";
  index: number;
}) {
  const [favorite, setFavorite] = useState(Boolean(item.favorite));

  useEffect(() => {
    setFavorite(Boolean(item.favorite));
  }, [item.favorite, item.routeTo, item.title]);

  function handleFavoriteClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!item.routeTo || item.unresolved) {
      return;
    }

    const id = item.routeTo.split("/").pop();
    if (!id) {
      return;
    }

    const nextFavorite = !favorite;
    setFavorite(nextFavorite);

    if (!isTauriRuntimeAvailable()) {
      return;
    }

    const updateFn = kind === "videos" ? updateVideo : updateImage;
    updateFn(id, { favorite: nextFavorite })
      .then((updatedRecord) => {
        if (!updatedRecord) {
          setFavorite(!nextFavorite);
          return;
        }
        setFavorite(updatedRecord.favorite);
      })
      .catch(() => setFavorite(!nextFavorite));
  }

  return (
    <button
      type="button"
      aria-label={favorite ? "Remove from Favorites" : "Add to Favorites"}
      title={favorite ? "Favorite" : "Not favorite"}
      disabled={!item.routeTo || item.unresolved}
      className={[
        "inline-flex size-9 items-center justify-center rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-sakura-200 disabled:cursor-not-allowed disabled:opacity-50",
        favorite
          ? "border-sakura-200 bg-sakura-50 text-sakura-600"
          : "border-slate-200 bg-white text-slate-400 hover:border-sakura-200 hover:text-sakura-500",
      ].join(" ")}
      data-testid="performer-related-table-favorite-button"
      data-row-index={index}
      onClick={handleFavoriteClick}
    >
      <Star size={16} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}

function detailTableValue(value: string | number | null | undefined) {
  const label = typeof value === "number" ? String(value) : value?.trim();
  return label && !isEmptyDetailValue(label) ? label : "N/A";
}

function relatedTableStatusToneClass(
  value: string,
  tone: "availability" | "censorship",
) {
  if (value === "N/A") {
    return "border-slate-200 bg-slate-50 text-slate-500";
  }

  if (tone === "availability") {
    if (value === "Owned") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    if (value === "Not Owned") {
      return "border-rose-200 bg-rose-50 text-rose-700";
    }
    if (value === "Missing") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }
  }

  if (value === "Unknown") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function sortRelatedCatalogRecords(
  items: NonNullable<DetailSection["relatedCatalogRecords"]>,
  sortMode: RelatedSortMode,
) {
  return items
    .map((item, index) => ({
      item,
      index,
      availability: normalizedRelatedSortText(item.availability),
      censorship: normalizedRelatedSortText(item.censorship),
      code: normalizedRelatedSortText(item.code),
      metric: relatedMetricSortValue(item.metadata),
      rating: relatedRatingSortValue(item.rating),
      title: normalizedRelatedSortText(item.title) ?? "",
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

      if (sortMode === "availabilityAsc" || sortMode === "availabilityDesc") {
        return compareRelatedTextSort(
          a.availability,
          b.availability,
          a.index,
          b.index,
          sortMode === "availabilityAsc",
        );
      }

      if (sortMode === "codeAsc" || sortMode === "codeDesc") {
        return compareRelatedTextSort(
          a.code,
          b.code,
          a.index,
          b.index,
          sortMode === "codeAsc",
        );
      }

      if (sortMode === "metricAsc" || sortMode === "metricDesc") {
        return compareRelatedNumberSort(
          a.metric,
          b.metric,
          a.index,
          b.index,
          sortMode === "metricAsc",
        );
      }

      if (sortMode === "censorshipAsc" || sortMode === "censorshipDesc") {
        return compareRelatedTextSort(
          a.censorship,
          b.censorship,
          a.index,
          b.index,
          sortMode === "censorshipAsc",
        );
      }

      if (sortMode === "ratingAsc" || sortMode === "ratingDesc") {
        return compareRelatedNumberSort(
          a.rating,
          b.rating,
          a.index,
          b.index,
          sortMode === "ratingAsc",
        );
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

function normalizedRelatedSortText(value: string | number | null | undefined) {
  const text = typeof value === "number" ? String(value) : value?.trim();
  return text && !isEmptyDetailValue(text) ? text.toLocaleLowerCase() : null;
}

function relatedMetricSortValue(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = value?.toString().trim();
  if (!text || isEmptyDetailValue(text)) {
    return null;
  }

  const numericMatch = text.match(/-?\d+(?:\.\d+)?/);
  return numericMatch ? Number(numericMatch[0]) : null;
}

function relatedRatingSortValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compareRelatedTextSort(
  a: string | null,
  b: string | null,
  aIndex: number,
  bIndex: number,
  ascending: boolean,
) {
  if (a === null || b === null) {
    if (a !== b) {
      return a === null ? 1 : -1;
    }
    return aIndex - bIndex;
  }

  const comparison = a.localeCompare(b);
  if (comparison !== 0) {
    return ascending ? comparison : -comparison;
  }
  return aIndex - bIndex;
}

function compareRelatedNumberSort(
  a: number | null,
  b: number | null,
  aIndex: number,
  bIndex: number,
  ascending: boolean,
) {
  if (a === null || b === null) {
    if (a !== b) {
      return a === null ? 1 : -1;
    }
    return aIndex - bIndex;
  }

  if (a !== b) {
    return ascending ? a - b : b - a;
  }
  return aIndex - bIndex;
}

function filterRelatedCatalogRecords(
  items: NonNullable<DetailSection["relatedCatalogRecords"]>,
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) =>
    [
      item.title,
      item.originalTitle,
      item.code,
      item.publisherLabel,
      item.metadata,
      item.releaseDate,
    ]
      .filter(Boolean)
      .some((value) =>
        String(value).toLocaleLowerCase().includes(normalizedQuery),
      ),
  );
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
    return "N/A";
  }

  const match = /^(\d{4})/.exec(value.trim());
  return match?.[1] ?? "N/A";
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

const GALLERY_BATCH_SIZE = 15;

function GalleryGrid({ paths }: { paths: string[] }) {
  const [visibleCount, setVisibleCount] = useState(GALLERY_BATCH_SIZE);
  const [viewerPayload, setViewerPayload] =
    useState<GlobalImageViewerWindowPayload | null>(null);
  const viewerOpeningRef = useRef(false);
  const visiblePaths = paths.slice(0, visibleCount);
  const canLoadMore = visibleCount < paths.length;

  useEffect(() => {
    setVisibleCount(GALLERY_BATCH_SIZE);
    setViewerPayload(null);
    viewerOpeningRef.current = false;
  }, [paths]);

  async function handlePreviewOpen(index: number) {
    if (viewerOpeningRef.current) {
      return;
    }

    viewerOpeningRef.current = true;
    const payload = createGlobalImageViewerWindowPayload({
      images: paths.map((path) => ({ path })),
      initialIndex: index,
    });
    try {
      const viewerResult = await openGlobalImageViewerWindow(payload);

      if (viewerResult.mode === "fallback") {
        logGlobalViewerFallback("detail gallery preview", viewerResult);
        setViewerPayload(payload);
      }
    } finally {
      viewerOpeningRef.current = false;
    }
  }

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
            <div
              className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
              data-testid="image-detail-gallery-grid"
            >
              {visiblePaths.map((path, index) => (
                <GalleryImageTile
                  key={`${path}-${index}`}
                  path={path}
                  label={`Gallery image ${index + 1}`}
                  onPreview={() => void handlePreviewOpen(index)}
                />
              ))}
            </div>
            {canLoadMore && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((current) => current + GALLERY_BATCH_SIZE)
                  }
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600"
                >
                  Load More
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleCount(paths.length)}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600"
                >
                  Show All
                </button>
              </div>
            )}
          </>
        )}
      </section>
      {viewerPayload && viewerPayload.images[viewerPayload.initialIndex] && (
        <GlobalImageViewer
          ariaLabel={viewerPayload.ariaLabel}
          images={viewerPayload.images}
          initialIndex={viewerPayload.initialIndex}
          onClose={() => setViewerPayload(null)}
          openRequestId={viewerPayload.openRequestId}
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

function CardTitle({
  title,
  icon: Icon,
}: {
  title: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-sakura-50/80 text-sakura-500"
        data-testid="detail-section-icon"
      >
        <Icon size={17} aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
    </div>
  );
}

function LabelBlock({
  title,
  labels,
  oneRowOverflow = false,
}: {
  title: string;
  labels: string[];
  oneRowOverflow?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {oneRowOverflow ? (
        <OverflowChipList ariaLabel={`Detail ${title.toLowerCase()}`} labels={labels} />
      ) : (
        <div className="mt-3 flex min-w-0 flex-wrap gap-2">
          {labels.map((label) => (
            <Chip key={label} label={label} tone="accentSoft" />
          ))}
        </div>
      )}
    </div>
  );
}

function OverflowChipList({
  ariaLabel,
  labels,
}: {
  ariaLabel: string;
  labels: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const cleanLabels = labels
    .map(cleanDetailChipLabel)
    .filter(Boolean)
    .filter((label, index, current) => current.indexOf(label) === index);
  const visibleLabels = expanded
    ? cleanLabels
    : cleanLabels.slice(0, DETAIL_CHIP_VISIBLE_LIMIT);
  const hiddenCount = Math.max(0, cleanLabels.length - visibleLabels.length);

  return (
    <div className="mt-3 min-w-0">
      <div
        aria-label={ariaLabel}
        data-testid="detail-category-chip-row"
        className={[
          "flex min-w-0 gap-2",
          expanded ? "flex-wrap" : "max-h-14 flex-wrap overflow-hidden",
        ].join(" ")}
      >
        {visibleLabels.map((label) => (
          <Chip key={label} label={label} tone="accentSoft" />
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            aria-label={`Show ${hiddenCount} more categories`}
            aria-expanded={expanded}
            onClick={() => setExpanded(true)}
            className="inline-flex shrink-0 items-center rounded-md border border-sakura-100 bg-sakura-50/70 px-2.5 py-1 text-xs font-semibold text-sakura-600 transition hover:border-sakura-200 hover:bg-sakura-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 focus-visible:ring-offset-2"
          >
            +{hiddenCount}
          </button>
        )}
        {expanded && cleanLabels.length > DETAIL_CHIP_VISIBLE_LIMIT && (
          <button
            type="button"
            aria-label="Collapse categories"
            onClick={() => setExpanded(false)}
            className="inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-sakura-200 hover:text-sakura-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 focus-visible:ring-offset-2"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

function cleanDetailChipLabel(label: string) {
  return label
    .trim()
    .replace(/^\[\s*["']?/, "")
    .replace(/["']?\s*\]$/, "")
    .replace(/^(["'])(.*)\1$/, "$2")
    .trim();
}

function Chip({
  label,
  tone,
  icon: Icon,
}: {
  label: string;
  tone: "green" | "orange" | "accent" | "accentSoft" | "neutral";
  icon?: typeof Heart;
}) {
  const toneClass = {
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    orange: "border-orange-100 bg-orange-50 text-orange-600",
    accent: "border-sakura-100 bg-sakura-50 text-sakura-600",
    accentSoft: "border-sakura-100 bg-sakura-50/70 text-sakura-600",
    neutral: "border-slate-200 bg-slate-100 text-slate-600",
  }[tone];

  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${toneClass}`}
      title={label}
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
