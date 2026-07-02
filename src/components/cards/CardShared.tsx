import { AlertTriangle, Ban, CircleHelp, Eye, Heart, ScanLine, Star, Tag, UserRound } from "lucide-react";
import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import ContentThumbnailPlaceholder from "../ContentThumbnailPlaceholder";
import { localImagePathToAssetSrc } from "../../runtime/localAsset";
import { useMediaAssetScopeReady } from "../../runtime/MediaAssetScopeContext";

/* ─── Display Value Helper ─── */

export function displayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value === 0) return "n/a";
    return String(value);
  }
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed === "-" ||
    trimmed === "0" ||
    trimmed.toLowerCase() === "not detected yet" ||
    trimmed.toLowerCase() === "not set" ||
    trimmed.toLowerCase() === "unknown" ||
    trimmed.toLowerCase() === "unspecified"
  ) {
    return "n/a";
  }
  return trimmed;
}

/** Extract numeric-only value from strings like "24 min", "6 images", "128". */
export function numericStatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value === 0) return "n/a";
    return String(value);
  }
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed === "-" ||
    trimmed === "0" ||
    trimmed.toLowerCase() === "not detected yet" ||
    trimmed.toLowerCase() === "not set"
  ) {
    return "n/a";
  }
  // Extract leading number (e.g. "24 min" → "24", "6 images" → "6", "1,240 images" → "1,240")
  const match = trimmed.match(/^([\d,.\s]+)/);
  if (match) {
    return match[1].trim();
  }
  return trimmed;
}

/* ─── Thumbnail ─── */

export type CardThumbnailProps = {
  coverPath?: string;
  alt: string;
  aspectClass?: string;
  favorite: boolean;
  placeholderLabel?: string;
  onFavoriteClick?: () => void;
  favoriteInteractive?: boolean;
};

export function CardThumbnail({
  coverPath,
  alt,
  aspectClass = "aspect-[4/3]",
  favorite,
  placeholderLabel,
  onFavoriteClick,
  favoriteInteractive = true,
}: CardThumbnailProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const assetSrc = localImagePathToAssetSrc(coverPath);
  const showImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [assetSrc, mediaAssetScopeReady]);

  return (
    <div className="relative overflow-hidden rounded-xl bg-white dark:bg-slate-700">
      <div
        className={`relative flex items-center justify-center overflow-hidden ${aspectClass}`}
        role={showImage ? undefined : "img"}
        aria-label={showImage ? undefined : (placeholderLabel || alt)}
      >
        {showImage ? (
          <img
            src={assetSrc ?? undefined}
            alt={alt}
            className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <ContentThumbnailPlaceholder />
        )}
      </div>
      <FavoriteButton
        favorite={favorite}
        interactive={favoriteInteractive}
        onClick={onFavoriteClick}
      />
    </div>
  );
}

/* ─── Favorite Button ─── */

function FavoriteButton({
  favorite,
  interactive,
  onClick,
}: {
  favorite: boolean;
  interactive: boolean;
  onClick?: () => void;
}) {
  const className = [
    "absolute right-2.5 top-2.5 flex size-9 items-center justify-center rounded-full shadow-md",
    interactive ? "transition-transform hover:scale-110" : "",
    favorite
      ? "bg-sakura-500 text-white"
      : "bg-white/95 text-sakura-500",
  ].join(" ");

  if (!interactive) {
    return (
      <span
        className={className}
        aria-label={favorite ? "Favorite" : "Not favorite"}
        title={favorite ? "Favorite" : "Not favorite"}
      >
        <Heart size={18} fill={favorite ? "currentColor" : "none"} strokeWidth={2} />
      </span>
    );
  }

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick?.();
  };

  return (
    <button
      type="button"
      className={className}
      aria-label={favorite ? "Favorite" : "Not favorite"}
      onClick={handleClick}
    >
      <Heart size={18} fill={favorite ? "currentColor" : "none"} strokeWidth={2} />
    </button>
  );
}

/* ─── Status / Availability Badge ─── */

export type BadgeProps = {
  label: string;
  tone?: "pink" | "slate";
};

export function StatusBadge({ label, tone = "pink" }: BadgeProps) {
  if (!label || label === "-" || label === "Unspecified" || label === "n/a") return null;

  const colors =
    tone === "pink"
      ? "border-sakura-200 bg-white/95 text-sakura-600"
      : "border-slate-200 bg-white/95 text-slate-700";

  return (
    <span
      className={`absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-md ${colors}`}
    >
      <span className="size-2 rounded-full bg-sakura-500" />
      {label}
    </span>
  );
}

/* ─── Rating Pill ─── */

export function RatingBadge({ rating, size = "sm" }: { rating?: number | null; size?: "sm" | "lg" }) {
  const label =
    typeof rating === "number" && Number.isFinite(rating) && rating > 0
      ? rating.toFixed(1)
      : "n/a";

  const sizeClasses = size === "lg"
    ? "px-2.5 py-1.5 text-sm gap-1.5"
    : "px-2 py-1 text-xs gap-1";

  return (
    <span
      aria-label={`Rating ${label}`}
      className={`inline-flex shrink-0 items-center rounded-lg border border-sakura-100 bg-sakura-50 font-bold text-sakura-600 ${sizeClasses}`}
    >
      <Star size={size === "lg" ? 15 : 13} fill="currentColor" />
      {label}
    </span>
  );
}

