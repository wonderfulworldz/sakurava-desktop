import {
  Clock3,
  ChevronDown,
  Filter,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { CollectionConfig, CollectionItem } from "../lib/collectionData";
import { localImagePathToAssetSrc } from "../runtime/localAsset";
import { useMediaAssetScopeReady } from "../runtime/MediaAssetScopeContext";

type CollectionPageProps = {
  config: CollectionConfig;
};

type ViewMode = "card" | "table";

function CollectionPage({ config }: CollectionPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryFilters, setActiveCategoryFilters] = useState<string[]>([]);
  const [sortValue, setSortValue] = useState(config.sortOptions[0] ?? "");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [pageSize, setPageSize] = useState("30");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const categoryOptions = useMemo(
    () => getCategoryOptions(config.items),
    [config.items],
  );

  const sortedItems = sortItems(
    filterByCategories(
      filterItems(config.items, searchQuery),
      activeCategoryFilters,
    ),
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

  function addCategoryFilter(category: string) {
    if (
      !category ||
      activeCategoryFilters.length >= 5 ||
      hasCategoryFilter(activeCategoryFilters, category)
    ) {
      return;
    }

    setActiveCategoryFilters([...activeCategoryFilters, category]);
    resetToFirstPage();
  }

  function removeCategoryFilter(category: string) {
    setActiveCategoryFilters(
      activeCategoryFilters.filter(
        (filter) => normalizeCategoryKey(filter) !== normalizeCategoryKey(category),
      ),
    );
    resetToFirstPage();
  }

  function clearCategoryFilters() {
    setActiveCategoryFilters([]);
    resetToFirstPage();
  }

  useEffect(() => {
    setActiveCategoryFilters((filters) =>
      filters.filter((filter) => hasCategoryFilter(categoryOptions, filter)),
    );
  }, [categoryOptions]);

  return (
    <div className="space-y-6">
      <CollectionHeader config={config} />
      <CollectionToolbar
        config={config}
        searchQuery={searchQuery}
        categoryOptions={categoryOptions}
        activeCategoryFilters={activeCategoryFilters}
        sortValue={sortValue}
        viewMode={viewMode}
        filterPanelOpen={filterPanelOpen}
        onSearchChange={(value) => {
          setSearchQuery(value);
          resetToFirstPage();
        }}
        onToggleFilterPanel={() => setFilterPanelOpen((open) => !open)}
        onAddCategoryFilter={addCategoryFilter}
        onRemoveCategoryFilter={removeCategoryFilter}
        onClearCategoryFilters={clearCategoryFilters}
        onSortChange={(value) => {
          setSortValue(value);
          resetToFirstPage();
        }}
        onViewModeChange={setViewMode}
      />

      {hasVisibleItems ? (
        <>
          {viewMode === "card" ? (
            <section
              className={[
                "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]",
                config.kind === "performers"
                  ? "[@media(min-width:1536px)]:[grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]"
                  : "[@media(min-width:1536px)]:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]",
              ].join(" ")}
            >
              {pageItems.map((item) => (
                <CollectionCard key={item.key} config={config} item={item} />
              ))}
            </section>
          ) : (
            <CollectionTable config={config} items={pageItems} />
          )}
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
  categoryOptions,
  activeCategoryFilters,
  sortValue,
  viewMode,
  filterPanelOpen,
  onSearchChange,
  onToggleFilterPanel,
  onAddCategoryFilter,
  onRemoveCategoryFilter,
  onClearCategoryFilters,
  onSortChange,
  onViewModeChange,
}: CollectionPageProps & {
  searchQuery: string;
  categoryOptions: string[];
  activeCategoryFilters: string[];
  sortValue: string;
  viewMode: ViewMode;
  filterPanelOpen: boolean;
  onSearchChange: (value: string) => void;
  onToggleFilterPanel: () => void;
  onAddCategoryFilter: (value: string) => void;
  onRemoveCategoryFilter: (value: string) => void;
  onClearCategoryFilters: () => void;
  onSortChange: (value: string) => void;
  onViewModeChange: (value: ViewMode) => void;
}) {
  const selectableCategories = categoryOptions.filter(
    (category) => !hasCategoryFilter(activeCategoryFilters, category),
  );
  const reachedCategoryLimit = activeCategoryFilters.length >= 5;
  const categorySelectDisabled =
    reachedCategoryLimit || selectableCategories.length === 0;
  const viewAction = viewMode === "card" ? "table" : "card";
  const viewLabel = viewMode === "card" ? "Switch to list view" : "Switch to grid view";
  const ViewIcon = viewMode === "card" ? List : Grid2X2;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3" aria-label={`${config.title} catalog toolbar`}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_auto_minmax(180px,230px)_auto] xl:items-center">
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

        <button
          type="button"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sakura-200 hover:text-sakura-600"
          aria-expanded={filterPanelOpen}
          aria-controls={`${config.kind}-filter-panel`}
          onClick={onToggleFilterPanel}
        >
          <Filter size={18} />
          Filter
          <ChevronDown
            size={16}
            className={filterPanelOpen ? "rotate-180 transition" : "transition"}
          />
        </button>

        <SelectBox
          id={`${config.kind}-sort`}
          label="Sorting"
          options={config.sortOptions}
          value={sortValue}
          onChange={onSortChange}
        />

        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sakura-200 hover:text-sakura-600 md:justify-self-end xl:justify-self-auto"
          type="button"
          aria-label={viewLabel}
          onClick={() => onViewModeChange(viewAction)}
        >
          <ViewIcon size={18} />
          View
        </button>
      </div>

      {filterPanelOpen && (
        <div
          id={`${config.kind}-filter-panel`}
          role="region"
          aria-label={`${config.title} filters`}
          className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <SelectBox
              id={`${config.kind}-category-filter`}
              label={config.filterLabel}
              options={["Add category filter", ...selectableCategories]}
              value="Add category filter"
              onChange={onAddCategoryFilter}
              disabled={categorySelectDisabled}
            />
            {plannedFilterItems(config.kind).map((filter) => (
              <button
                key={filter.label}
                type="button"
                className="flex h-11 min-w-0 items-center justify-between gap-3 rounded-lg border border-dashed border-slate-200 bg-white px-3 text-left disabled:cursor-not-allowed disabled:text-slate-400"
                disabled
              >
                <span className="truncate text-sm font-semibold">
                  {filter.label}
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-normal text-slate-500">
                  Planned
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs font-medium text-slate-500">
            <SlidersHorizontal className="mt-0.5 shrink-0" size={14} />
            Data-dependent filters are unavailable until reliable fields or helpers exist.
          </p>
        </div>
      )}

      {(activeCategoryFilters.length > 0 || reachedCategoryLimit) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {activeCategoryFilters.map((category) => (
            <span
              key={normalizeCategoryKey(category)}
              className="inline-flex max-w-full items-center gap-2 rounded-full bg-sakura-50 px-3 py-1.5 text-xs font-semibold text-sakura-700"
            >
              <span className="truncate">{category}</span>
              <button
                type="button"
                aria-label={`Remove ${category}`}
                className="rounded-full text-sakura-500 hover:text-sakura-700"
                onClick={() => onRemoveCategoryFilter(category)}
              >
                Remove
              </button>
            </span>
          ))}
          {activeCategoryFilters.length > 0 && (
            <button
              type="button"
              className="text-xs font-semibold text-slate-500 hover:text-sakura-600"
              onClick={onClearCategoryFilters}
            >
              Clear all
            </button>
          )}
          {reachedCategoryLimit && (
            <span className="text-xs font-semibold text-slate-500">
              Up to 5 category filters can be active.
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function SelectBox({
  id,
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className="flex h-11 min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3"
      htmlFor={id}
    >
      <span className="shrink-0 text-xs font-semibold text-slate-500">
        {label}
      </span>
      <select
        id={id}
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-950 outline-none disabled:text-slate-400"
        disabled={disabled}
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

function plannedFilterItems(kind: CollectionConfig["kind"]) {
  if (kind === "performers") {
    return [
      { label: "Rating" },
      { label: "Debut Year" },
      { label: "Status" },
      { label: "Favorite" },
    ];
  }

  if (kind === "images") {
    return [
      { label: "Quality" },
      { label: "Rating" },
      { label: "Year" },
      { label: "Count" },
    ];
  }

  return [
    { label: "Quality" },
    { label: "Rating" },
    { label: "Year" },
    { label: "Duration" },
  ];
}

function CollectionTable({
  config,
  items,
}: {
  config: CollectionConfig;
  items: CollectionItem[];
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              {tableHeaders(config.kind).map((header) => (
                <th key={header} className="whitespace-nowrap px-4 py-3">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <CollectionTableRow key={item.key} config={config} item={item} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CollectionTableRow({
  config,
  item,
}: {
  config: CollectionConfig;
  item: CollectionItem;
}) {
  return (
    <tr className="transition hover:bg-sakura-50/60">
      {tableCells(item).map((cell, index) => (
        <td
          key={`${item.key}-${index}`}
          className="whitespace-nowrap px-4 py-3 text-slate-700"
        >
          <Link
            to={`/${config.kind}/${item.key}`}
            className={[
              "block",
              index === 0
                ? "font-semibold text-slate-950 hover:text-sakura-600"
                : "",
            ].join(" ")}
          >
            {cell}
          </Link>
        </td>
      ))}
    </tr>
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
        title={title}
        coverPath={item.coverPath}
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
  title,
  coverPath,
  favorite,
}: {
  kind: CollectionConfig["kind"];
  label: string;
  title: string;
  coverPath?: string;
  favorite: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const mediaAssetScopeReady = useMediaAssetScopeReady();
  const assetSrc = localImagePathToAssetSrc(coverPath);
  const showImage = Boolean(assetSrc && mediaAssetScopeReady && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [assetSrc, mediaAssetScopeReady]);

  return (
    <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div
        className={[
          "relative flex items-end justify-center",
          kind === "performers" ? "aspect-[4/5]" : "aspect-video",
        ].join(" ")}
        role={showImage ? undefined : "img"}
        aria-label={showImage ? undefined : label}
      >
        {showImage ? (
          <img
            src={assetSrc ?? undefined}
            alt={`${title} cover`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : kind === "performers" ? (
          <ProfilePlaceholder />
        ) : (
          <ImagePlaceholder />
        )}
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

function filterByCategories(items: CollectionItem[], categoryFilters: string[]) {
  if (categoryFilters.length === 0) {
    return items;
  }

  const filterKeys = categoryFilters.map(normalizeCategoryKey);

  return items.filter((item) => {
    const itemCategoryKeys = new Set(item.categories.map(normalizeCategoryKey));
    return filterKeys.every((filterKey) => itemCategoryKeys.has(filterKey));
  });
}

function sortItems(items: CollectionItem[], sortValue: string) {
  const indexedItems = items.map((item, index) => ({ item, index }));

  if (sortValue === "Last Updated") {
    return indexedItems
      .slice()
      .sort((left, right) => {
        const rightTime = timestamp(right.item.updatedAt);
        const leftTime = timestamp(left.item.updatedAt);

        return rightTime - leftTime || left.index - right.index;
      })
      .map(({ item }) => item);
  }

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

function getCategoryOptions(items: CollectionItem[]) {
  const categoriesByKey = new Map<string, string>();

  for (const item of items) {
    for (const category of item.categories) {
      const label = category.trim();
      if (!label) {
        continue;
      }

      const key = normalizeCategoryKey(label);
      if (!categoriesByKey.has(key)) {
        categoriesByKey.set(key, label);
      }
    }
  }

  return [...categoriesByKey.values()].sort((left, right) =>
    left.localeCompare(right),
  );
}

function hasCategoryFilter(filters: string[], category: string) {
  const categoryKey = normalizeCategoryKey(category);
  return filters.some((filter) => normalizeCategoryKey(filter) === categoryKey);
}

function normalizeCategoryKey(category: string) {
  return normalizeSearchText(category.trim());
}

function getPrimaryTitle(item: CollectionItem) {
  return item.kind === "performers" ? item.name : item.title;
}

function numberFromDisplayText(value: string) {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function timestamp(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    return 0;
  }

  const numericTime = Number(trimmed);
  const numericLike = /^[-+]?(?:\d+|\d*\.\d+)$/.test(trimmed);

  if (Number.isFinite(numericTime) && numericTime > 0) {
    return numericTime;
  }

  if (numericLike) {
    return 0;
  }

  const time = Date.parse(trimmed);
  return Number.isFinite(time) ? time : 0;
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function pageNumbers(pageCount: number) {
  return Array.from({ length: pageCount }, (_, index) => index + 1);
}

function tableHeaders(kind: CollectionConfig["kind"]) {
  if (kind === "performers") {
    return [
      "Name",
      "Original Name",
      "Status",
      "Filmography",
      "Pictorials",
      "Categories",
    ];
  }

  if (kind === "images") {
    return [
      "Title",
      "Original Title",
      "Code",
      "Availability",
      "Image Count",
      "Categories",
    ];
  }

  return [
    "Title",
    "Original Title",
    "Censorship",
    "Availability",
    "Duration",
    "Categories",
  ];
}

function tableCells(item: CollectionItem) {
  const categories = item.categories.length > 0 ? item.categories.join(", ") : "None";

  if (item.kind === "performers") {
    return [
      item.name,
      item.originalName,
      item.status,
      item.filmographyCount,
      item.pictorialsCount,
      categories,
    ];
  }

  if (item.kind === "images") {
    return [
      item.title,
      item.originalTitle,
      item.code,
      item.availability ?? "Unspecified",
      item.imageCount,
      categories,
    ];
  }

  return [
    item.title,
    item.originalTitle,
    item.censorship ?? "Unspecified",
    item.availability ?? "Unspecified",
    item.duration,
    categories,
  ];
}

export default CollectionPage;
