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
import { type ChangeEvent, useState } from "react";
import { Link } from "react-router-dom";
import type { CollectionConfig, CollectionItem } from "../lib/collectionData";

type CollectionPageProps = {
  config: CollectionConfig;
};

function CollectionPage({ config }: CollectionPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortValue, setSortValue] = useState(config.sortOptions[0] ?? "");
  const [pageSize, setPageSize] = useState("30");
  const [page, setPage] = useState(1);

  const sortedItems = sortItems(
    filterItems(config.items, searchQuery),
    sortValue,
  );
  const numericPageSize = Number(pageSize);
  const pageCount = Math.max(1, Math.ceil(sortedItems.length / numericPageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = (currentPage - 1) * numericPageSize;
  const pageItems = sortedItems.slice(startIndex, startIndex + numericPageSize);
  const hasItems = config.items.length > 0;
  const hasVisibleItems = pageItems.length > 0;

  function resetToFirstPage() {
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <CollectionHeader config={config} />
      <CollectionToolbar
        config={config}
        searchQuery={searchQuery}
        sortValue={sortValue}
        onSearchChange={(value) => {
          setSearchQuery(value);
          resetToFirstPage();
        }}
        onSortChange={(value) => {
          setSortValue(value);
          resetToFirstPage();
        }}
      />

      {hasVisibleItems ? (
        <>
          <section
            className={[
              "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
              config.kind === "performers"
                ? "2xl:grid-cols-6"
                : "2xl:grid-cols-5",
            ].join(" ")}
          >
            {pageItems.map((item) => (
              <CollectionCard key={item.key} config={config} item={item} />
            ))}
          </section>
          <PaginationBar
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(value) => {
              setPageSize(value);
              resetToFirstPage();
            }}
          />
        </>
      ) : (
        <CollectionEmptyState hasItems={hasItems} />
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

function CollectionToolbar({
  config,
  searchQuery,
  sortValue,
  onSearchChange,
  onSortChange,
}: CollectionPageProps & {
  searchQuery: string;
  sortValue: string;
  onSearchChange: (value: string) => void;
  onSortChange: (value: string) => void;
}) {
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
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
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
          value={sortValue}
          onChange={onSortChange}
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
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
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
        {...(value === undefined
          ? { defaultValue: options[0] }
          : {
              value,
              onChange: (event: ChangeEvent<HTMLSelectElement>) =>
                onChange?.(event.target.value),
            })}
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

function PaginationBar({
  page,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: string) => void;
}) {
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
          onChange={(event) => onPageSizeChange(event.target.value)}
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
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-500 disabled:opacity-50"
          disabled={page === 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </button>
        {pageNumbers(pageCount).map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            className={[
              "flex size-9 items-center justify-center rounded-lg text-sm font-semibold",
              pageNumber === page
                ? "bg-sakura-500 text-white"
                : "border border-slate-200 bg-white text-slate-500",
            ].join(" ")}
            onClick={() => onPageChange(pageNumber)}
            aria-label={`Page ${pageNumber}`}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-500 disabled:opacity-50"
          disabled={page === pageCount}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        >
          Next
        </button>
      </div>
    </nav>
  );
}

function CollectionEmptyState({ hasItems }: { hasItems: boolean }) {
  return (
    <section className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center">
      <p className="text-sm font-semibold text-slate-800">
        {hasItems ? "No matching items" : "No saved records"}
      </p>
      <p className="mt-2 text-sm text-slate-500">
        {hasItems
          ? "Try a different search term or sort option."
          : "Collection cards will appear here when saved items are available."}
      </p>
    </section>
  );
}

function filterItems(items: CollectionItem[], searchQuery: string) {
  const normalizedQuery = normalizeSearchText(searchQuery);

  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) =>
    getSearchText(item).includes(normalizedQuery),
  );
}

function sortItems(items: CollectionItem[], sortValue: string) {
  const indexedItems = items.map((item, index) => ({ item, index }));

  if (sortValue === "Title A-Z" || sortValue === "Name A-Z") {
    return indexedItems
      .slice()
      .sort((left, right) =>
        getPrimaryTitle(left.item).localeCompare(getPrimaryTitle(right.item)) ||
        left.index - right.index,
      )
      .map(({ item }) => item);
  }

  if (sortValue === "Duration") {
    return sortByNumber(indexedItems, (item) =>
      item.kind === "videos" ? numberFromDisplayText(item.duration) : null,
    );
  }

  if (sortValue === "Image Count") {
    return sortByNumber(indexedItems, (item) =>
      item.kind === "images" ? numberFromDisplayText(item.imageCount) : null,
    );
  }

  if (sortValue === "Filmography") {
    return sortByNumber(indexedItems, (item) =>
      item.kind === "performers"
        ? numberFromDisplayText(item.filmographyCount)
        : null,
    );
  }

  if (sortValue === "Pictorials") {
    return sortByNumber(indexedItems, (item) =>
      item.kind === "performers"
        ? numberFromDisplayText(item.pictorialsCount)
        : null,
    );
  }

  return items;
}

function sortByNumber(
  indexedItems: Array<{ item: CollectionItem; index: number }>,
  valueForItem: (item: CollectionItem) => number | null,
) {
  return indexedItems
    .slice()
    .sort((left, right) => {
      const leftValue = valueForItem(left.item);
      const rightValue = valueForItem(right.item);

      if (leftValue === null && rightValue === null) {
        return left.index - right.index;
      }

      if (leftValue === null) {
        return 1;
      }

      if (rightValue === null) {
        return -1;
      }

      return rightValue - leftValue || left.index - right.index;
    })
    .map(({ item }) => item);
}

function getSearchText(item: CollectionItem) {
  if (item.kind === "performers") {
    return normalizeSearchText(
      [
        item.name,
        item.originalName,
        item.status,
        item.filmographyCount,
        item.pictorialsCount,
        ...item.categories,
      ].join(" "),
    );
  }

  const fields = [
    item.title,
    item.originalTitle,
    item.availability,
    item.censorship,
    ...item.categories,
  ];

  if (item.kind === "videos") {
    fields.push(item.duration);
  } else {
    fields.push(item.code, item.imageCount);
  }

  return normalizeSearchText(fields.join(" "));
}

function getPrimaryTitle(item: CollectionItem) {
  return item.kind === "performers" ? item.name : item.title;
}

function numberFromDisplayText(value: string) {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function pageNumbers(pageCount: number) {
  return Array.from({ length: pageCount }, (_, index) => index + 1);
}

export default CollectionPage;
