import { Image, Tags, UserRound, Video, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { localImagePathToAssetSrc } from "../runtime/localAsset";
import { useMediaAssetScopeReady } from "../runtime/MediaAssetScopeContext";

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
  total: number;
  status: CategoryCatalogCardStatus;
};

function CategoryCatalogCard({
  category,
  actions,
}: {
  category: CategoryCatalogCardData;
  actions?: ReactNode;
}) {
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
  const contentTone = "px-3 pb-3 pt-4";
  const statBaseTone =
    cardKind === "parent"
      ? "bg-white"
      : cardKind === "child"
        ? "bg-sakura-50"
        : "bg-white";
  const relationshipText =
    cardKind === "parent"
      ? `${category.childCount} ${
          category.childCount === 1 ? "child category" : "child categories"
        }`
      : category.parentName
        ? `Child of ${category.parentName}`
        : "No Parent";

  return (
    <article
      aria-label={`Category ${category.name}`}
      data-category-card-kind={cardKind}
      className={`rounded-lg border p-3 shadow-sm ${articleTone}`}
    >
      <CategoryThumbnail category={category} />

      <div className={contentTone}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-normal text-slate-950">
              {category.name}
            </h2>
            <p className="mt-1 truncate text-sm font-medium text-slate-500">
              {relationshipText}
            </p>
          </div>
          <div className="min-w-12 text-right">
            <p className="text-xs font-semibold text-slate-500">Records</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">
              {category.total}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 pt-2">
          <CountBlock
            label="Videos"
            value={category.videos}
            icon={Video}
            statBaseTone={statBaseTone}
          />
          <CountBlock
            label="Images"
            value={category.images}
            icon={Image}
            statBaseTone={statBaseTone}
          />
          <CountBlock
            label="Performers"
            value={category.performers}
            icon={UserRound}
            statBaseTone={statBaseTone}
          />
        </dl>

        <p className="mt-5 max-h-12 overflow-hidden text-sm font-medium leading-6 text-slate-500">
          {formatDescription(category.description)}
        </p>

        {actions && <div className="mt-4">{actions}</div>}
      </div>
    </article>
  );
}

function CategoryThumbnail({ category }: { category: CategoryCatalogCardData }) {
  const [imageFailed, setImageFailed] = useState(false);
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const assetSrc = localImagePathToAssetSrc(category.thumbnailPath);
  const showImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [assetSrc, mediaAssetScopeReady]);

  return (
    <div className="relative flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-lg bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.96),transparent_34%),radial-gradient(circle_at_78%_82%,rgba(244,114,182,0.14),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(253,242,248,0.94)_50%,rgba(252,231,243,0.78))] text-sakura-500">
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
            className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(255,255,255,0.95),transparent_32%),radial-gradient(circle_at_74%_78%,rgba(244,114,182,0.12),transparent_42%),radial-gradient(circle_at_45%_55%,rgba(251,207,232,0.18),transparent_48%)]"
            aria-hidden="true"
          />
          <div
            className="relative z-10 flex size-16 items-center justify-center rounded-full bg-white/70 text-sakura-500"
            aria-label="Category thumbnail placeholder"
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
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  statBaseTone: string;
}) {
  const stateTone = value > 0 ? "text-sakura-600" : "text-slate-500";

  return (
    <div
      className={`rounded-md px-2.5 py-2 ${statBaseTone}`}
      title={label}
    >
      <dt className="sr-only">{label}</dt>
      <dd
        className={`flex min-w-0 items-center justify-center gap-2 text-base font-semibold ${stateTone}`}
        aria-label={`${label} ${value}`}
      >
        <Icon aria-hidden="true" size={16} />
        <span className="sr-only">{label}</span>
        <span className="tabular-nums">{value}</span>
      </dd>
    </div>
  );
}

function formatDescription(description: string) {
  const trimmed = description.trim();
  if (!trimmed) {
    return "No description yet.";
  }

  const maxLength = 118;
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength).trimEnd()}....`;
}

export default CategoryCatalogCard;
