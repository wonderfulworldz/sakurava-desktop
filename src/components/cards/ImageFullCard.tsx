import { Calendar, Image as ImageIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { ImageCollectionItem } from "../../lib/collectionData";
import { useTranslation } from "../../lib/LanguageContext";
import { translateUiDisplayLabel } from "../../lib/uiDisplayLabels";
import {
  CardThumbnail,
  CategoryChips,
  CensorshipIcon,
  dashText,
  displayValue,
  normalizeCensorship,
  RatingBadge,
  StatusBadge,
} from "./CardShared";

type ImageFullCardProps = {
  item: ImageCollectionItem;
  linkTo: string;
  placeholderLabel?: string;
  onFavoriteClick?: () => void;
  showCensorship?: boolean;
};

export function ImageFullCard({ item, linkTo, placeholderLabel, onFavoriteClick, showCensorship = true }: ImageFullCardProps) {
  const t = useTranslation();
  const title = dashText(item.title);
  const code = dashText(item.code);
  const year = item.releaseYear && Number.isFinite(item.releaseYear) ? String(item.releaseYear) : "n/a";
  const imageCountValue = displayValue(item.imageCountValue);
  const quality = dashText(item.quality);
  const censorshipStatus = normalizeCensorship(item.censorship);

  return (
    <Link
      to={linkTo}
      className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-sakura-200 hover:shadow-lg hover:shadow-sakura-100/40 dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="relative">
        <CardThumbnail
          coverPath={item.coverPath}
          alt={`${title} cover`}
          aspectClass="aspect-video"
          favorite={item.favorite}
          placeholderLabel={placeholderLabel}
          onFavoriteClick={onFavoriteClick}
        />
        <StatusBadge label={dashText(item.availability)} />
      </div>

      <div className="space-y-3 px-1 pb-1 pt-3">
        {/* Title + Rating */}
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h2 className="min-w-0 line-clamp-2 text-lg font-bold leading-snug text-slate-950 dark:text-slate-50">
            {title}
          </h2>
          <RatingBadge rating={item.ratingAverage} size="lg" />
        </div>

        {/* Code + Year */}
        <div className="flex min-w-0 items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span className="min-w-0 truncate font-medium">{code}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 font-medium">
            <Calendar size={14} />
            {year}
          </span>
        </div>

        {/* Stats row: 1/2 + 1/4 + 1/4 */}
        <div className="grid grid-cols-4 gap-2">
          <div className="col-span-2 flex items-center gap-2.5 rounded-xl bg-sakura-50 px-4 py-3 dark:bg-slate-700">
            <ImageIcon size={20} className="shrink-0 text-sakura-500" />
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">{imageCountValue}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(item.imageCountValue === 1 ? "unit.image" : "unit.images")}
              </p>
            </div>
          </div>
          {showCensorship && (
            <div className="col-span-1 flex flex-col items-center justify-center gap-1 rounded-xl bg-sakura-50 px-2 py-3 dark:bg-slate-700">
              <CensorshipIcon status={censorshipStatus} size={20} />
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{translateUiDisplayLabel(t, censorshipStatus)}</span>
            </div>
          )}
          <div className={`${showCensorship ? "col-span-1" : "col-span-2"} flex items-center justify-center rounded-xl bg-sakura-50 px-2 py-3 dark:bg-slate-700`}>
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{quality}</span>
          </div>
        </div>

        {/* Categories */}
        <CategoryChips categories={item.categories} maxVisible={2} size="lg" />
      </div>
    </Link>
  );
}
