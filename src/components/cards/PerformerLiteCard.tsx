import { Film, Image as ImageIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { HomeRecentItem } from "../../lib/homeData";
import { useTranslation } from "../../lib/LanguageContext";
import {
  CardThumbnail,
  CreditMetadataRows,
  type CreditMetadata,
  displayValue,
  RatingBadge,
} from "./CardShared";
import type { ManagedMediaRoleId } from "../../shared/managedMediaDescriptor";

type PerformerLiteCardProps = {
  item: HomeRecentItem;
  linkTo: string;
  onFavoriteClick?: () => void;
  favoriteInteractive?: boolean;
  creditMetadata?: CreditMetadata[];
  managedRoleId?: ManagedMediaRoleId;
};

export function PerformerLiteCard({
  item,
  linkTo,
  onFavoriteClick,
  favoriteInteractive,
  creditMetadata,
  managedRoleId = "performer_lite_card",
}: PerformerLiteCardProps) {
  const t = useTranslation();
  const name = displayValue(item.title);
  const filmography = displayValue(item.filmographyCount);
  const pictorials = displayValue(item.pictorialsCount);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:border-sakura-200 hover:shadow-md hover:shadow-sakura-100/60 dark:border-slate-700 dark:bg-slate-800">
      <Link to={linkTo} className="block">
      <CardThumbnail
        coverPath={item.coverPath}
        alt={`${name} cover`}
        aspectClass="aspect-[4/3]"
        favorite={item.favorite}
        favoriteInteractive={favoriteInteractive}
        onFavoriteClick={onFavoriteClick}
        managedMedia={{
          ownerKind: "performer",
          ownerId: item.key,
          roleId: managedRoleId,
        }}
      />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5 px-0.5 pb-1 pt-2.5">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Link
            to={linkTo}
            className="min-w-0 line-clamp-2 text-sm font-bold leading-snug text-slate-950 hover:text-sakura-600 dark:text-slate-50"
          >
            {name}
          </Link>
          <RatingBadge rating={item.rating} />
        </div>

        <CreditMetadataRows rows={creditMetadata ?? []} />

        <div className="mt-auto grid min-w-0 grid-cols-2 gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5 rounded-lg bg-sakura-50 px-2 py-1.5 dark:bg-slate-700">
            <Film size={14} className="shrink-0 text-sakura-500" />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">{filmography}</p>
              <p className="text-[10px] leading-tight text-slate-500">{t("form.filmography")}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 rounded-lg bg-sakura-50 px-2 py-1.5 dark:bg-slate-700">
            <ImageIcon size={14} className="shrink-0 text-sakura-500" />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">{pictorials}</p>
              <p className="text-[10px] leading-tight text-slate-500">{t("form.pictorials")}</p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
