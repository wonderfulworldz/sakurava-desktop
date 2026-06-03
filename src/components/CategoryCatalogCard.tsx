import { Tags } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { localImagePathToAssetSrc } from "../runtime/localAsset";
import { useMediaAssetScopeReady } from "../runtime/MediaAssetScopeContext";

export type CategoryCatalogCardStatus = "Managed" | "Unused Managed";

export type CategoryCatalogCardData = {
  name: string;
  parentName: string | null;
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
  return (
    <article
      aria-label={`Category ${category.name}`}
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-sakura-200"
    >
      <CategoryThumbnail category={category} />

      <div className="px-3 pb-3 pt-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-normal text-slate-950">
              {category.name}
            </h2>
            <p className="mt-1 truncate text-sm font-medium text-slate-500">
              {category.parentName ?? "No Parent"}
            </p>
          </div>
          <div className="min-w-12 text-right">
            <p className="text-xs font-semibold text-slate-500">Records</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">
              {category.total}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-200 pt-4">
          <CountBlock
            label="Videos"
            value={category.videos}
            categoryName={category.name}
            to={categoryRoute("videos", category.name)}
          />
          <CountBlock
            label="Images"
            value={category.images}
            categoryName={category.name}
            to={categoryRoute("images", category.name)}
          />
          <CountBlock
            label="Performers"
            value={category.performers}
            categoryName={category.name}
            to={categoryRoute("performers", category.name)}
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
    <div className="relative flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-sakura-50 via-white to-sakura-100 text-sakura-500 ring-1 ring-sakura-100">
      {showImage ? (
        <img
          src={assetSrc ?? undefined}
          alt={`${category.name} thumbnail`}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_30%_35%,rgba(244,114,182,0.22),transparent_28%),radial-gradient(circle_at_70%_45%,rgba(251,207,232,0.45),transparent_34%)]"
          aria-hidden="true"
        />
      )}
      {!showImage && <Tags className="relative z-10 opacity-70" size={28} />}
      <StatusBadge status={category.status} />
    </div>
  );
}

function StatusBadge({ status }: { status: CategoryCatalogCardStatus }) {
  return (
    <span className="absolute right-3 top-3 z-10 inline-flex rounded-md border border-sakura-200 bg-white/90 px-2.5 py-1 text-xs font-semibold text-sakura-600 shadow-sm backdrop-blur">
      {status}
    </span>
  );
}

function CountBlock({
  label,
  value,
  categoryName,
  to,
}: {
  label: string;
  value: number;
  categoryName: string;
  to: { pathname: string; search: string };
}) {
  const content = (
    <>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd
        className={`mt-1 text-lg font-semibold ${
          value > 0 ? "text-slate-950" : "text-slate-500"
        }`}
      >
        {value}
      </dd>
    </>
  );

  return (
    <div className="px-3 first:pl-0 last:pr-0">
      {value > 0 ? (
        <Link
          to={to}
          className="block rounded-md px-2 py-1 transition hover:bg-sakura-50 focus:outline-none focus:ring-2 focus:ring-sakura-200"
          aria-label={`Open ${label} filtered by category ${categoryName}`}
        >
          {content}
        </Link>
      ) : (
        <div className="block rounded-md px-2 py-1">{content}</div>
      )}
    </div>
  );
}

function categoryRoute(kind: "videos" | "images" | "performers", category: string) {
  return {
    pathname: `/${kind}`,
    search: `?category=${encodeURIComponent(category)}`,
  };
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
