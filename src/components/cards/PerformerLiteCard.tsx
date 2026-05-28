import { Film, Image as ImageIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { HomeRecentItem } from "../../lib/homeData";
import {
  CardThumbnail,
  displayValue,
  RatingBadge,
} from "./CardShared";

type PerformerLiteCardProps = {
  item: HomeRecentItem;
  linkTo: string;
  onFavoriteClick?: () => void;
};

export function PerformerLiteCard({ item, linkTo, onFavoriteClick }: PerformerLiteCardProps) {
  const name = displayValue(item.title);
  const filmography = displayValue(item.filmographyCount);
  const pictorials = displayValue(item.pictorialsCount);

  return (
    <Link
      to={linkTo}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:border-sakura-200 hover:shadow-md hover:shadow-sakura-100/60 dark:border-slate-700 dark:bg-slate-800"
    >
      <CardThumbnail
        coverPath={item.coverPath}
        alt={`${name} cover`}
        aspectClass="aspect-[4/3]"
        favorite={item.favorite}
        onFavoriteClick={onFavoriteClick}
      />

      <div className="flex flex-1 flex-col justify-between gap-2 px-0.5 pb-1 pt-2.5">
        {/* Name + Rating */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="min-w-0 line-clamp-2 text-sm font-bold leading-snug text-slate-950 dark:text-slate-50">
            {name}
          </p>
          <RatingBadge rating={item.rating} />
        </div>

        {/* Stats row: 1/2 + 1/2 */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex items-center gap-1.5 rounded-lg bg-sakura-50 px-2 py-1.5 dark:bg-slate-700">
            <Film size={14} className="shrink-0 text-sakura-500" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{filmography}</p>
              <p className="text-[10px] leading-tight text-slate-500">Filmography</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-sakura-50 px-2 py-1.5 dark:bg-slate-700">
            <ImageIcon size={14} className="shrink-0 text-sakura-500" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{pictorials}</p>
              <p className="text-[10px] leading-tight text-slate-500">Pictorials</p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