/* ─── Censorship Display ─── */

export type CensorshipStatus = "Censored" | "Uncensored" | "Reduced" | "Leaked" | "Unknown";

export function normalizeCensorship(value: string | null | undefined): CensorshipStatus {
  const v = value?.trim().toLowerCase() ?? "";
  if (v === "censored") return "Censored";
  if (v === "uncensored") return "Uncensored";
  if (v === "reduced" || v === "reduced mosaic") return "Reduced";
  if (v === "leaked") return "Leaked";
  return "Unknown";
}

export function censorshipLabel(status: CensorshipStatus): string {
  if (status === "Reduced") return "Reduced";
  return status;
}

export function CensorshipIcon({ status, size = 16 }: { status: CensorshipStatus; size?: number }) {
  if (status === "Censored") {
    return <Ban size={size} className="text-sakura-500" aria-label="Censored" />;
  }
  if (status === "Uncensored") {
    return <Eye size={size} className="text-sakura-500" aria-label="Uncensored" />;
  }
  if (status === "Reduced") {
    return <ScanLine size={size} className="text-sakura-500" aria-label="Reduced" />;
  }
  if (status === "Leaked") {
    return <AlertTriangle size={size} className="text-sakura-500" aria-label="Leaked" />;
  }
  return <CircleHelp size={size} className="text-sakura-500" aria-label="Unknown censorship" />;
}

/* ─── Category Chips ─── */

export function CategoryChips({ categories, maxVisible, size = "sm" }: { categories: string[]; maxVisible?: number; size?: "sm" | "lg" }) {
  const valid = categories.filter((c) => c && c !== "-" && c !== "No category");

  if (valid.length === 0) {
    return null;
  }

  const limit = maxVisible ?? valid.length;
  const visible = valid.slice(0, limit);
  const overflow = valid.length - visible.length;

  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
      <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
        {visible.map((category) => (
          <CategoryChip key={category} label={category} size={size} />
        ))}
      </div>
      {overflow > 0 && (
        <span className={`inline-flex shrink-0 rounded-md border border-sakura-100 bg-sakura-50 font-semibold text-sakura-600 ${size === "lg" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]"}`}>
          +{overflow}
        </span>
      )}
    </div>
  );
}

function CategoryChip({ label, size = "sm" }: { label: string; size?: "sm" | "lg" }) {
  const sizeClasses = size === "lg"
    ? "px-2.5 py-1 text-xs"
    : "px-2 py-0.5 text-[11px]";

  return (
    <span className={`inline-flex min-w-0 max-w-[14ch] shrink rounded-md border border-sakura-100 bg-sakura-50 font-semibold text-sakura-600 ${sizeClasses}`}>
      <span className="truncate">{label}</span>
    </span>
  );
}

/* ─── Stat Box ─── */

export function StatBox({
  icon,
  value,
  label,
  size = "sm",
}: {
  icon: ReactNode;
  value: string;
  label: string;
  size?: "sm" | "lg";
}) {
  const padding = size === "lg" ? "px-4 py-3" : "px-3 py-2";
  const valueSize = size === "lg" ? "text-base font-bold" : "text-sm font-bold";
  const labelSize = size === "lg" ? "text-xs" : "text-xs";

  return (
    <div className={`flex min-w-0 items-center gap-2.5 rounded-xl bg-sakura-50 dark:bg-slate-700 ${padding}`}>
      <span className="shrink-0 text-sakura-500">
        {icon}
      </span>
      <div className="min-w-0">
        <p className={`${valueSize} text-slate-900 dark:text-slate-100`}>{value}</p>
        <p className={`${labelSize} text-slate-500 dark:text-slate-400`}>{label}</p>
      </div>
    </div>
  );
}

export type CreditMetadata = {
  id: string;
  roleName?: string;
  creditType?: string;
};

export function CreditMetadataRows({
  rows,
}: {
  rows: CreditMetadata[];
}) {
  const normalizedRows = rows.length > 0
    ? rows
    : [{ id: "empty-credit-metadata" }];
  const visibleRows = normalizedRows.slice(0, 3);
  const overflow = Math.max(normalizedRows.length - visibleRows.length, 0);

  return (
    <div
      className="space-y-1.5 text-xs"
      data-testid="credit-metadata"
    >
      {visibleRows.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-2 gap-3"
          data-testid="credit-metadata-row"
        >
            <p className="flex min-w-0 items-center gap-2 font-medium text-slate-500">
              <UserRound size={14} className="shrink-0 text-sakura-500" />
              <span className="truncate">{row.roleName || "n/a"}</span>
            </p>
            <p className="flex min-w-0 items-center gap-2 font-medium text-slate-500">
              <Tag size={14} className="shrink-0 text-sakura-500" />
              <span className="truncate">{row.creditType || "n/a"}</span>
            </p>
        </div>
      ))}
      {overflow > 0 && (
        <p className="text-xs font-medium text-slate-400">+{overflow} more</p>
      )}
    </div>
  );
}

/* ─── Utility (legacy compat) ─── */

export function dashText(value: string | number | null | undefined): string {
  return displayValue(value);
}
