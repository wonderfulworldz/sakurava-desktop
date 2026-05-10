import { Grid2X2, Heart, List, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import type { CollectionConfig, CollectionItem } from "../lib/collectionData";

type CollectionPageProps = {
  config: CollectionConfig;
};

function CollectionPage({ config }: CollectionPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        action={
          <Link
            to={config.actionTo}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sakura-500 px-4 text-sm font-semibold text-white shadow-sm shadow-sakura-200 transition hover:bg-sakura-600"
          >
            <Plus size={17} />
            {config.actionLabel}
          </Link>
        }
      />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">
              {config.countLabel}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Static mock collection preview
            </p>
          </div>

          <CollectionToolbar config={config} />
        </div>
      </section>

      {config.items.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {config.items.map((item) => (
            <CollectionCard key={item.key} config={config} item={item} />
          ))}
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-slate-800">
            No items to show
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Collection cards will appear here when mock items are available.
          </p>
        </section>
      )}
    </div>
  );
}

function CollectionToolbar({ config }: CollectionPageProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_160px_160px_auto] xl:w-[760px]">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={17}
        />
        <input
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
          placeholder={config.searchPlaceholder}
          aria-label={`${config.title} search`}
        />
      </label>

      <label className="sr-only" htmlFor={`${config.kind}-filter`}>
        {config.filterLabel}
      </label>
      <select
        id={`${config.kind}-filter`}
        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
        defaultValue={config.filterOptions[0]}
      >
        {config.filterOptions.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor={`${config.kind}-sort`}>
        Sort
      </label>
      <select
        id={`${config.kind}-sort`}
        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
        defaultValue={config.sortOptions[0]}
      >
        {config.sortOptions.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>

      <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
        <button
          className="flex size-8 items-center justify-center rounded-md bg-white text-sakura-600 shadow-sm"
          type="button"
          aria-label="Grid view"
        >
          <Grid2X2 size={16} />
        </button>
        <button
          className="flex size-8 items-center justify-center rounded-md text-slate-400"
          type="button"
          aria-label="List view"
        >
          <List size={16} />
        </button>
      </div>
    </div>
  );
}

type CollectionCardProps = {
  config: CollectionConfig;
  item: CollectionItem;
};

function CollectionCard({ config, item }: CollectionCardProps) {
  const title = item.kind === "performers" ? item.name : item.title;
  const originalTitle =
    item.kind === "performers" ? item.originalName : item.originalTitle;

  return (
    <Link
      to={`/${config.kind}/${item.key}`}
      className="group overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-sakura-200 hover:shadow-sm"
    >
      <PlaceholderMedia config={config} favorite={item.favorite} />

      <div className="space-y-4 p-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-slate-950">
                {title}
              </h2>
              <p className="mt-1 truncate text-sm text-slate-500">
                {originalTitle}
              </p>
            </div>
            <SlidersHorizontal
              className="mt-0.5 shrink-0 text-slate-300 transition group-hover:text-sakura-400"
              size={17}
            />
          </div>
        </div>

        <CardMetadata item={item} />

        <div className="flex flex-wrap gap-2">
          {item.categories.map((category) => (
            <span
              key={category}
              className="rounded-full border border-sakura-100 bg-sakura-50 px-2.5 py-1 text-xs font-medium text-sakura-600"
            >
              {category}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

function PlaceholderMedia({
  config,
  favorite,
}: {
  config: CollectionConfig;
  favorite: boolean;
}) {
  const Icon = config.placeholderIcon;
  const aspectClass =
    config.kind === "performers" ? "aspect-[4/5]" : "aspect-video";

  return (
    <div
      className={`${aspectClass} relative flex items-center justify-center border-b border-slate-100 bg-gradient-to-br from-slate-100 via-white to-sakura-50`}
    >
      <div className="flex flex-col items-center gap-2 text-slate-400">
        <div className="flex size-12 items-center justify-center rounded-lg border border-white bg-white/80">
          <Icon size={24} />
        </div>
        <span className="text-xs font-medium">{config.placeholderLabel}</span>
      </div>
      <span
        className={[
          "absolute right-3 top-3 flex size-9 items-center justify-center rounded-full border bg-white/90 shadow-sm",
          favorite
            ? "border-sakura-100 text-sakura-500"
            : "border-slate-100 text-slate-300",
        ].join(" ")}
        aria-label={favorite ? "Favorite" : "Not favorite"}
      >
        <Heart size={17} fill={favorite ? "currentColor" : "none"} />
      </span>
    </div>
  );
}

function CardMetadata({ item }: { item: CollectionItem }) {
  if (item.kind === "performers") {
    return (
      <div className="grid grid-cols-3 gap-2 text-xs">
        <MetaChip label={item.status} tone="sakura" />
        <MetaChip label={item.filmographyCount} />
        <MetaChip label={item.pictorialsCount} />
      </div>
    );
  }

  if (item.kind === "images") {
    return (
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <MetaChip label={item.code} />
        <MetaChip label={item.imageCount} tone="sakura" />
        <MetaChip label={item.availability ?? "Unknown"} />
        <MetaChip label={item.censorship ?? "Unknown"} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 text-xs">
      <MetaChip label={item.duration} tone="sakura" />
      <MetaChip label={item.availability ?? "Unknown"} />
      <MetaChip label={item.censorship ?? "Unknown"} />
    </div>
  );
}

function MetaChip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "sakura";
}) {
  return (
    <span
      className={[
        "truncate rounded-md border px-2 py-1 text-center font-medium",
        tone === "sakura"
          ? "border-sakura-100 bg-sakura-50 text-sakura-600"
          : "border-slate-200 bg-slate-50 text-slate-600",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

export default CollectionPage;
