import {
  ChevronDown,
  Filter,
  Grid2X2,
  List,
  Plus,
  Search,
  X,
} from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { VideoFullCard, ImageFullCard, PerformerFullCard } from "../components/cards";
import {
  CATALOG_PAGE_SIZE_OPTIONS,
  normalizeCatalogPageSize,
  readStoredCatalogPageSize,
  storeCatalogPageSize,
} from "../lib/catalogPagination";
import type { CollectionConfig, CollectionItem } from "../lib/collectionData";
import { useLanguage } from "../lib/LanguageContext";

type CollectionPageProps = {
  config: CollectionConfig;
  onFavoriteToggle?: (key: string, currentFavorite: boolean) => void;
};

type ViewMode = "card" | "table";
type DataFilterValues = Record<string, string>;

function CollectionPage({ config, onFavoriteToggle }: CollectionPageProps) {
  const [searchParams] = useSearchParams();
  const pageSizeStorageKey = catalogPageSizeStorageKey(config.kind);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryFilters, setActiveCategoryFilters] = useState<string[]>([]);
  const [dataFilters, setDataFilters] = useState<DataFilterValues>({});
  const [sortValue, setSortValue] = useState(config.sortOptions[0] ?? "");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [pageSize, setPageSize] = useState(() =>
    readStoredCatalogPageSize(pageSizeStorageKey),
  );
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const categoryOptions = useMemo(
    () => getCategoryOptions(config.items),
    [config.items],
  );

  const sortedItems = sortItems(
    filterByDataFilters(
      filterByCategories(
        filterItems(config.items, searchQuery),
        activeCategoryFilters,
      ),
      dataFilters,
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

  function clearAllFilters() {
    setSearchQuery("");
    setActiveCategoryFilters([]);
    setDataFilters({});
    resetToFirstPage();
  }

  useEffect(() => {
    setActiveCategoryFilters((filters) =>
      filters.filter((filter) => hasCategoryFilter(categoryOptions, filter)),
    );
  }, [categoryOptions]);

  useEffect(() => {
    const requestedCategory = searchParams.get("category")?.trim();
    if (!requestedCategory || !hasCategoryFilter(categoryOptions, requestedCategory)) {
      return;
    }

    setActiveCategoryFilters((filters) =>
      hasCategoryFilter(filters, requestedCategory) ? filters : [requestedCategory],
    );
    setPage(1);
  }, [categoryOptions, searchParams]);

  useEffect(() => {
    setSortValue(config.sortOptions[0] ?? "");
    setDataFilters({});
    setPageSize(readStoredCatalogPageSize(pageSizeStorageKey));
    setPage(1);
  }, [config.kind, config.sortOptions, pageSizeStorageKey]);

  return (
    <div className="space-y-6">
      <CollectionHeader config={config} />
      <CollectionToolbar
        config={config}
        searchQuery={searchQuery}
        categoryOptions={categoryOptions}
        activeCategoryFilters={activeCategoryFilters}
        dataFilters={dataFilters}
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
        onClearAllFilters={clearAllFilters}
        onClearSearch={() => {
          setSearchQuery("");
          resetToFirstPage();
        }}
        onDataFilterChange={(filterId, value) => {
          setDataFilters((filters) => ({ ...filters, [filterId]: value }));
          resetToFirstPage();
        }}
        onClearDataFilter={(filterId) => {
          setDataFilters((filters) => {
            const nextFilters = { ...filters };
            delete nextFilters[filterId];
            return nextFilters;
          });
          resetToFirstPage();
        }}
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
              className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))] xl:[grid-template-columns:repeat(4,minmax(0,1fr))]"
            >
              {pageItems.map((item) => (
                <FullCard key={item.key} config={config} item={item} onFavoriteToggle={onFavoriteToggle} />
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
              const nextPageSize = normalizeCatalogPageSize(value);
              setPageSize(nextPageSize);
              storeCatalogPageSize(pageSizeStorageKey, nextPageSize);
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
  const { t } = useLanguage();
  const title = t(`collection.title.${config.kind}`);
  const subtitle = t(`collection.subtitle.${config.kind}`);
  const actionLabel = t(
    config.kind === "videos"
      ? "collection.addVideo"
      : config.kind === "images"
        ? "collection.addImage"
        : "collection.addPerformer",
  );

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-4xl font-semibold tracking-normal text-slate-950">
          {title}
        </h1>
        <p className="mt-2 text-base text-slate-500">{subtitle}</p>
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
          {actionLabel}
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
  dataFilters,
  sortValue,
  viewMode,
  filterPanelOpen,
  onSearchChange,
  onToggleFilterPanel,
  onAddCategoryFilter,
  onRemoveCategoryFilter,
  onClearAllFilters,
  onClearSearch,
  onDataFilterChange,
  onClearDataFilter,
  onSortChange,
  onViewModeChange,
}: CollectionPageProps & {
  searchQuery: string;
  categoryOptions: string[];
  activeCategoryFilters: string[];
  dataFilters: DataFilterValues;
  sortValue: string;
  viewMode: ViewMode;
  filterPanelOpen: boolean;
  onSearchChange: (value: string) => void;
  onToggleFilterPanel: () => void;
  onAddCategoryFilter: (value: string) => void;
  onRemoveCategoryFilter: (value: string) => void;
  onClearAllFilters: () => void;
  onClearSearch: () => void;
  onDataFilterChange: (filterId: string, value: string) => void;
  onClearDataFilter: (filterId: string) => void;
  onSortChange: (value: string) => void;
  onViewModeChange: (value: ViewMode) => void;
}) {
  const selectableCategories = categoryOptions.filter(
    (category) => !hasCategoryFilter(activeCategoryFilters, category),
  );
  const reachedCategoryLimit = activeCategoryFilters.length >= 5;
  const categorySelectDisabled =
    reachedCategoryLimit || selectableCategories.length === 0;
  const { t } = useLanguage();
  const viewAction = viewMode === "card" ? "table" : "card";
  const viewLabel = viewMode === "card" ? t("collection.switchToListView") : t("collection.switchToGridView");
  const ViewIcon = viewMode === "card" ? List : Grid2X2;
  const searchPlaceholder = t(`collection.searchPlaceholder.${config.kind}`);
  const title = t(`collection.title.${config.kind}`);
  const activeDataFilters = getActiveDataFilterEntries(config.kind, dataFilters);
  const trimmedSearch = searchQuery.trim();
  const activeFilterCount =
    (trimmedSearch ? 1 : 0) +
    activeCategoryFilters.length +
    activeDataFilters.length;
  const hasActiveFilters = activeFilterCount > 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3" aria-label={`${title} catalog toolbar`}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_auto_minmax(190px,240px)_auto] xl:items-center">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-10 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
            placeholder={searchPlaceholder}
            aria-label={`${title} search`}
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {trimmedSearch && (
            <button
              type="button"
              aria-label={`Clear ${title} search`}
              title={`Clear ${title} search`}
              className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-sakura-50 hover:text-sakura-600 focus:outline-none focus:ring-2 focus:ring-sakura-200"
              onClick={onClearSearch}
            >
              <X size={15} />
            </button>
          )}
        </label>

        <button
          type="button"
          className={[
            "inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition",
            activeFilterCount > 0 || filterPanelOpen
              ? "border-sakura-200 bg-sakura-50 text-sakura-700 hover:border-sakura-300"
              : "border-slate-200 bg-white text-slate-700 hover:border-sakura-200 hover:text-sakura-600",
          ].join(" ")}
          aria-label={`${t("collection.filter")} ${activeFilterCount}`}
          aria-expanded={filterPanelOpen}
          aria-controls={`${config.kind}-filter-panel`}
          onClick={onToggleFilterPanel}
        >
          <Filter size={18} />
          {t("collection.filter")}
          <span
            aria-label={`${activeFilterCount} active filters`}
            className={[
              "inline-flex min-w-6 items-center justify-center rounded-md border px-1.5 py-0.5 text-xs font-bold",
              activeFilterCount > 0
                ? "border-sakura-200 bg-sakura-50 text-sakura-700"
                : "border-slate-200 bg-slate-50 text-slate-500",
            ].join(" ")}
          >
            {activeFilterCount}
          </span>
          <ChevronDown
            size={16}
            className={filterPanelOpen ? "rotate-180 transition" : "transition"}
          />
        </button>

        <SelectBox
          id={`${config.kind}-sort`}
          label={t("collection.sorting")}
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
          {t("collection.view")}
        </button>
      </div>

      {filterPanelOpen && (
        <div
          id={`${config.kind}-filter-panel`}
          role="region"
          aria-label={`${title} filters`}
          className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
        >
          <div className="grid md:grid-cols-2">
            {catalogFilterPanelSections(config.kind).map((section, sectionIndex) => (
              <div
                key={section.label}
                className={[
                  "space-y-3 p-4",
                  sectionIndex > 0 ? "border-t border-slate-100 md:border-l md:border-t-0" : "",
                ].join(" ")}
              >
                <p className="text-xs font-bold uppercase tracking-normal text-slate-500">
                  {section.label}
                </p>
                {section.includeCategories && (
                  <SelectBox
                    id={`${config.kind}-category-filter`}
                    label={t("collection.categories")}
                    options={[t("collection.addCategoryFilter"), ...selectableCategories]}
                    value={t("collection.addCategoryFilter")}
                    onChange={onAddCategoryFilter}
                    disabled={categorySelectDisabled}
                  />
                )}
                {section.filterIds.map((filterId) => {
                  const filter = catalogFilterById(config.kind, filterId);

                  if (!filter) {
                    return null;
                  }

                  return (
                    <SelectBox
                      key={filter.id}
                      id={`${config.kind}-${filter.id}-filter`}
                      label={filter.label}
                      options={filter.options}
                      value={dataFilters[filter.id] ?? filter.options[0]}
                      onChange={(value) => onDataFilterChange(filter.id, value)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-4 py-3">
            <button
              type="button"
              aria-label="Reset all filters"
              className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-semibold text-sakura-600 transition hover:bg-sakura-50 focus:outline-none focus:ring-2 focus:ring-sakura-200"
              onClick={onClearAllFilters}
            >
              Reset all
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {!hasActiveFilters && (
            <span className="text-xs font-semibold text-slate-500">
              No filters selected
            </span>
          )}
          {trimmedSearch && (
            <FilterChip
              label={`Search: ${trimmedSearch}`}
              removeLabel={`Clear ${title} search filter`}
              onRemove={onClearSearch}
            />
          )}
          {activeCategoryFilters.map((category) => (
            <FilterChip
              key={normalizeCategoryKey(category)}
              label={`Category: ${category}`}
              removeLabel={`Remove category filter ${category}`}
              onRemove={() => onRemoveCategoryFilter(category)}
            />
          ))}
          {activeDataFilters.map((filter) => (
            <FilterChip
              key={filter.id}
              label={`${filter.label}: ${filter.value}`}
              removeLabel={`Remove ${filter.label} filter`}
              onRemove={() => onClearDataFilter(filter.id)}
            />
          ))}
          {reachedCategoryLimit && (
            <span className="text-xs font-semibold text-slate-500">
              {t("collection.categoryLimitReached")}
            </span>
          )}
        </div>
        {hasActiveFilters && (
          <div className="shrink-0">
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-700"
              onClick={onClearAllFilters}
            >
              {t("collection.clearAllFilters")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function FilterChip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-sakura-100 bg-sakura-50 px-2.5 py-1.5 text-xs font-semibold text-sakura-700">
      <span className="max-w-56 truncate">{label}</span>
      <button
        type="button"
        aria-label={removeLabel}
        title={removeLabel}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-sakura-500 transition hover:bg-white hover:text-sakura-700 focus:outline-none focus:ring-2 focus:ring-sakura-200"
        onClick={onRemove}
      >
        <X size={13} />
      </button>
    </span>
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

function catalogFilterGroups(kind: CollectionConfig["kind"]) {
  if (kind === "performers") {
    return [
      { id: "status", label: "Status", options: ["All status", "Active", "Retired", "Unknown"] },
      { id: "rating", label: "Rating", options: ratingFilterOptions() },
      { id: "debutYear", label: "Debut Year", options: yearFilterOptions("All debut years") },
      { id: "filmography", label: "Filmography", options: countFilterOptions("All filmography") },
      { id: "pictorials", label: "Pictorial", options: countFilterOptions("All pictorials") },
    ];
  }

  if (kind === "images") {
    return [
      { id: "quality", label: "Quality", options: qualityFilterOptions() },
      { id: "rating", label: "Rating", options: ratingFilterOptions() },
      { id: "year", label: "Year", options: yearFilterOptions("All years") },
      { id: "imageCount", label: "Image Count", options: countFilterOptions("All image counts") },
    ];
  }

  return [
    { id: "quality", label: "Quality", options: qualityFilterOptions() },
    { id: "rating", label: "Rating", options: ratingFilterOptions() },
    { id: "year", label: "Year", options: yearFilterOptions("All years") },
    { id: "duration", label: "Duration", options: ["All durations", "Short", "Medium", "Long"] },
  ];
}

function catalogFilterPanelSections(kind: CollectionConfig["kind"]) {
  if (kind === "performers") {
    return [
      {
        label: "Profile filters",
        includeCategories: true,
        filterIds: ["status", "rating"],
      },
      {
        label: "Activity filters",
        includeCategories: false,
        filterIds: ["debutYear", "filmography", "pictorials"],
      },
    ];
  }

  if (kind === "images") {
    return [
      {
        label: "Catalog filters",
        includeCategories: true,
        filterIds: ["quality", "rating"],
      },
      {
        label: "Media filters",
        includeCategories: false,
        filterIds: ["year", "imageCount"],
      },
    ];
  }

  return [
    {
      label: "Catalog filters",
      includeCategories: true,
      filterIds: ["quality", "rating"],
    },
    {
      label: "Media filters",
      includeCategories: false,
      filterIds: ["year", "duration"],
    },
  ];
}

function catalogFilterById(kind: CollectionConfig["kind"], filterId: string) {
  return catalogFilterGroups(kind).find((filter) => filter.id === filterId);
}

function getActiveDataFilterEntries(
  kind: CollectionConfig["kind"],
  dataFilters: DataFilterValues,
) {
  const filtersById = new Map(
    catalogFilterGroups(kind).map((filter) => [filter.id, filter]),
  );

  return Object.entries(dataFilters)
    .filter(([filterId, value]) => {
      return filtersById.has(filterId) && !isAllFilterValue(filterId, value);
    })
    .map(([filterId, value]) => {
      const filter = filtersById.get(filterId);

      return {
        id: filterId,
        label: filter?.label ?? filterId,
        value,
      };
    });
}

function qualityFilterOptions() {
  return ["All quality", "SD", "HD", "FHD", "2K", "4K", "8K"];
}

function ratingFilterOptions() {
  return ["All ratings", "1 star", "2 star", "3 star", "4 star", "5 star"];
}

function yearFilterOptions(allLabel: string) {
  return [
    allLabel,
    "Older",
    "2000",
    "2005",
    "2010",
    "2015",
    "2020",
    "2025",
    "2030",
    "2035",
    "2040",
    "2045",
    "2050",
  ];
}

function countFilterOptions(allLabel: string) {
  return [allLabel, "Few", "Some", "Many"];
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
  onFavoriteToggle?: (key: string, currentFavorite: boolean) => void;
};

function FullCard({ config, item, onFavoriteToggle }: CollectionCardProps) {
  const linkTo = `/${config.kind}/${item.key}`;
  const handleFavorite = onFavoriteToggle ? () => onFavoriteToggle(item.key, item.favorite) : undefined;

  if (item.kind === "performers") {
    return <PerformerFullCard item={item} linkTo={linkTo} placeholderLabel={config.placeholderLabel} onFavoriteClick={handleFavorite} />;
  }

  if (item.kind === "images") {
    return <ImageFullCard item={item} linkTo={linkTo} placeholderLabel={config.placeholderLabel} onFavoriteClick={handleFavorite} />;
  }

  return <VideoFullCard item={item} linkTo={linkTo} placeholderLabel={config.placeholderLabel} onFavoriteClick={handleFavorite} />;
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
  const { t } = useLanguage();

  return (
    <nav
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Collection pagination"
    >
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-500">
        {t("collection.pageSize")}
        <select
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
          value={pageSize}
          onChange={(event) => onPageSizeChange(event.target.value)}
          aria-label={t("collection.itemsPerPage")}
        >
          {CATALOG_PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span>{t("collection.perPage")}</span>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-500 disabled:opacity-50"
          disabled={page === 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          {t("collection.previous")}
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
          {t("collection.next")}
        </button>
      </div>
    </nav>
  );
}

function CollectionEmptyState({ hasItems }: { hasItems: boolean }) {
  const { t } = useLanguage();

  return (
    <section className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center">
      <p className="text-sm font-semibold text-slate-800">
        {hasItems ? t("collection.noMatchingItems") : t("collection.noSavedRecords")}
      </p>
      <p className="mt-2 text-sm text-slate-500">
        {hasItems
          ? t("collection.noMatchingItemsHint")
          : t("collection.noSavedRecordsHint")}
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

function filterByDataFilters(items: CollectionItem[], filters: DataFilterValues) {
  const activeFilters = Object.entries(filters).filter(
    ([filterId, value]) => !isAllFilterValue(filterId, value),
  );

  if (activeFilters.length === 0) {
    return items;
  }

  return items.filter((item) =>
    activeFilters.every(([filterId, value]) => itemMatchesDataFilter(item, filterId, value)),
  );
}

function itemMatchesDataFilter(
  item: CollectionItem,
  filterId: string,
  value: string,
) {
  if (filterId === "quality") {
    return normalizedFilterValue(item.kind === "performers" ? null : item.quality) ===
      normalizedFilterValue(value);
  }

  if (filterId === "rating") {
    const expected = numberFromDisplayText(value);
    return expected !== null && item.ratingBucket === expected;
  }

  if (filterId === "year") {
    return item.kind !== "performers" && yearMatchesBucket(item.releaseYear, value);
  }

  if (filterId === "debutYear") {
    return item.kind === "performers" && yearMatchesBucket(item.debutYear, value);
  }

  if (filterId === "duration") {
    return item.kind === "videos" && countMatchesBucket(item.durationMinutes, value, "duration");
  }

  if (filterId === "imageCount") {
    return item.kind === "images" && countMatchesBucket(item.imageCountValue, value, "count");
  }

  if (filterId === "filmography") {
    return (
      item.kind === "performers" &&
      countMatchesBucket(item.filmographyCountValue, value, "count")
    );
  }

  if (filterId === "pictorials") {
    return (
      item.kind === "performers" &&
      countMatchesBucket(item.pictorialsCountValue, value, "count")
    );
  }

  if (filterId === "status") {
    return (
      item.kind === "performers" &&
      normalizedFilterValue(item.status || "Unknown") === normalizedFilterValue(value)
    );
  }

  return true;
}

function sortItems(items: CollectionItem[], sortValue: string) {
  const indexedItems = items.map((item, index) => ({ item, index }));

  if (sortValue === "Last Added") {
    return indexedItems
      .slice()
      .sort((left, right) => {
        const rightTime = timestamp(right.item.createdAt) || timestamp(right.item.updatedAt);
        const leftTime = timestamp(left.item.createdAt) || timestamp(left.item.updatedAt);

        return rightTime - leftTime || left.index - right.index;
      })
      .map(({ item }) => item);
  }

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
      item.kind === "videos" ? item.durationMinutes ?? null : null,
    );
  }

  if (sortValue === "Image Count") {
    return sortByNumber(indexedItems, (item) =>
      item.kind === "images" ? item.imageCountValue ?? null : null,
    );
  }

  if (sortValue === "Release Year") {
    return sortByNumber(indexedItems, (item) =>
      item.kind === "performers" ? null : item.releaseYear ?? null,
    );
  }

  if (sortValue === "Rating") {
    return sortByNumber(indexedItems, (item) => item.ratingBucket ?? null);
  }

  if (sortValue === "Status") {
    return indexedItems
      .slice()
      .sort((left, right) => {
        const leftStatus = left.item.kind === "performers" ? left.item.status : "";
        const rightStatus = right.item.kind === "performers" ? right.item.status : "";
        return leftStatus.localeCompare(rightStatus) || left.index - right.index;
      })
      .map(({ item }) => item);
  }

  if (sortValue === "Filmography") {
    return sortByNumber(indexedItems, (item) =>
      item.kind === "performers"
        ? item.filmographyCountValue ?? null
        : null,
    );
  }

  if (sortValue === "Pictorials") {
    return sortByNumber(indexedItems, (item) =>
      item.kind === "performers"
        ? item.pictorialsCountValue ?? null
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

function isAllFilterValue(filterId: string, value: string | undefined) {
  if (!value) {
    return true;
  }

  const normalized = normalizedFilterValue(value);
  return normalized.startsWith("all ") || normalized === `all ${filterId}`;
}

function normalizedFilterValue(value: string | null | undefined) {
  return normalizeSearchText(String(value ?? ""));
}

function yearMatchesBucket(year: number | null | undefined, value: string) {
  if (typeof year !== "number" || !Number.isInteger(year)) {
    return false;
  }

  if (value === "Older") {
    return year < 2000;
  }

  const bucketStart = Number(value);
  if (!Number.isInteger(bucketStart)) {
    return false;
  }

  return year >= bucketStart && year < bucketStart + 5;
}

function countMatchesBucket(
  count: number | null | undefined,
  value: string,
  kind: "count" | "duration",
) {
  if (typeof count !== "number" || !Number.isFinite(count)) {
    return false;
  }

  if (value === "Few" || value === "Short") {
    return count < 15;
  }

  if (value === "Medium") {
    return count >= 15 && count < 60;
  }

  if (value === "Long") {
    return count >= 60;
  }

  if (value === "Some") {
    return count >= 15 && count < 100;
  }

  if (value === "Many") {
    return kind === "count" && count >= 100;
  }

  return false;
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

function catalogPageSizeStorageKey(kind: CollectionConfig["kind"]) {
  return `sakurava.catalog.${kind}.pageSize.v1`;
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
