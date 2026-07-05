import { BadgeCheck, Image, Tags, UserRound, Video, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { localImagePathToAssetSrc } from "../runtime/localAsset";
import { useMediaAssetScopeReady } from "../runtime/MediaAssetScopeContext";
import { useTranslation } from "../lib/LanguageContext";

export type CategoryCatalogCardStatus = "Managed" | "Unused Managed";

export type CategoryCatalogCardData = {
  name: string;
  parentName: string | null;
  childCount?: number;
  description: string;
  thumbnailPath: string;
  videos: number;
  images: number;
  performers: number;
  credits?: number;
  total: number;
  status: CategoryCatalogCardStatus;
};

function CategoryCatalogCard({
  category,
  actions,
  onClick,
  density = "comfortable",
  thumbnailShape = "wide",
  emptyDescriptionText,
}: {
  category: CategoryCatalogCardData;
  actions?: ReactNode;
  onClick?: () => void;
  density?: "comfortable" | "compact";
  thumbnailShape?: "wide" | "square";
  emptyDescriptionText?: string;
}) {
  const t = useTranslation();
  const resolvedEmptyDescription =
    emptyDescriptionText ?? t("categoryCard.noDescription");
  const cardKind = category.childCount && category.childCount > 0
    ? "parent"
    : category.parentName
      ? "child"
      : "root";
  const articleTone =
    cardKind === "parent"
      ? "border-sakura-100 bg-sakura-50"
      : cardKind === "child"
        ? "border-slate-200 bg-white"
        : "border-slate-200 bg-slate-50";
  const contentTone =
    density === "compact" ? "px-3 pb-3 pt-3" : "px-3 pb-3 pt-4";
  const statBaseTone =
    cardKind === "parent"
      ? "bg-white"
      : cardKind === "child"
        ? "bg-sakura-50"
        : "bg-white";
  const relationshipText =
    cardKind === "parent"
      ? t(
          category.childCount === 1
            ? "categoryCard.childCount"
            : "categoryCard.childrenCount",
          { count: String(category.childCount) },
        )
      : category.parentName
        ? t("categoryCard.childOf", { name: category.parentName })
        : t("categoryCard.noParent");

  return (
    <article
      aria-label={t("categoryCard.label", { name: category.name })}
      data-category-card-kind={cardKind}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`rounded-lg border p-3 shadow-sm ${onClick ? "cursor-pointer transition hover:border-sakura-200 focus:outline-none focus:ring-4 focus:ring-sakura-100" : ""} ${articleTone}`}
    >
      <CategoryThumbnail category={category} shape={thumbnailShape} />

      <div className={contentTone}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h2
              className={`truncate font-semibold tracking-normal text-slate-950 ${
                density === "compact" ? "text-base" : "text-lg"
              }`}
            >
              {category.name}
            </h2>
            <p className="mt-1 truncate text-sm font-medium text-slate-500">
              {relationshipText}
            </p>
          </div>
          <div className="min-w-12 text-right">
            <p className="text-xs font-semibold text-slate-500">{t("common.records")}</p>
            <p
              className={`mt-1 font-semibold text-slate-950 ${
                density === "compact" ? "text-xl" : "text-2xl"
              }`}
            >
              {category.total}
            </p>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          <CountBlock
            label={t("common.videos")}
            value={category.videos}
            icon={Video}
            statBaseTone={statBaseTone}
            to={categoryUsageLink("videos", category.name)}
          />
          <CountBlock
            label={t("common.credits")}
            value={category.credits ?? 0}
            icon={BadgeCheck}
            statBaseTone={statBaseTone}
          />
          <CountBlock
            label={t("common.images")}
            value={category.images}
            icon={Image}
            statBaseTone={statBaseTone}
            to={categoryUsageLink("images", category.name)}
          />
          <CountBlock
            label={t("common.performers")}
            value={category.performers}
            icon={UserRound}
            statBaseTone={statBaseTone}
            to={categoryUsageLink("performers", category.name)}
          />
        </dl>

        <p className="mt-4 line-clamp-2 text-sm font-medium leading-6 text-slate-500">
          {formatDescription(category.description, resolvedEmptyDescription)}
        </p>

        {actions && <div className="mt-4">{actions}</div>}
      </div>
    </article>
  );
}

function CategoryThumbnail({
  category,
  shape,
}: {
  category: CategoryCatalogCardData;
  shape: "wide" | "square";
}) {
  const t = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const assetSrc = localImagePathToAssetSrc(category.thumbnailPath);
  const showImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [assetSrc, mediaAssetScopeReady]);

  return (
    <div
      className={`relative flex ${
        shape === "square" ? "aspect-square" : "aspect-[3/2]"
      } category-accent-placeholder w-full items-center justify-center overflow-hidden rounded-lg text-sakura-500`}
    >
      {showImage ? (
        <img
          src={assetSrc ?? undefined}
          alt={`${category.name} thumbnail`}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <>
          <div
            className="category-accent-placeholder-overlay absolute inset-0"
            aria-hidden="true"
          />
          <div
            className="relative z-10 flex size-16 items-center justify-center rounded-full bg-white/70 text-sakura-500"
            aria-label={t("category.thumbnailPlaceholder")}
          >
            <Tags className="opacity-75" size={28} />
          </div>
        </>
      )}
    </div>
  );
}

function CountBlock({
  label,
  value,
  icon: Icon,
  statBaseTone,
  to,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  statBaseTone: string;
  to?: string;
}) {
  const stateTone = value > 0 ? "text-sakura-600" : "text-slate-500";
  const content = (
    <>
      <dt className="sr-only">{label}</dt>
      <dd
        className={`flex min-w-0 items-center justify-center gap-2 text-base font-semibold ${stateTone}`}
        aria-label={value > 0 && to ? undefined : `${label} ${value}`}
      >
        <Icon aria-hidden="true" size={16} />
        <span className="sr-only">{label}</span>
        <span className="tabular-nums">{value}</span>
      </dd>
    </>
  );

  return value > 0 && to ? (
    <Link
      className={`rounded-md px-2.5 py-2 ${statBaseTone} ${stateTone}`}
      title={label}
      aria-label={`${label} ${value}`}
      to={to}
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </Link>
  ) : (
    <div
      className={`rounded-md px-2.5 py-2 ${statBaseTone}`}
      title={label}
    >
      {content}
    </div>
  );
}

function categoryUsageLink(kind: "videos" | "images" | "performers", category: string) {
  return `/${kind}?category=${encodeURIComponent(category)}`;
}

function formatDescription(description: string, emptyDescriptionText: string) {
  const trimmed = description.trim();
  if (!trimmed) {
    return emptyDescriptionText;
  }

  const maxLength = 118;
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength).trimEnd()}....`;
}

export default CategoryCatalogCard;
