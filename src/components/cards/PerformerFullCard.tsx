import { Calendar, Film, Image as ImageIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { PerformerCollectionItem } from "../../lib/collectionData";
import {
  CardThumbnail,
  CategoryChips,
  dashText,
  displayValue,
  RatingBadge,
  StatusBadge,
} from "./CardShared";

type PerformerFullCardProps = {
  item: PerformerCollectionItem;
  linkTo: string;
  placeholderLabel?: string;
  onFavoriteClick?: () => void;
};

export function PerformerFullCard({ item, linkTo, placeholderLabel, onFavoriteClick }: PerformerFullCardProps) {
  const name = dashText(item.name);
  const originalName = dashText(item.originalName);
  const status = dashText(item.status);
  const yearsActive = dashText(item.yearsActive);
  const filmography = displayValue(item.filmographyCountValue);
  const pictorials = displayValue(item.pictorialsCountValue);

  return (
    <Link
      to={linkTo}
      className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-sakura-200 hover:shadow-lg hover:shadow-sakura-100/40 dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="relative">
        <CardThumbnail
          coverPath={item.coverPath}
          alt={`${name} cover`}
          aspectClass="aspect-square"
          favorite={item.favorite}
          placeholderLabel={placeholderLabel}
          onFavoriteClick={onFavoriteClick}
        />
        <StatusBadge label={status} />
      </div>

      <div className="space-y-3 px-1 pb-1 pt-3">
        {/* Name + Rating */}
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h2 className="min-w-0 line-clamp-2 text-lg font-bold leading-snug text-slate-950 dark:text-slate-50">
            {name}
          </h2>
          <RatingBadge rating={item.ratingAverage} size="lg" />
        </div>

        {/* Original name + Years active */}
        <div className="flex min-w-0 items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span className="min-w-0 truncate font-medium italic">{originalName}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 font-medium">
            <Calendar size={14} />
            {yearsActive}
          </span>
        </div>

        {/* Stats row: 1/2 + 1/2 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2.5 rounded-xl bg-sakura-50 px-4 py-3 dark:bg-slate-700">
            <Film size={20} className="shrink-0 text-sakura-500" />
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">{filmography}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Filmography</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl bg-sakura-50 px-4 py-3 dark:bg-slate-700">
            <ImageIcon size={20} className="shrink-0 text-sakura-500" />
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">{pictorials}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Pictorials</p>
            </div>
          </div>
        </div>

        {/* Categories */}
        <CategoryChips categories={item.categories} maxVisible={5} size="lg" />
      </div>
    </Link>
  );
}
