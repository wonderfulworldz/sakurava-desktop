import { Film } from "lucide-react";
import { Link } from "react-router-dom";
import type { HomeRecentItem } from "../../lib/homeData";
import { useTranslation } from "../../lib/LanguageContext";
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
  showCensorship?: boolean;
};

export function VideoLiteCard({
  item,
  linkTo,
  onFavoriteClick,
  favoriteInteractive,
  showCensorship = true,
}: VideoLiteCardProps) {
  const t = useTranslation();
  const title = displayValue(item.title);
  const duration = numericStatValue(item.duration);
  const quality = displayValue(item.quality);
  const censorshipStatus = normalizeCensorship(item.censorship);

  const content = (
    <>
      <CardThumbnail
        coverPath={item.coverPath}
        alt={`${title} cover`}
        aspectClass="aspect-[4/3]"
        favorite={item.favorite}
        favoriteInteractive={favoriteInteractive}
        onFavoriteClick={onFavoriteClick}
      />

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 px-0.5 pb-1 pt-2.5">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="min-w-0 line-clamp-2 text-sm font-bold leading-snug text-slate-950 dark:text-slate-50">{title}</p>
          <RatingBadge rating={item.rating} />
        </div>
        <div className="grid min-w-0 grid-cols-4 gap-1.5">
          <div className="col-span-2 flex min-w-0 items-center gap-1.5 rounded-lg bg-sakura-50 px-2 py-1.5 dark:bg-slate-700">
            <Film size={14} className="shrink-0 text-sakura-500" />
            <div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">{duration}</p><p className="text-[10px] leading-tight text-slate-500">{t(duration === "1" ? "unit.minute" : "unit.minutes")}</p></div>
          </div>
          {showCensorship && <div className="col-span-1 flex items-center justify-center rounded-lg bg-sakura-50 px-1.5 py-1.5 dark:bg-slate-700"><CensorshipIcon status={censorshipStatus} size={14} /></div>}
          <div className={`${showCensorship ? "col-span-1" : "col-span-2"} flex min-w-0 items-center justify-center rounded-lg bg-sakura-50 px-1.5 py-1.5 dark:bg-slate-700`}><span className="min-w-0 truncate text-xs font-bold text-slate-900 dark:text-slate-100">{quality}</span></div>
        </div>
      </div>
    </>
  );

  return (
    <Link
      to={linkTo}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:border-sakura-200 hover:shadow-md hover:shadow-sakura-100/60 dark:border-slate-700 dark:bg-slate-800"
    >
      {content}
    </Link>
  );
}
