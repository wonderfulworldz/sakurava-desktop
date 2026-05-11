import {
  Clock3,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  List,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { CollectionConfig, CollectionItem } from "../lib/collectionData";

type CollectionPageProps = {
  config: CollectionConfig;
};

function CollectionPage({ config }: CollectionPageProps) {
  return (
    <div className="space-y-6">
      <CollectionHeader config={config} />
      <CollectionToolbar config={config} />

      {config.items.length > 0 ? (
        <>
          <section
            className={[
              "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
              config.kind === "performers"
                ? "2xl:grid-cols-6"
                : "2xl:grid-cols-5",
            ].join(" ")}
          >
            {config.items.map((item) => (
              <CollectionCard key={item.key} config={config} item={item} />
            ))}
          </section>
          <PaginationBar />
        </>
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

function CollectionHeader({ config }: CollectionPageProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-4xl font-semibold tracking-normal text-slate-950">
          {config.title}
        </h1>
        <p className="mt-2 text-base text-slate-500">{config.subtitle}</p>
      </div>

      <div className="flex items-center gap-8">
        <p className="text-base font-semibold text-slate-500">
          {config.countLabel}
        </p>
        <Link
          to={config.actionTo}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sakura-500 px-6 text-base font-semibold text-white shadow-sm shadow-sakura-200 transition hover:bg-sakura-600"
        >
          <Plus size={20} />
          {config.actionLabel}
        </Link>
      </div>
    </header>
  );
}

function CollectionToolbar({ config }: CollectionPageProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_230px_230px_auto] lg:items-center">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
            placeholder={config.searchPlaceholder}
            aria-label={`${config.title} search`}
          />
        </label>

        <SelectBox
          id={`${config.kind}-filter`}
          label={config.filterLabel}
          options={config.filterOptions}
        />
        <SelectBox
          id={`${config.kind}-sort`}
          label={config.sortLabel}
          options={config.sortOptions}
        />

        <div className="flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white p-1">
          <button
            className="flex size-9 items-center justify-center rounded-md bg-sakura-50 text-sakura-500"
            type="button"
            aria-label="Grid view"
          >
            <Grid2X2 size={18} />
          </button>
          <button
            className="flex size-9 items-center justify-center rounded-md text-slate-400"
            type="button"
            aria-label="List view"
          >
            <List size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

function SelectBox({
  id,
  label,
  options,
}: {
  id: string;
  label: string;
  options: string[];
}) {
  return (
    <label
      className="flex h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3"
      htmlFor={id}
    >
      <span className="shrink-0 text-xs font-semibold text-slate-500">
        {label}
      </span>
      <select
        id={id}
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-950 outline-none"
        defaultValue={options[0]}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
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
      className="group overflow-hidden rounded-lg border border-slate-200 bg-white p-2.5 transition hover:border-sakura-200 hover:shadow-sm"
    >
      <PlaceholderMedia
        kind={config.kind}
        label={config.placeholderLabel}
        favorite={item.favorite}
      />

      <div className="space-y-2.5 pt-3">
        <div>
          <h2 className="truncate text-sm font-semibold text-slate-950">
            {title}
          </h2>
          <p className="mt-1 truncate text-xs font-medium text-slate-500">
            {originalTitle}
          </p>
        </div>

        <CardMetadata item={item} />

        <div className="flex flex-wrap gap-2">
          {item.categories.map((category) => (
            <CategoryChip key={category} label={category} />
          ))}
        </div>
      </div>
    </Link>
  );
}

function PlaceholderMedia({
  kind,
  label,
  favorite,
}: {
  kind: CollectionConfig["kind"];
  label: string;
  favorite: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div
        className={[
          "relative flex items-end justify-center",
          kind === "performers" ? "aspect-[4/5]" : "aspect-video",
        ].join(" ")}
        aria-label={label}
      >
        {kind === "performers" ? <ProfilePlaceholder /> : <ImagePlaceholder />}
      </div>
      <span
        className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-white/90 text-sakura-500 shadow-sm"
        aria-label={favorite ? "Favorite" : "Not favorite"}
      >
        <Heart size={20} fill={favorite ? "currentColor" : "none"} />
      </span>
    </div>
  );
}

function ImagePlaceholder() {
  return (
    <div className="absolute inset-0 text-slate-200">
      <div className="absolute right-[28%] top-[28%] size-6 rounded-full bg-slate-200/80" />
      <div className="absolute bottom-0 left-[7%] h-[64%] w-[54%] rounded-t-[44px] bg-slate-200/70 [clip-path:polygon(0_100%,38%_25%,100%_100%)]" />
      <div className="absolute bottom-0 right-[7%] h-[42%] w-[42%] rounded-t-[34px] bg-slate-200/65 [clip-path:polygon(0_100%,45%_18%,100%_100%)]" />
      <ImageIcon className="sr-only" size={1} />
    </div>
  );
}

function ProfilePlaceholder() {
  return (
    <div className="relative flex h-full w-full items-end justify-center text-slate-300">
      <div className="absolute bottom-0 h-[76%] w-[48%] rounded-t-full bg-slate-300/75" />
      <div className="absolute bottom-[10%] h-[46%] w-[36%] rounded-t-[55%] bg-white/85" />
      <div className="absolute bottom-[11%] h-[60%] w-[44%] rounded-t-full bg-slate-300/80 [clip-path:polygon(16%_0,84%_0,98%_72%,72%_100%,28%_100%,2%_72%)]" />
      <div className="absolute bottom-0 h-[26%] w-[54%] rounded-t-full bg-slate-300/75" />
      <UserRound className="sr-only" size={1} />
    </div>
  );
}

function CardMetadata({ item }: { item: CollectionItem }) {
  if (item.kind === "performers") {
    return (
      <div className="space-y-3">
        <div>
          <StatusChip label={item.status} />
        </div>
        <p className="text-xs font-medium text-slate-500">
          {item.filmographyCount}
          <span className="px-2 text-slate-300">.</span>
          {item.pictorialsCount}
        </p>
      </div>
    );
  }

  if (item.kind === "images") {
    return (
      <div className="space-y-3">
        <div className="space-y-1 text-xs font-semibold text-slate-700">
          <p>{item.code}</p>
          <p>{item.imageCount}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusChip label={item.availability ?? "Owned"} />
          <CensorshipChip label={item.censorship ?? "Censored"} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Clock3 size={14} />
        {item.duration}
      </p>
      <div className="flex flex-wrap gap-2">
        <StatusChip label={item.availability ?? "Owned"} />
        <CensorshipChip label={item.censorship ?? "Censored"} />
      </div>
    </div>
  );
}

function StatusChip({ label }: { label: string }) {
  const isRetired = label === "Retired";

  return (
    <span
      className={[
        "inline-flex rounded-md px-2.5 py-1 text-xs font-semibold",
        isRetired
          ? "bg-slate-100 text-slate-700"
          : "bg-emerald-50 text-emerald-700",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function CensorshipChip({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-md bg-rose-50 px-2.5 py-1 text-xs font-semibold text-sakura-600">
      {label}
    </span>
  );
}

function CategoryChip({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-md bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-600">
      {label}
    </span>
  );
}

function PaginationBar() {
  const [pageSize, setPageSize] = useState("30");

  return (
    <nav
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Collection pagination"
    >
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-500">
        Page size
        <select
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
          value={pageSize}
          onChange={(event) => setPageSize(event.target.value)}
          aria-label="Items per page"
        >
          {["30", "60", "90", "120"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span>per page</span>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-500"
        >
          Previous
        </button>
        {[1, 2, 3].map((page) => (
          <button
            key={page}
            type="button"
            className={[
              "flex size-9 items-center justify-center rounded-lg text-sm font-semibold",
              page === 1
                ? "bg-sakura-500 text-white"
                : "border border-slate-200 bg-white text-slate-500",
            ].join(" ")}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-500"
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export default CollectionPage;
