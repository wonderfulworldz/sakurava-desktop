import { Film } from "lucide-react";
import { Link } from "react-router-dom";
import type { HomeRecentItem } from "../../lib/homeData";
import {
  CardThumbnail,
  CensorshipIcon,
  displayValue,
  normalizeCensorship,
  numericStatValue,
  RatingBadge,
} from "./CardShared";

type VideoLiteCardProps = {
  item: HomeRecentItem;
  linkTo: string;
  onFavoriteClick?: () => void;
  favoriteInteractive?: boolean;
};

export function VideoLiteCard({
  item,
  linkTo,
  onFavoriteClick,
  favoriteInteractive,
}: VideoLiteCardProps) {
  const title = displayValue(item.title);
  const duration = numericStatValue(item.duration);
  const quality = displayValue(item.quality);
  const censorshipStatus = normalizeCensorship(item.censorship);

  return (
    <Link
      to={linkTo}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:border-sakura-200 hover:shadow-md hover:shadow-sakura-100/60 dark:border-slate-700 dark:bg-slate-800"
    >
      <CardThumbnail
        coverPath={item.coverPath}
        alt={`${title} cover`}
        aspectClass="aspect-[4/3]"
        favorite={item.favorite}
        favoriteInteractive={favoriteInteractive}
        onFavoriteClick={onFavoriteClick}
      />

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 px-0.5 pb-1 pt-2.5">
        {/* Title + Rating */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="min-w-0 line-clamp-2 text-sm font-bold leading-snug text-slate-950 dark:text-slate-50">
            {title}
          </p>
          <RatingBadge rating={item.rating} />
        </div>

        {/* Stats row: 1/2 + 1/4 + 1/4 */}
        <div className="grid min-w-0 grid-cols-4 gap-1.5">
          <div className="col-span-2 flex min-w-0 items-center gap-1.5 rounded-lg bg-sakura-50 px-2 py-1.5 dark:bg-slate-700">
            <Film size={14} className="shrink-0 text-sakura-500" />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">{duration}</p>
              <p className="text-[10px] leading-tight text-slate-500">minutes</p>
            </div>
          </div>
          <div className="col-span-1 flex items-center justify-center rounded-lg bg-sakura-50 px-1.5 py-1.5 dark:bg-slate-700">
            <CensorshipIcon status={censorshipStatus} size={14} />
          </div>
          <div className="col-span-1 flex min-w-0 items-center justify-center rounded-lg bg-sakura-50 px-1.5 py-1.5 dark:bg-slate-700">
            <span className="min-w-0 truncate text-xs font-bold text-slate-900 dark:text-slate-100">{quality}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
