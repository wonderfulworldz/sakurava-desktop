import {
  ArrowUpDown,
  ChevronDown,
  Filter,
  Grid2X2,
  Image as ImageIcon,
  List,
  Plus,
  Search,
  Star,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { VideoFullCard, ImageFullCard, PerformerFullCard } from "../components/cards";
import StickyHorizontalScroll from "../components/StickyHorizontalScroll";
import SakuravaSelect from "../components/SakuravaSelect";
import {
  CATALOG_PAGE_SIZE_OPTIONS,
  DEFAULT_CATALOG_PAGE_SIZE,
  normalizeCatalogPageSize,
} from "../lib/catalogPagination";
import type { ManagedCategory } from "../backend/types";
import type { CollectionConfig, CollectionItem } from "../lib/collectionData";
import { formatSakuravaRef } from "../lib/sakuravaRef";
import { useLanguage, useTranslation } from "../lib/LanguageContext";
import {
  clearSessionFilterState,
  hasSessionFilterState,
  readSessionFilterState,
  writeSessionFilterState,
} from "../lib/sessionFilterState";
import {
  readCatalogPreferencePage,
  storeCatalogPreferencePage,
} from "../lib/catalogPreferences";
import { localImagePathToAssetSrc } from "../runtime/localAsset";
import { listManagedCategories } from "../runtime/managedCategoryCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";
import {
  catalogFilterChipKey,
  translateCatalogFilterValue,
  translateUiDisplayLabel,
  translateUiDisplayValue,
  type UiTranslator,
} from "../lib/uiDisplayLabels";
import { getSafeFilterEnabled } from "../lib/safeFilterState";
import {
  filterSafeFilterSortOptions,
  isSafeFilterFieldVisible,
} from "../lib/safeFilterVisibility";

type CollectionPageProps = {
  config: CollectionConfig;
  onFavoriteToggle?: (key: string, currentFavorite: boolean) => void;
};

type ViewMode = "card" | "table";
type DataFilterValues = Record<string, string>;
type TableSortState = {
  value: string;
  direction: "ascending" | "descending";
} | null;
type CatalogSessionFilters = {
  searchQuery: string;
  activeCategoryFilters: string[];
  dataFilters: DataFilterValues;
  sortValue?: string;
  tableSort?: TableSortState;
  viewMode?: ViewMode;
  pageSize?: string;
};
type PerformerFilterOptions = {
  gender: string[];
  bodyType: string[];
};
type DropdownState = {
  openDropdownKey: string | null;
  onOpenDropdownChange: (key: string | null) => void;
};
type UiTranslate = ReturnType<typeof useLanguage>["t"];

const emptyCatalogSessionFilters: CatalogSessionFilters = {
  searchQuery: "",
  activeCategoryFilters: [],
  dataFilters: {},
};

const catalogDataFilterKeys: Record<CollectionConfig["kind"], Set<string>> = {
  videos: new Set(["availability", "censorship", "year", "publisherLabel", "quality", "rating", "duration"]),
  images: new Set(["availability", "censorship", "year", "publisherLabel", "quality", "rating", "imageCount"]),
  performers: new Set(["status", "cupSize", "gender", "height", "age", "bodyType", "nationality", "debutYear", "rating", "filmography", "pictorials"]),
};

function durableCatalogFilters(value: unknown, kind: CollectionConfig["kind"]) {
  if (typeof value !== "object" || value === null) {
    return { activeCategoryFilters: [] as string[], dataFilters: {} as DataFilterValues };
  }
  const rawCategories = (value as { activeCategoryFilters?: unknown }).activeCategoryFilters;
  const rawDataFilters = (value as { dataFilters?: unknown }).dataFilters;
  const activeCategoryFilters = Array.isArray(rawCategories)
    ? rawCategories.filter((item): item is string => typeof item === "string").slice(0, 5)
    : [];
  const dataFilters: DataFilterValues = {};
  if (typeof rawDataFilters === "object" && rawDataFilters !== null) {
    for (const [key, filterValue] of Object.entries(rawDataFilters)) {
      if (
        catalogDataFilterKeys[kind].has(key) &&
        isSafeFilterFieldVisible(key, getSafeFilterEnabled()) &&
        typeof filterValue === "string"
      ) {
        dataFilters[key] = filterValue;
      }
    }
  }
  return { activeCategoryFilters, dataFilters };
}

function initialCatalogFilters(
  sessionKey: string,
  kind: CollectionConfig["kind"],
  sortOptions: string[],
): CatalogSessionFilters {
  if (hasSessionFilterState(sessionKey)) {
    return readSessionFilterState(sessionKey, emptyCatalogSessionFilters);
  }
  const durable = readCatalogPreferencePage(kind);
  const filters = durableCatalogFilters(durable.filters, kind);
  const allowedTableSorts = new Set(filterSafeFilterSortOptions([
    ...sortOptions,
    ...(kind === "performers"
      ? ["Status", "Original Name", "Categories", "Debut Year", "Filmography", "Pictorials", "Rating"]
      : kind === "images"
        ? ["Availability", "Original Title", "Code", "Categories", "Release Year", "Image Count", "Quality", "Censorship", "Rating"]
        : ["Availability", "Original Title", "Code", "Categories", "Release Year", "Duration", "Quality", "Censorship", "Rating"]),
  ], getSafeFilterEnabled()));
  const tableSort =
    durable.tableSort &&
    allowedTableSorts.has(durable.tableSort.value)
      ? durable.tableSort
      : null;
  return {
    ...emptyCatalogSessionFilters,
    ...filters,
    sortValue:
      durable.sort && sortOptions.includes(durable.sort) ? durable.sort : undefined,
    tableSort,
    viewMode: durable.view === "table" ? "table" : durable.view === "card" ? "card" : undefined,
  };
}

function CollectionPage({ config: sourceConfig, onFavoriteToggle }: CollectionPageProps) {
  const safeFilterEnabled = getSafeFilterEnabled();
  const config = useMemo<CollectionConfig>(() => ({
    ...sourceConfig,
    sortOptions: filterSafeFilterSortOptions(sourceConfig.sortOptions, safeFilterEnabled),
  }), [safeFilterEnabled, sourceConfig]);
  const [searchParams] = useSearchParams();
  const filterSessionKey = catalogFilterSessionKey(config.kind);
  const initialFilters = initialCatalogFilters(filterSessionKey, config.kind, config.sortOptions);
  const [searchQuery, setSearchQuery] = useState(initialFilters.searchQuery);
  const [activeCategoryFilters, setActiveCategoryFilters] = useState<string[]>(
    initialFilters.activeCategoryFilters,
  );
  const [dataFilters, setDataFilters] = useState<DataFilterValues>(
    initialFilters.dataFilters,
  );
  const [sortValue, setSortValue] = useState(
    initialFilters.sortValue && config.sortOptions.includes(initialFilters.sortValue)
      ? initialFilters.sortValue
      : config.sortOptions[0] ?? "",
  );
  const [tableSort, setTableSort] = useState<TableSortState>(
    initialFilters.tableSort ?? null,
  );
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [pageSize, setPageSize] = useState(() =>
    initialFilters.pageSize
      ? normalizeCatalogPageSize(initialFilters.pageSize)
      : DEFAULT_CATALOG_PAGE_SIZE,
  );
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>(
    initialFilters.viewMode === "table" ? "table" : "card",
  );
  const [managedCategoryRecords, setManagedCategoryRecords] = useState<ManagedCategory[]>([]);
  const categoryOptions = useMemo(
    () => getCategoryOptions(config.items),
    [config.items],
  );
  const performerFilterOptions = useMemo(
    () => buildPerformerFilterOptions(config.items, managedCategoryRecords),
    [config.items, managedCategoryRecords],
  );

  const sortedItems = sortItems(
    filterByDataFilters(
      filterByCategories(
        filterItems(config.items, searchQuery),
        activeCategoryFilters,
      ),
      dataFilters,
    ),
    tableSort?.value ?? sortValue,
    tableSort?.direction,
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
    setSortValue(config.sortOptions[0] ?? "");
    setTableSort(null);
    setViewMode("card");
    setPageSize(DEFAULT_CATALOG_PAGE_SIZE);
    clearSessionFilterState(filterSessionKey);
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
    const savedFilters = initialCatalogFilters(
      filterSessionKey,
      config.kind,
      config.sortOptions,
    );
    setSearchQuery(savedFilters.searchQuery);
    setActiveCategoryFilters(savedFilters.activeCategoryFilters);
    setDataFilters(savedFilters.dataFilters);
    setSortValue(
      savedFilters.sortValue && config.sortOptions.includes(savedFilters.sortValue)
        ? savedFilters.sortValue
        : config.sortOptions[0] ?? "",
    );
    setTableSort(savedFilters.tableSort ?? null);
    setPageSize(
      savedFilters.pageSize
        ? normalizeCatalogPageSize(savedFilters.pageSize)
        : DEFAULT_CATALOG_PAGE_SIZE,
    );
    setViewMode(savedFilters.viewMode === "table" ? "table" : "card");
    setPage(1);
  }, [config.kind, config.sortOptions, filterSessionKey]);

  useEffect(() => {
    writeSessionFilterState(filterSessionKey, {
      searchQuery,
      activeCategoryFilters,
      dataFilters,
      sortValue,
      tableSort,
      viewMode,
      pageSize,
    });
    storeCatalogPreferencePage(config.kind, {
      view: viewMode,
      sort: sortValue,
      tableSort,
      filters: { activeCategoryFilters, dataFilters },
    });
  }, [
    activeCategoryFilters,
    dataFilters,
    filterSessionKey,
    pageSize,
    searchQuery,
    sortValue,
    tableSort,
    viewMode,
    config.kind,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (config.kind !== "performers" || !isTauriRuntimeAvailable()) {
      setManagedCategoryRecords([]);
      return () => {
        cancelled = true;
      };
    }

    void listManagedCategories()
      .then((records) => {
        if (!cancelled) {
          setManagedCategoryRecords(records);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setManagedCategoryRecords([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [config.kind]);

  return (
    <div className="space-y-6">
      <CollectionHeader config={config} />
      <CollectionToolbar
        config={config}
        searchQuery={searchQuery}
        categoryOptions={categoryOptions}
        performerFilterOptions={performerFilterOptions}
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
          setTableSort(null);
          resetToFirstPage();
        }}
        onViewModeChange={(value) => {
          setViewMode(value);
          resetToFirstPage();
        }}
      />

      {hasVisibleItems ? (
        <>
          {viewMode === "card" ? (
            <section
              className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))] xl:[grid-template-columns:repeat(4,minmax(0,1fr))]"
            >
              {pageItems.map((item) => (
                <FullCard key={item.key} config={config} item={item} onFavoriteToggle={onFavoriteToggle} safeFilterEnabled={safeFilterEnabled} />
              ))}
            </section>
          ) : (
            <CollectionTable
              config={config}
              items={pageItems}
              sortValue={sortValue}
              tableSort={tableSort}
              onFavoriteToggle={onFavoriteToggle}
              onSortChange={(value) => {
                setTableSort((current) => ({
                  value,
                  direction:
                    current?.value === value && current.direction === "ascending"
                      ? "descending"
                      : "ascending",
                }));
                resetToFirstPage();
              }}
              safeFilterEnabled={safeFilterEnabled}
            />
          )}
          <PaginationBar
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            startItem={startIndex + 1}
            endItem={startIndex + pageItems.length}
            totalItems={sortedItems.length}
            onPageChange={setPage}
            onPageSizeChange={(value) => {
              const nextPageSize = normalizeCatalogPageSize(value);
              setPageSize(nextPageSize);
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
  const countKey =
    config.items.length === 1
      ? `count.${config.kind.slice(0, -1)}`
      : `count.${config.kind}`;
  const translatedCount = t(countKey, {
    count: String(config.items.length),
  });
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
          {translatedCount}
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
  performerFilterOptions,
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
  performerFilterOptions: PerformerFilterOptions;
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
  const toolbarRef = useRef<HTMLElement | null>(null);
  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);
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
  const activeFilterCount = activeCategoryFilters.length + activeDataFilters.length;
  const hasActiveFilterRow = activeFilterCount > 0;
  const dropdownState: DropdownState = {
    openDropdownKey,
    onOpenDropdownChange: setOpenDropdownKey,
  };

  useEffect(() => {
    if (!openDropdownKey) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && toolbarRef.current?.contains(target)) {
        return;
      }
      setOpenDropdownKey(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenDropdownKey(null);
      }
    }

    const handleScroll = (event: Event) => {
      if (event.target instanceof Node && toolbarRef.current?.contains(event.target)) {
        return;
      }
      setOpenDropdownKey(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [openDropdownKey]);

  return (
    <section ref={toolbarRef} className="rounded-lg border border-slate-200 bg-white p-3" aria-label={`${title} catalog toolbar`}>
      <div
        className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-2"
        data-testid={`${config.kind}-toolbar-row`}
      >
        <label
          className="relative block min-w-0 flex-1"
          data-testid={`${config.kind}-toolbar-search-region`}
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-10 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
            placeholder={searchPlaceholder}
            aria-label={`${title} search`}
            value={searchQuery}
            onFocus={() => setOpenDropdownKey(null)}
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
            "inline-flex h-11 w-full shrink-0 items-center justify-between gap-2 rounded-lg border px-3 text-sm font-semibold transition sm:w-auto",
            activeFilterCount > 0 || filterPanelOpen
              ? "border-sakura-200 bg-sakura-50 text-sakura-700 hover:border-sakura-300"
              : "border-slate-200 bg-white text-slate-700 hover:border-sakura-200 hover:text-sakura-600",
          ].join(" ")}
          aria-label={`Filters ${activeFilterCount}`}
          aria-expanded={filterPanelOpen}
          aria-controls={`${config.kind}-filter-panel`}
          onFocus={() => setOpenDropdownKey(null)}
          onClick={() => {
            setOpenDropdownKey(null);
            onToggleFilterPanel();
          }}
          data-testid={`${config.kind}-toolbar-filter-button`}
        >
          <Filter size={18} />
          <span className="hidden min-w-0 text-left sm:inline">{t("collection.filter")}</span>
          <span
            aria-label={`${activeFilterCount} active filters`}
            className={[
              "inline-flex min-w-6 items-center justify-center rounded-md border px-1.5 py-0.5 text-xs font-bold",
              activeFilterCount > 0
                ? "border-sakura-200 bg-sakura-50 text-sakura-700"
                : "border-slate-200 bg-slate-50 text-slate-500",
            ].join(" ")}
            data-testid={`${config.kind}-toolbar-filter-count`}
          >
            {activeFilterCount}
          </span>
          <ChevronDown
            size={16}
            className={filterPanelOpen ? "rotate-180 transition" : "transition"}
          />
        </button>

        <SortPicker
          dropdownKey={`${config.kind}.sort`}
          options={config.sortOptions}
          value={sortValue}
          onChange={onSortChange}
          dropdownState={dropdownState}
        />

        <button
        className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sakura-200 hover:text-sakura-600 sm:w-auto"
          type="button"
          aria-label={viewLabel}
          onFocus={() => setOpenDropdownKey(null)}
          onClick={() => {
            setOpenDropdownKey(null);
            onViewModeChange(viewAction);
          }}
        >
          <ViewIcon size={18} />
          <span className="hidden sm:inline">{t("collection.view")}</span>
        </button>
      </div>

      {filterPanelOpen && (
        <CollectionFilterPanel
          config={config}
          categoryOptions={selectableCategories}
          performerFilterOptions={performerFilterOptions}
          categorySelectDisabled={categorySelectDisabled}
          dataFilters={dataFilters}
          onAddCategoryFilter={onAddCategoryFilter}
          onDataFilterChange={onDataFilterChange}
          dropdownState={dropdownState}
        />
      )}

      {hasActiveFilterRow && (
        <div
          className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between"
          data-testid={`${config.kind}-active-filter-row`}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {activeCategoryFilters.map((category) => (
              <FilterChip
                key={normalizeCategoryKey(category)}
                label={`${t("catalog.filterChip.category")}: ${category}`}
                removeLabel={`Remove category filter ${category}`}
                onRemove={() => onRemoveCategoryFilter(category)}
              />
            ))}
            {activeDataFilters.map((filter) => (
              <FilterChip
                key={filter.id}
                label={`${t(catalogFilterChipKey(filter.id))}: ${translateCatalogFilterValue(t, filter.id, filter.value)}`}
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
          <div className="shrink-0">
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-700"
              onClick={onClearAllFilters}
            >
              {t("collection.clearAllFilters")}
            </button>
          </div>
        </div>
      )}
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
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-sakura-500 transition hover:bg-sakura-100 hover:text-sakura-700 focus:outline-none focus:ring-2 focus:ring-sakura-200"
        onClick={onRemove}
      >
        <X size={13} />
      </button>
    </span>
  );
}

function SortPicker({
  dropdownKey,
  options,
  value,
  onChange,
  dropdownState,
}: {
  dropdownKey: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  dropdownState: DropdownState;
}) {
  const t = useTranslation();
  const open = dropdownState.openDropdownKey === dropdownKey;

  function selectOption(option: string) {
    onChange(option);
    dropdownState.onOpenDropdownChange(null);
  }

  return (
    <div className="relative min-w-0 shrink-0 sm:w-auto">
      <button
        type="button"
        aria-label={`${t("common.sort")} ${translateUiDisplayLabel(t, value)}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sakura-200 hover:text-sakura-600 focus:outline-none focus:ring-4 focus:ring-sakura-100 sm:w-44"
        data-testid={`${dropdownKey}-sort-control`}
        onClick={() => dropdownState.onOpenDropdownChange(open ? null : dropdownKey)}
      >
        <ArrowUpDown size={18} className="shrink-0 text-slate-500" />
        <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-950">
          {translateUiDisplayLabel(t, value)}
        </span>
        <ChevronDown size={16} className={open ? "rotate-180 transition" : "transition"} />
      </button>
      {open && (
        <div className="absolute z-50 mt-2 w-full min-w-44 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div role="listbox" aria-label={t("collection.sortOptions")} className="sakurava-scrollbar max-h-64 overflow-y-auto p-1">
            {options.map((option) => (
              <PickerOption
                key={option}
                label={translateUiDisplayLabel(t, option)}
                selected={normalizedFilterValue(option) === normalizedFilterValue(value)}
                showMarker={false}
                onSelect={() => selectOption(option)}
              />
            ))}
            {options.length === 0 && (
              <p className="px-3 py-2 text-xs font-semibold text-slate-500">
                No matching options
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CollectionFilterPanel({
  config,
  categoryOptions,
  performerFilterOptions,
  categorySelectDisabled,
  dataFilters,
  onAddCategoryFilter,
  onDataFilterChange,
  dropdownState,
}: {
  config: CollectionConfig;
  categoryOptions: string[];
  performerFilterOptions: PerformerFilterOptions;
  categorySelectDisabled: boolean;
  dataFilters: DataFilterValues;
  onAddCategoryFilter: (value: string) => void;
  onDataFilterChange: (filterId: string, value: string) => void;
  dropdownState: DropdownState;
}) {
  const { t } = useLanguage();
  const title = t(`collection.title.${config.kind}`);

  return (
    <div
      id={`${config.kind}-filter-panel`}
      role="region"
      aria-label={`${title} filters`}
      className="mt-3 overflow-visible rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <div className="grid md:grid-cols-2">
        {filterPanelCells(config, categoryOptions, performerFilterOptions, categorySelectDisabled, dataFilters, onAddCategoryFilter, onDataFilterChange, dropdownState, t)}
      </div>
    </div>
  );
}

function filterPanelCells(
  config: CollectionConfig,
  categoryOptions: string[],
  performerFilterOptions: PerformerFilterOptions,
  categorySelectDisabled: boolean,
  dataFilters: DataFilterValues,
  onAddCategoryFilter: (value: string) => void,
  onDataFilterChange: (filterId: string, value: string) => void,
  dropdownState: DropdownState,
  t: UiTranslate,
) {
  if (config.kind === "images") {
    return imageFilterPanelCells(config, categoryOptions, categorySelectDisabled, dataFilters, onAddCategoryFilter, onDataFilterChange, dropdownState, t);
  }

  if (config.kind === "performers") {
    return performerFilterPanelCells(config, categoryOptions, performerFilterOptions, categorySelectDisabled, dataFilters, onAddCategoryFilter, onDataFilterChange, dropdownState, t);
  }

  return videoFilterPanelCells(config, categoryOptions, categorySelectDisabled, dataFilters, onAddCategoryFilter, onDataFilterChange, dropdownState, t);
}

function videoFilterPanelCells(
  config: CollectionConfig,
  categoryOptions: string[],
  categorySelectDisabled: boolean,
  dataFilters: DataFilterValues,
  onAddCategoryFilter: (value: string) => void,
  onDataFilterChange: (filterId: string, value: string) => void,
  dropdownState: DropdownState,
  t: UiTranslate,
) {
  const publisherOptions = pickerOptions(config.items, (item) =>
    item.kind === "videos" ? item.publisherLabel : undefined,
  );
  const yearOptions = yearRangeOptions(config.items, (item) =>
    item.kind === "videos" ? item.releaseYear : null,
  );

  return compactCells([
    <SegmentedFilterCell
      key="availability"
      kind={config.kind}
      filterId="availability"
      label={t("collection.availability")}
      options={["Owned", "Not Owned", "Missing"]}
        value={dataFilters.availability}
        onChange={onDataFilterChange}
        onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
      />,
    getSafeFilterEnabled() ? null : <SegmentedFilterCell
      key="censorship"
      kind={config.kind}
      filterId="censorship"
      label={t("collection.censorship")}
      options={["Uncensored", "Censored", "Reduced", "Leaked"]}
        value={dataFilters.censorship}
        onChange={onDataFilterChange}
        onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
      />,
    yearOptions.length > 0 ? (
      <PickerFilterCell
        key="year"
        kind={config.kind}
        filterId="year"
        label={t("collection.releaseYears")}
        allLabel={t("collection.allReleaseYears")}
        options={yearOptions}
        value={dataFilters.year}
        onChange={onDataFilterChange}
        dropdownKey={`${config.kind}.year`}
        dropdownState={dropdownState}
      />
    ) : null,
    publisherOptions.length > 0 ? (
      <PickerFilterCell
        key="publisherLabel"
        kind={config.kind}
        filterId="publisherLabel"
        label={t("collection.publisherLabel")}
        allLabel={t("collection.allPublishers")}
        options={publisherOptions}
        value={dataFilters.publisherLabel}
        onChange={onDataFilterChange}
        dropdownKey={`${config.kind}.publisherLabel`}
        dropdownState={dropdownState}
      />
    ) : null,
    <CategoryFilterCell
      key="category"
      kind={config.kind}
      categoryOptions={categoryOptions}
      categorySelectDisabled={categorySelectDisabled}
      onAddCategoryFilter={onAddCategoryFilter}
      dropdownKey={`${config.kind}.category`}
      dropdownState={dropdownState}
    />,
    <PickerFilterCell
      key="quality"
      kind={config.kind}
      filterId="quality"
      label={t("collection.quality")}
      allLabel={t("collection.allQuality")}
      options={["SD", "HD", "FHD", "4K", "8K"]}
      value={dataFilters.quality}
      onChange={onDataFilterChange}
      dropdownKey={`${config.kind}.quality`}
      dropdownState={dropdownState}
    />,
    <RatingFilterCell
      key="rating"
      kind={config.kind}
      value={dataFilters.rating}
      onChange={onDataFilterChange}
      onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
    />,
    <SegmentedFilterCell
      key="duration"
      kind={config.kind}
      filterId="duration"
      label={t("collection.duration")}
      options={["Short", "Medium", "Long"]}
      value={dataFilters.duration}
      onChange={onDataFilterChange}
      onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
    />,
  ]);
}

function imageFilterPanelCells(
  config: CollectionConfig,
  categoryOptions: string[],
  categorySelectDisabled: boolean,
  dataFilters: DataFilterValues,
  onAddCategoryFilter: (value: string) => void,
  onDataFilterChange: (filterId: string, value: string) => void,
  dropdownState: DropdownState,
  t: UiTranslate,
) {
  const publisherOptions = pickerOptions(config.items, (item) =>
    item.kind === "images" ? item.publisherLabel : undefined,
  );
  const yearOptions = yearRangeOptions(config.items, (item) =>
    item.kind === "images" ? item.releaseYear : null,
  );

  return compactCells([
    <SegmentedFilterCell
      key="availability"
      kind={config.kind}
      filterId="availability"
      label={t("collection.availability")}
      options={["Owned", "Not Owned", "Missing"]}
        value={dataFilters.availability}
        onChange={onDataFilterChange}
        onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
      />,
    getSafeFilterEnabled() ? null : <SegmentedFilterCell
      key="censorship"
      kind={config.kind}
      filterId="censorship"
      label={t("collection.censorship")}
      options={["Uncensored", "Censored", "Reduced", "Leaked"]}
        value={dataFilters.censorship}
        onChange={onDataFilterChange}
        onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
      />,
    yearOptions.length > 0 ? (
      <PickerFilterCell
        key="year"
        kind={config.kind}
        filterId="year"
        label={t("collection.releaseYears")}
        allLabel={t("collection.allReleaseYears")}
        options={yearOptions}
        value={dataFilters.year}
        onChange={onDataFilterChange}
        dropdownKey={`${config.kind}.year`}
        dropdownState={dropdownState}
      />
    ) : null,
    publisherOptions.length > 0 ? (
      <PickerFilterCell
        key="publisherLabel"
        kind={config.kind}
        filterId="publisherLabel"
        label={t("collection.publisherLabel")}
        allLabel={t("collection.allPublishers")}
        options={publisherOptions}
        value={dataFilters.publisherLabel}
        onChange={onDataFilterChange}
        dropdownKey={`${config.kind}.publisherLabel`}
        dropdownState={dropdownState}
      />
    ) : null,
    <CategoryFilterCell
      key="category"
      kind={config.kind}
      categoryOptions={categoryOptions}
      categorySelectDisabled={categorySelectDisabled}
      onAddCategoryFilter={onAddCategoryFilter}
      dropdownKey={`${config.kind}.category`}
      dropdownState={dropdownState}
    />,
    <PickerFilterCell
      key="quality"
      kind={config.kind}
      filterId="quality"
      label={t("collection.quality")}
      allLabel={t("collection.allQuality")}
      options={["SD", "HD", "FHD", "4K", "8K"]}
      value={dataFilters.quality}
      onChange={onDataFilterChange}
      dropdownKey={`${config.kind}.quality`}
      dropdownState={dropdownState}
    />,
    <RatingFilterCell
      key="rating"
      kind={config.kind}
      value={dataFilters.rating}
      onChange={onDataFilterChange}
      onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
    />,
    <SegmentedFilterCell
      key="imageCount"
      kind={config.kind}
      filterId="imageCount"
      label={t("collection.imageCount")}
      options={["Few", "Some", "Many"]}
      value={dataFilters.imageCount}
      onChange={onDataFilterChange}
      onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
    />,
  ]);
}

function performerFilterPanelCells(
  config: CollectionConfig,
  categoryOptions: string[],
  filterOptions: PerformerFilterOptions,
  categorySelectDisabled: boolean,
  dataFilters: DataFilterValues,
  onAddCategoryFilter: (value: string) => void,
  onDataFilterChange: (filterId: string, value: string) => void,
  dropdownState: DropdownState,
  t: UiTranslate,
) {
  const hasBirthDates = config.items.some(
    (item) => item.kind === "performers" && Boolean(item.birthDate?.trim()),
  );
  const nationalityOptions = pickerOptions(config.items, (item) =>
    item.kind === "performers" ? item.nationality : undefined,
  );
  const cupSizeOptions = pickerOptions(config.items, (item) =>
    item.kind === "performers" ? item.cupSize : undefined,
  );
  const debutYearOptions = yearRangeOptions(config.items, (item) =>
    item.kind === "performers" ? item.debutYear : null,
  );
  const hasHeights = config.items.some(
    (item) => item.kind === "performers" && typeof item.heightCm === "number",
  );

  return compactCells([
    <SegmentedFilterCell
      key="status"
      kind={config.kind}
      filterId="status"
      label={t("field.availability")}
      options={["Active", "Retired", "Unknown"]}
      value={dataFilters.status}
      onChange={onDataFilterChange}
      onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
    />,
    !getSafeFilterEnabled() && cupSizeOptions.length > 0 ? (
      <PickerFilterCell
        key="cupSize"
        kind={config.kind}
        filterId="cupSize"
        label={t("collection.cupSize")}
        allLabel={t("collection.allCupSizes")}
        options={cupSizeOptions}
        value={dataFilters.cupSize}
        onChange={onDataFilterChange}
        dropdownKey={`${config.kind}.cupSize`}
        dropdownState={dropdownState}
      />
    ) : null,
    <PickerFilterCell
      key="gender"
      kind={config.kind}
      filterId="gender"
      label={t("collection.gender")}
      allLabel={t("collection.allGenders")}
      options={filterOptions.gender}
      value={dataFilters.gender}
      onChange={onDataFilterChange}
      dropdownKey={`${config.kind}.gender`}
      dropdownState={dropdownState}
      disabled={filterOptions.gender.length === 0}
      emptyMessage={t("collection.noGender")}
    />,
    hasHeights ? (
      <SegmentedFilterCell
        key="height"
        kind={config.kind}
        filterId="height"
        label={t("collection.bodyHeight")}
        options={["Short", "Medium", "Tall"]}
        value={dataFilters.height}
        onChange={onDataFilterChange}
        onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
      />
    ) : null,
    hasBirthDates ? (
      <SegmentedFilterCell
        key="age"
        kind={config.kind}
        filterId="age"
        label={t("collection.age")}
        options={["Young", "Adult", "Mature", "Senior"]}
        value={dataFilters.age}
        onChange={onDataFilterChange}
        onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
      />
    ) : null,
    <PickerFilterCell
      key="bodyType"
      kind={config.kind}
      filterId="bodyType"
      label={t("collection.bodyType")}
      allLabel={t("collection.allBodyTypes")}
      options={filterOptions.bodyType}
      value={dataFilters.bodyType}
      onChange={onDataFilterChange}
      dropdownKey={`${config.kind}.bodyType`}
      dropdownState={dropdownState}
      disabled={filterOptions.bodyType.length === 0}
      emptyMessage={t("collection.noBodyTypes")}
    />,
    nationalityOptions.length > 0 ? (
      <PickerFilterCell
        key="nationality"
        kind={config.kind}
        filterId="nationality"
        label={t("collection.nationality")}
        allLabel={t("collection.allNationalities")}
        options={nationalityOptions}
        value={dataFilters.nationality}
        onChange={onDataFilterChange}
        dropdownKey={`${config.kind}.nationality`}
        dropdownState={dropdownState}
      />
    ) : null,
    debutYearOptions.length > 0 ? (
      <PickerFilterCell
        key="debutYear"
        kind={config.kind}
        filterId="debutYear"
        label={t("collection.debutYears")}
        allLabel={t("collection.allDebutYears")}
        options={debutYearOptions}
        value={dataFilters.debutYear}
        onChange={onDataFilterChange}
        dropdownKey={`${config.kind}.debutYear`}
        dropdownState={dropdownState}
      />
    ) : null,
    <RatingFilterCell
      key="rating"
      kind={config.kind}
      value={dataFilters.rating}
      onChange={onDataFilterChange}
      onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
    />,
    <SegmentedFilterCell
      key="filmography"
      kind={config.kind}
      filterId="filmography"
      label={t("collection.filmographyCount")}
      options={["Few", "Some", "Many", "All"]}
      value={dataFilters.filmography}
      onChange={onDataFilterChange}
      onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
    />,
    <CategoryFilterCell
      key="category"
      kind={config.kind}
      categoryOptions={categoryOptions}
      categorySelectDisabled={categorySelectDisabled}
      onAddCategoryFilter={onAddCategoryFilter}
      dropdownKey={`${config.kind}.category`}
      dropdownState={dropdownState}
    />,
    <SegmentedFilterCell
      key="pictorials"
      kind={config.kind}
      filterId="pictorials"
      label={t("collection.pictorialsCount")}
      options={["Few", "Some", "Many", "All"]}
      value={dataFilters.pictorials}
      onChange={onDataFilterChange}
      onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
    />,
  ]);
}

function compactCells(cells: Array<ReactElement | null>) {
  return cells
    .filter((cell): cell is ReactElement => Boolean(cell))
    .map((cell, index) => (
      <div
        key={cell.key ?? index}
        className={[
          "relative min-h-28 space-y-3 border-slate-100 p-4",
          index > 1 ? "border-t" : "",
          index % 2 === 1 ? "md:border-l" : "",
        ].join(" ")}
      >
        {cell}
      </div>
    ));
}

function SegmentedFilterCell({
  kind,
  filterId,
  label,
  options,
  value,
  onChange,
  onCloseDropdowns,
}: {
  kind: CollectionConfig["kind"];
  filterId: string;
  label: string;
  options: string[];
  value?: string;
  onChange: (filterId: string, value: string) => void;
  onCloseDropdowns?: () => void;
}) {
  const t = useTranslation();
  if (options.length === 0) {
    return null;
  }

  const allValue = allLabelForFilter(filterId, label);
  const currentValue = value ?? allValue;

  return (
    <>
      <PanelLabel>{label}</PanelLabel>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(4.75rem,1fr))] gap-2">
        {options.map((option) => {
          const optionValue = option === "All" ? allValue : option;
          const selected = normalizedFilterValue(currentValue) === normalizedFilterValue(optionValue);
          const displayOption = translateUiDisplayLabel(t, option);

          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              aria-label={`${label}: ${displayOption}`}
              className={[
                "min-h-9 min-w-0 rounded-lg border px-2 text-sm font-semibold transition sm:px-3",
                selected
                  ? "border-sakura-200 bg-sakura-50 text-sakura-700"
                  : "border-slate-200 bg-white text-slate-700 hover:border-sakura-200 hover:text-sakura-600",
              ].join(" ")}
              onFocus={onCloseDropdowns}
              onClick={() => {
                onCloseDropdowns?.();
                onChange(filterId, selected ? allValue : optionValue);
              }}
            >
              <span className="block truncate" title={displayOption}>{displayOption}</span>
            </button>
          );
        })}
      </div>
      <input type="hidden" aria-label={`${kind} ${label}`} value={currentValue} readOnly />
    </>
  );
}

function PickerFilterCell({
  kind,
  filterId,
  label,
  allLabel,
  options,
  value,
  onChange,
  dropdownKey,
  dropdownState,
  disabled = false,
  emptyMessage,
}: {
  kind: CollectionConfig["kind"];
  filterId: string;
  label: string;
  allLabel: string;
  options: string[];
  value?: string;
  onChange: (filterId: string, value: string) => void;
  dropdownKey: string;
  dropdownState: DropdownState;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState("");
  const open = dropdownState.openDropdownKey === dropdownKey;
  const currentValue = value ?? allLabel;
  const inputValue = open ? query : translateUiDisplayLabel(t, currentValue);
  const visibleOptions = options.filter((option) =>
    normalizedFilterValue(option).includes(normalizedFilterValue(query)),
  );

  function openPicker() {
    if (disabled) {
      return;
    }
    dropdownState.onOpenDropdownChange(dropdownKey);
    setQuery("");
  }

  function closePicker() {
    dropdownState.onOpenDropdownChange(null);
    setQuery("");
  }

  return (
    <div className="relative">
      <PanelLabel>{label}</PanelLabel>
      <label className={[
        "mt-3 flex h-11 w-full items-center gap-2 rounded-lg border border-slate-200 px-3 text-left text-sm font-semibold transition focus-within:border-sakura-300 focus-within:ring-4 focus-within:ring-sakura-100",
        disabled ? "bg-slate-50 text-slate-400" : "bg-white text-slate-700",
      ].join(" ")}>
        <Search size={16} className="shrink-0 text-slate-400" />
        <input
          id={`${kind}-${filterId}-panel-filter`}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400 disabled:text-slate-400"
          placeholder={pickerPlaceholder(label)}
          value={inputValue}
          disabled={disabled}
          onFocus={openPicker}
          onChange={(event) => {
            if (disabled) {
              return;
            }
            const nextQuery = event.target.value;
            dropdownState.onOpenDropdownChange(dropdownKey);
            setQuery(nextQuery);
            const exactOption = options.find(
              (option) => normalizedFilterValue(option) === normalizedFilterValue(nextQuery),
            );
            if (normalizedFilterValue(allLabel) === normalizedFilterValue(nextQuery)) {
              onChange(filterId, allLabel);
              closePicker();
            } else if (exactOption) {
              onChange(filterId, exactOption);
              closePicker();
            }
          }}
        />
        <button
          type="button"
          aria-label={`Open ${label} options`}
          className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-sakura-50 hover:text-sakura-600 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={disabled}
          onClick={() => {
            if (disabled) {
              return;
            }
            dropdownState.onOpenDropdownChange(open ? null : dropdownKey);
            setQuery("");
          }}
        >
          <ChevronDown size={16} className={open ? "rotate-180 transition" : "transition"} />
        </button>
      </label>
      {open && (
        <div
          id={`${kind}-${filterId}-panel-popup`}
          className="absolute z-50 mt-2 w-full rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div role="listbox" aria-label={`${label} options`} className="max-h-56 overflow-y-auto p-1">
            <PickerOption
              label={translateUiDisplayLabel(t, allLabel)}
              highlightQuery={query}
              selected={isAllFilterValue(filterId, value)}
                onSelect={() => {
                  onChange(filterId, allLabel);
                  closePicker();
              }}
            />
            {visibleOptions.map((option) => (
              <PickerOption
                key={option}
                label={translateUiDisplayLabel(t, option)}
                highlightQuery={query}
                selected={normalizedFilterValue(currentValue) === normalizedFilterValue(option)}
                onSelect={() => {
                  onChange(filterId, option);
                  closePicker();
                }}
              />
            ))}
            {visibleOptions.length === 0 && (
              <p className="px-3 py-2 text-xs font-semibold text-slate-500">
                No matching options
              </p>
            )}
          </div>
        </div>
      )}
      {disabled && emptyMessage && (
        <p className="mt-1 text-xs font-semibold text-slate-500">{emptyMessage}</p>
      )}
    </div>
  );
}

function CategoryFilterCell({
  kind,
  categoryOptions,
  categorySelectDisabled,
  onAddCategoryFilter,
  dropdownKey,
  dropdownState,
}: {
  kind: CollectionConfig["kind"];
  categoryOptions: string[];
  categorySelectDisabled: boolean;
  onAddCategoryFilter: (value: string) => void;
  dropdownKey: string;
  dropdownState: DropdownState;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState("");
  const open = dropdownState.openDropdownKey === dropdownKey;
  const visibleOptions = categoryOptions.filter((category) =>
    normalizedFilterValue(category).includes(normalizedFilterValue(query)),
  );

  function openPicker() {
    dropdownState.onOpenDropdownChange(dropdownKey);
    setQuery("");
  }

  function closePicker() {
    dropdownState.onOpenDropdownChange(null);
    setQuery("");
  }

  return (
    <div className="relative">
      <PanelLabel>{t("collection.category")}</PanelLabel>
      <label className="mt-3 flex h-11 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-slate-700 transition focus-within:border-sakura-300 focus-within:ring-4 focus-within:ring-sakura-100">
        <Search size={16} className="shrink-0 text-slate-400" />
        <input
          id={`${kind}-category-panel-filter`}
          aria-label={t("collection.category")}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400 disabled:text-slate-400"
          placeholder={t("collection.addCategoryFilter")}
          value={open ? query : t("collection.addCategoryFilter")}
          disabled={categorySelectDisabled}
          onFocus={openPicker}
          onChange={(event) => {
            const nextQuery = event.target.value;
            dropdownState.onOpenDropdownChange(dropdownKey);
            setQuery(nextQuery);
            const exactCategory = categoryOptions.find(
              (category) => normalizedFilterValue(category) === normalizedFilterValue(nextQuery),
            );
            if (exactCategory) {
              onAddCategoryFilter(exactCategory);
              closePicker();
            }
          }}
        />
        <button
          type="button"
          aria-label={t("collection.openCategoryOptions")}
          className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-sakura-50 hover:text-sakura-600 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={categorySelectDisabled}
          onClick={() => {
            dropdownState.onOpenDropdownChange(open ? null : dropdownKey);
            setQuery("");
          }}
        >
          <ChevronDown size={16} className={open ? "rotate-180 transition" : "transition"} />
        </button>
      </label>
      {open && (
        <div
          id={`${kind}-category-panel-popup`}
          className="absolute z-50 mt-2 w-full rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div role="listbox" aria-label={t("collection.categoryOptions")} className="max-h-56 overflow-y-auto p-1">
            {visibleOptions.map((category) => (
              <PickerOption
              key={category}
              label={category}
              highlightQuery={query}
              selected={false}
              onSelect={() => {
                onAddCategoryFilter(category);
                closePicker();
              }}
            />
            ))}
            {visibleOptions.length === 0 && (
              <p className="px-3 py-2 text-xs font-semibold text-slate-500">
                {t("collection.noMatchingCategories")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PickerOption({
  label,
  highlightQuery = "",
  selected,
  showMarker = true,
  onSelect,
}: {
  label: string;
  highlightQuery?: string;
  selected: boolean;
  showMarker?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={[
        "flex min-h-9 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold transition",
        selected
          ? "bg-sakura-50 text-sakura-700"
          : "text-slate-700 hover:bg-sakura-50 hover:text-sakura-700",
      ].join(" ")}
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1 truncate">
        <HighlightedOptionText text={label} query={highlightQuery} />
      </span>
      {showMarker && (
        <span className={selected ? "text-sakura-600" : "text-slate-400"}>+</span>
      )}
    </button>
  );
}

function HighlightedOptionText({ text, query }: { text: string; query: string }) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return <>{text}</>;
  }

  const normalizedText = text.toLocaleLowerCase();
  const normalizedQuery = trimmedQuery.toLocaleLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return <>{text}</>;
  }

  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + trimmedQuery.length);
  const after = text.slice(matchIndex + trimmedQuery.length);

  return (
    <>
      {before}
      <mark
        className="rounded-sm bg-sakura-100 px-0.5 text-sakura-800"
        data-testid="catalog-query-highlight"
      >
        {match}
      </mark>
      {after}
    </>
  );
}

function RatingFilterCell({
  kind,
  value,
  onChange,
  onCloseDropdowns,
}: {
  kind: CollectionConfig["kind"];
  value?: string;
  onChange: (filterId: string, value: string) => void;
  onCloseDropdowns?: () => void;
}) {
  const t = useTranslation();
  const currentRating = numberFromDisplayText(value ?? "") ?? 1;
  const isActive = !isAllFilterValue("rating", value);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PanelLabel>{t("common.rating")}</PanelLabel>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-sakura-50 hover:text-sakura-600"
          onFocus={onCloseDropdowns}
          onClick={() => {
            onCloseDropdowns?.();
            onChange("rating", "All ratings");
          }}
        >
          {t("categories.filter.all")}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-500">1</span>
        <input
          type="range"
          min="1"
          max="5"
          step="1"
          aria-label={`${kind} Rating`}
          className="h-2 min-w-0 flex-1 accent-sakura-500"
          value={currentRating}
          onFocus={onCloseDropdowns}
          onChange={(event) => {
            onCloseDropdowns?.();
            onChange("rating", `${event.target.value} star`);
          }}
        />
        <span className="text-xs font-semibold text-slate-500">5</span>
        <span className="min-w-12 rounded-lg border border-sakura-100 bg-sakura-50 px-2 py-1 text-center text-xs font-bold text-sakura-700">
          {isActive ? `${currentRating}+` : t("common.filter.rating.any")}
        </span>
      </div>
    </>
  );
}

function PanelLabel({ children }: { children: string }) {
  return (
    <p className="text-sm font-bold text-slate-950">
      {children}
    </p>
  );
}

function pickerPlaceholder(label: string) {
  if (label === "Release Years") {
    return "Search release years...";
  }

  if (label === "Publisher / Label") {
    return "Search publisher or label...";
  }

  if (label === "Nationality") {
    return "Search nationality...";
  }

  if (label === "Cup Size") {
    return "Search cup size...";
  }

  if (label === "Debut Years") {
    return "Search debut years...";
  }

  if (label === "Quality") {
    return "Search quality...";
  }

  return `Search ${label.toLocaleLowerCase()}...`;
}

function allLabelForFilter(filterId: string, label: string) {
  if (filterId === "filmography") {
    return "All filmography";
  }

  if (filterId === "pictorials") {
    return "All pictorials";
  }

  return `All ${label.toLocaleLowerCase()}`;
}

function pickerOptions(
  items: CollectionItem[],
  valueForItem: (item: CollectionItem) => string | null | undefined,
) {
  const valuesByKey = new Map<string, string>();

  for (const item of items) {
    const value = valueForItem(item)?.trim();

    if (!value) {
      continue;
    }

    const key = normalizedFilterValue(value);
    if (!valuesByKey.has(key)) {
      valuesByKey.set(key, value);
    }
  }

  return [...valuesByKey.values()].sort((left, right) =>
    left.localeCompare(right),
  );
}

function yearRangeOptions(
  items: CollectionItem[],
  yearForItem: (item: CollectionItem) => number | null | undefined,
) {
  const years: number[] = [];

  for (const item of items) {
    const year = yearForItem(item);

    if (typeof year !== "number" || !Number.isInteger(year)) {
      continue;
    }

    years.push(year);
  }

  if (years.length === 0) {
    return [];
  }

  const oldestYear = Math.min(...years);
  const newestYear = Math.max(...years);

  return Array.from(
    { length: newestYear - oldestYear + 1 },
    (_, index) => String(oldestYear + index),
  );
}

function catalogFilterGroups(kind: CollectionConfig["kind"]) {
  if (kind === "performers") {
    return [
      { id: "status", label: "Availability", options: ["All status", "Active", "Retired", "Unknown"] },
      { id: "gender", label: "Gender", options: ["All genders"] },
      { id: "age", label: "Age", options: ["All age", "Young", "Adult", "Mature", "Senior"] },
      { id: "height", label: "Body Height", options: ["All height", "Short", "Medium", "Tall"] },
      { id: "bodyType", label: "Body Type", options: ["All body types"] },
      { id: "nationality", label: "Nationality", options: ["All nationalities"] },
      { id: "cupSize", label: "Cup Size", options: ["All cup sizes"] },
      { id: "rating", label: "Rating", options: ratingFilterOptions() },
      { id: "debutYear", label: "Debut Years", options: yearFilterOptions("All debut years") },
      { id: "filmography", label: "Filmography Count", options: countFilterOptions("All filmography") },
      { id: "pictorials", label: "Pictorials Count", options: countFilterOptions("All pictorials") },
    ].filter((filter) => isSafeFilterFieldVisible(filter.id, getSafeFilterEnabled()));
  }

  if (kind === "images") {
    return [
      { id: "availability", label: "Availability", options: ["All availability", "Owned", "Not Owned", "Missing"] },
      { id: "censorship", label: "Censorship", options: ["All censorship", "Uncensored", "Censored", "Reduced", "Leaked"] },
      { id: "publisherLabel", label: "Publisher / Label", options: ["All publishers"] },
      { id: "quality", label: "Quality", options: qualityFilterOptions() },
      { id: "rating", label: "Rating", options: ratingFilterOptions() },
      { id: "year", label: "Release Years", options: yearFilterOptions("All release years") },
      { id: "imageCount", label: "Image Count", options: countFilterOptions("All image counts") },
    ].filter((filter) => isSafeFilterFieldVisible(filter.id, getSafeFilterEnabled()));
  }

  return [
    { id: "availability", label: "Availability", options: ["All availability", "Owned", "Not Owned", "Missing"] },
    { id: "censorship", label: "Censorship", options: ["All censorship", "Uncensored", "Censored", "Reduced", "Leaked"] },
    { id: "publisherLabel", label: "Publisher / Label", options: ["All publishers"] },
    { id: "quality", label: "Quality", options: qualityFilterOptions() },
    { id: "rating", label: "Rating", options: ratingFilterOptions() },
    { id: "year", label: "Release Years", options: yearFilterOptions("All release years") },
    { id: "duration", label: "Duration", options: ["All durations", "Short", "Medium", "Long"] },
  ].filter((filter) => isSafeFilterFieldVisible(filter.id, getSafeFilterEnabled()));
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
  return ["All quality", "SD", "HD", "FHD", "4K", "8K"];
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
  sortValue,
  tableSort,
  onFavoriteToggle,
  onSortChange,
  safeFilterEnabled,
}: {
  config: CollectionConfig;
  items: CollectionItem[];
  sortValue: string;
  tableSort: TableSortState;
  onFavoriteToggle?: (key: string, currentFavorite: boolean) => void;
  onSortChange: (value: string) => void;
  safeFilterEnabled: boolean;
}) {
  const t = useTranslation();
  const columns = tableColumns(config.kind).filter((column) =>
    isSafeFilterFieldVisible(column.id, safeFilterEnabled),
  );
  const tableWidth = tableWidthPx(columns);

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white"
      data-testid={`${config.kind}-catalog-table-card`}
    >
      <StickyHorizontalScroll testId={`${config.kind}-catalog-table-scroll`}>
        <table
          className={`table-fixed divide-y divide-slate-200 text-left text-sm ${catalogTableMinWidth(config.kind)}`}
          data-testid={`${config.kind}-catalog-table`}
          style={{ minWidth: `${tableWidth}px`, width: `${tableWidth}px` }}
        >
          <colgroup data-testid={`${config.kind}-catalog-table-colgroup`}>
            {columns.map((column) => (
              <col
                key={column.id}
                className={column.className}
                data-column-id={column.id}
                data-testid={`${config.kind}-catalog-table-col-${column.id}`}
                style={{ width: `${column.widthPx}px` }}
              />
            ))}
          </colgroup>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  aria-sort={ariaSortForColumn(column, tableSort)}
                  className={["min-w-0 overflow-hidden px-3 py-3", column.className ?? ""].join(" ")}
                  style={{ width: `${column.widthPx}px` }}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      aria-label={`Sort by ${translateUiDisplayLabel(t, column.sortLabel ?? column.header)}`}
                      title={`Sort by ${translateUiDisplayLabel(t, column.sortLabel ?? column.header)}`}
                      className={[
                        "inline-flex max-w-full items-center gap-1 text-left font-semibold transition hover:text-sakura-700 focus:outline-none",
                        tableSort?.value === column.sortValue ? "text-sakura-800" : "",
                      ].join(" ")}
                      onClick={() => onSortChange(column.sortValue!)}
                    >
                      <span className={column.hiddenHeader ? "sr-only" : "truncate"}>
                        {collectionColumnHeader(t, column)}
                      </span>
                      {tableSort?.value === column.sortValue && (
                        <span aria-hidden="true" className="text-[10px] text-sakura-700">
                          {tableSort.direction === "ascending" ? "↑" : "↓"}
                        </span>
                      )}
                    </button>
                  ) : (
                    <span className={column.hiddenHeader ? "sr-only" : "block truncate"}>
                      {collectionColumnHeader(t, column)}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <CollectionTableRow
                key={item.key}
                config={config}
                item={item}
                columns={columns}
                onFavoriteToggle={onFavoriteToggle}
              />
            ))}
          </tbody>
        </table>
      </StickyHorizontalScroll>
    </section>
  );
}

function CollectionTableRow({
  config,
  item,
  columns,
  onFavoriteToggle,
}: {
  config: CollectionConfig;
  item: CollectionItem;
  columns: TableColumn[];
  onFavoriteToggle?: (key: string, currentFavorite: boolean) => void;
}) {
  const navigate = useNavigate();
  const detailPath = `/${config.kind}/${item.sakuravaRef ? formatSakuravaRef(item.sakuravaRef) : item.key}`;

  const openDetail = () => navigate(detailPath);

  return (
    <tr
      className="cursor-pointer align-middle transition hover:bg-sakura-50/60"
      aria-label={`Open ${getPrimaryTitle(item)}`}
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetail();
        }
      }}
    >
      {columns.map((column) => (
        <td
          key={`${item.key}-${column.id}`}
          className={["min-w-0 overflow-hidden px-3 py-3 text-slate-700", column.className ?? ""].join(" ")}
          style={{ width: `${column.widthPx}px` }}
        >
          {column.render(item, config, onFavoriteToggle)}
        </td>
      ))}
    </tr>
  );
}

type CollectionCardProps = {
  config: CollectionConfig;
  item: CollectionItem;
  onFavoriteToggle?: (key: string, currentFavorite: boolean) => void;
  safeFilterEnabled: boolean;
};

function FullCard({ config, item, onFavoriteToggle, safeFilterEnabled }: CollectionCardProps) {
  const linkTo = `/${config.kind}/${item.sakuravaRef ? formatSakuravaRef(item.sakuravaRef) : item.key}`;
  const handleFavorite = onFavoriteToggle ? () => onFavoriteToggle(item.key, item.favorite) : undefined;

  if (item.kind === "performers") {
    return <PerformerFullCard item={item} linkTo={linkTo} placeholderLabel={config.placeholderLabel} onFavoriteClick={handleFavorite} />;
  }

  if (item.kind === "images") {
    return <ImageFullCard item={item} linkTo={linkTo} placeholderLabel={config.placeholderLabel} onFavoriteClick={handleFavorite} showCensorship={!safeFilterEnabled} />;
  }

  return <VideoFullCard item={item} linkTo={linkTo} placeholderLabel={config.placeholderLabel} onFavoriteClick={handleFavorite} showCensorship={!safeFilterEnabled} />;
}

function PaginationBar({
  page,
  pageCount,
  pageSize,
  startItem,
  endItem,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: string;
  startItem: number;
  endItem: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: string) => void;
}) {
  const { t } = useLanguage();

  return (
    <nav
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      aria-label={t("collection.pagination")}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <p className="text-sm font-semibold text-slate-600">
          {t("pagination.showing", {
            start: String(startItem),
            end: String(endItem),
            total: String(totalItems),
          })}
        </p>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          {t("collection.pageSize")}
          <SakuravaSelect
            placement="up"
            value={pageSize}
            onChange={onPageSizeChange}
            ariaLabel={t("collection.itemsPerPage")}
            options={CATALOG_PAGE_SIZE_OPTIONS.map((option) => ({
              value: option,
              label: option,
            }))}
          />
          <span>{t("collection.perPage")}</span>
        </label>
      </div>
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
        {hasItems ? t("collection.noMatchingItems") : t("catalog.empty")}
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
  if (filterId === "availability") {
    return item.kind !== "performers" && normalizedFilterValue(item.availability) === normalizedFilterValue(value);
  }

  if (filterId === "censorship") {
    return item.kind !== "performers" && censorshipMatches(item.censorship, value);
  }

  if (filterId === "publisherLabel") {
    return (
      item.kind !== "performers" &&
      normalizedFilterValue(item.publisherLabel) === normalizedFilterValue(value)
    );
  }

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

  if (filterId === "gender") {
    return (
      item.kind === "performers" &&
      normalizedFilterValue(item.gender) === normalizedFilterValue(value)
    );
  }

  if (filterId === "bodyType") {
    return item.kind === "performers" && performerCategoryMatches(item, value);
  }

  if (filterId === "age") {
    return item.kind === "performers" && ageMatchesBucket(item.birthDate, value);
  }

  if (filterId === "height") {
    return item.kind === "performers" && heightMatchesBucket(item.heightCm, value);
  }

  if (filterId === "nationality") {
    return (
      item.kind === "performers" &&
      normalizedFilterValue(item.nationality) === normalizedFilterValue(value)
    );
  }

  if (filterId === "cupSize") {
    return (
      item.kind === "performers" &&
      normalizedFilterValue(item.cupSize) === normalizedFilterValue(value)
    );
  }

  return true;
}

function performerCategoryMatches(item: CollectionItem, value: string) {
  const filterKey = normalizeCategoryKey(value);
  return item.categories.some((category) => normalizeCategoryKey(category) === filterKey);
}

function sortItems(
  items: CollectionItem[],
  sortValue: string,
  directionOverride?: "ascending" | "descending",
) {
  const indexedItems = items.map((item, index) => ({ item, index }));
  const textDirection = directionOverride ?? "ascending";
  const numberDirection = directionOverride ?? "descending";
  const newestDirection = directionOverride ?? "descending";

  if (sortValue === "Last Added") {
    return indexedItems
      .slice()
      .sort((left, right) => {
        const leftTime = timestamp(left.item.createdAt) || timestamp(left.item.updatedAt);
        const rightTime = timestamp(right.item.createdAt) || timestamp(right.item.updatedAt);
        const compared =
          newestDirection === "ascending"
            ? leftTime - rightTime
            : rightTime - leftTime;

        return compared || left.index - right.index;
      })
      .map(({ item }) => item);
  }

  if (sortValue === "Last Updated") {
    return indexedItems
      .slice()
      .sort((left, right) => {
        const leftTime = timestamp(left.item.updatedAt);
        const rightTime = timestamp(right.item.updatedAt);
        const compared =
          newestDirection === "ascending"
            ? leftTime - rightTime
            : rightTime - leftTime;

        return compared || left.index - right.index;
      })
      .map(({ item }) => item);
  }

  if (
    sortValue === "Title A-Z" ||
    sortValue === "Title Z-A" ||
    sortValue === "Name A-Z" ||
    sortValue === "Name Z-A"
  ) {
    const sortDescending = sortValue === "Title Z-A" || sortValue === "Name Z-A";
    const effectiveDirection = directionOverride ?? (sortDescending ? "descending" : "ascending");
    return indexedItems
      .slice()
      .sort((left, right) => {
        const compared = getPrimaryTitle(left.item).localeCompare(
          getPrimaryTitle(right.item),
        );
        return (effectiveDirection === "ascending" ? compared : -compared) ||
          left.index - right.index;
      })
      .map(({ item }) => item);
  }

  if (sortValue === "Original Title" || sortValue === "Original Name") {
    return sortByText(indexedItems, originalNameOrTitle, textDirection);
  }

  if (sortValue === "Code") {
    return sortByText(
      indexedItems,
      (item) => (item.kind === "videos" || item.kind === "images" ? item.code : ""),
      textDirection,
    );
  }

  if (sortValue === "Categories") {
    return sortByText(indexedItems, (item) => item.categories.join(", "), textDirection);
  }

  if (sortValue === "Quality") {
    return sortByText(
      indexedItems,
      (item) => (item.kind === "performers" ? "" : item.quality ?? ""),
      textDirection,
    );
  }

  if (sortValue === "Availability") {
    return sortByText(
      indexedItems,
      (item) => (item.kind === "performers" ? "" : item.availability ?? ""),
      textDirection,
    );
  }

  if (sortValue === "Censorship") {
    return sortByText(
      indexedItems,
      (item) => (item.kind === "performers" ? "" : item.censorship ?? ""),
      textDirection,
    );
  }

  if (sortValue === "Duration") {
    return sortByNumber(
      indexedItems,
      (item) => (item.kind === "videos" ? item.durationMinutes ?? null : null),
      numberDirection,
    );
  }

  if (sortValue === "Image Count") {
    return sortByNumber(
      indexedItems,
      (item) => (item.kind === "images" ? item.imageCountValue ?? null : null),
      numberDirection,
    );
  }

  if (sortValue === "Release Year") {
    return sortByNumber(
      indexedItems,
      (item) => (item.kind === "performers" ? null : item.releaseYear ?? null),
      numberDirection,
    );
  }

  if (sortValue === "Debut Year") {
    return sortByNumber(
      indexedItems,
      (item) => (item.kind === "performers" ? item.debutYear ?? null : null),
      numberDirection,
    );
  }

  if (sortValue === "Rating") {
    return sortByNumber(indexedItems, (item) => item.ratingAverage ?? null, numberDirection);
  }

  if (sortValue === "Status") {
    return sortByText(
      indexedItems,
      (item) => (item.kind === "performers" ? item.status : ""),
      textDirection,
    );
  }

  if (sortValue === "Filmography") {
    return sortByNumber(
      indexedItems,
      (item) =>
        item.kind === "performers"
          ? item.filmographyCountValue ?? null
          : null,
      numberDirection,
    );
  }

  if (sortValue === "Pictorials") {
    return sortByNumber(
      indexedItems,
      (item) =>
        item.kind === "performers"
          ? item.pictorialsCountValue ?? null
          : null,
      numberDirection,
    );
  }

  return items;
}

function originalNameOrTitle(item: CollectionItem) {
  return item.kind === "performers" ? item.originalName : item.originalTitle;
}

function sortByText(
  indexedItems: Array<{ item: CollectionItem; index: number }>,
  valueForItem: (item: CollectionItem) => string | null | undefined,
  direction: "ascending" | "descending" = "ascending",
) {
  return indexedItems
    .slice()
    .sort((left, right) => {
      const leftValue = valueForItem(left.item)?.trim() ?? "";
      const rightValue = valueForItem(right.item)?.trim() ?? "";

      if (!leftValue && !rightValue) {
        return left.index - right.index;
      }

      if (!leftValue) {
        return 1;
      }

      if (!rightValue) {
        return -1;
      }

      const compared = leftValue.localeCompare(rightValue);
      return (direction === "ascending" ? compared : -compared) ||
        left.index - right.index;
    })
    .map(({ item }) => item);
}

function sortByNumber(
  indexedItems: Array<{ item: CollectionItem; index: number }>,
  valueForItem: (item: CollectionItem) => number | null,
  direction: "ascending" | "descending" = "descending",
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

      const compared =
        direction === "ascending"
          ? leftValue - rightValue
          : rightValue - leftValue;
      return compared || left.index - right.index;
    })
    .map(({ item }) => item);
}

function getSearchText(item: CollectionItem) {
  const safeFilterEnabled = getSafeFilterEnabled();
  if (item.kind === "performers") {
    return normalizeSearchText(
      [
        item.name,
        item.sakuravaRef,
        item.sakuravaRef ? formatSakuravaRef(item.sakuravaRef) : "",
        ...(item.identityAliases ?? []),
        item.originalName,
        item.aliases,
        item.status,
        item.nationality,
        safeFilterEnabled ? "" : item.cupSize,
        item.filmographyCount,
        item.pictorialsCount,
        ...item.categories,
      ].join(" "),
    );
  }

  const fields = [
    item.sakuravaRef,
    item.sakuravaRef ? formatSakuravaRef(item.sakuravaRef) : "",
    ...(item.identityAliases ?? []),
    item.title,
    item.originalTitle,
    item.availability,
    safeFilterEnabled ? "" : item.censorship,
    item.publisherLabel,
    ...item.categories,
  ];

  if (item.kind === "videos") {
    fields.push(item.code, item.duration);
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

function buildPerformerFilterOptions(
  items: CollectionItem[],
  categories: ManagedCategory[],
) {
  return {
    gender: pickerOptions(items, (item) =>
      item.kind === "performers" ? item.gender : undefined,
    ),
    bodyType: childTaxonomyFilterOptions(categories, [
      "bodytype",
      "body type",
      "body-type",
      "body_type",
    ]),
  };
}

function childTaxonomyFilterOptions(
  categories: ManagedCategory[],
  parentAliases: string[],
) {
  const parent = findTaxonomyParent(categories, parentAliases);
  if (!parent) {
    return [];
  }

  const optionsByKey = new Map<string, string>();
  for (const category of categories) {
    const label = category.name.trim();
    if (
      category.parentKey !== parent.key ||
      !category.showInPerformers ||
      !label
    ) {
      continue;
    }

    const key = normalizeCategoryKey(label);
    if (!optionsByKey.has(key)) {
      optionsByKey.set(key, label);
    }
  }

  return [...optionsByKey.values()].sort((left, right) =>
    left.localeCompare(right),
  );
}

function findTaxonomyParent(
  categories: ManagedCategory[],
  aliases: string[],
) {
  const normalizedAliases = aliases.map(normalizeTaxonomyName);
  const matchingParents = categories.filter((category) =>
    !category.parentKey &&
    normalizedAliases.includes(normalizeTaxonomyName(category.name)),
  );

  return matchingParents.sort((first, second) => {
    const firstExactRank = exactTaxonomyAliasRank(first.name, aliases);
    const secondExactRank = exactTaxonomyAliasRank(second.name, aliases);
    if (firstExactRank !== secondExactRank) {
      return firstExactRank - secondExactRank;
    }
    return categories.indexOf(first) - categories.indexOf(second);
  })[0] ?? null;
}

function exactTaxonomyAliasRank(name: string, aliases: string[]) {
  const normalizedName = name.trim().toLowerCase();
  const exactIndex = aliases.findIndex(
    (alias) => alias.trim().toLowerCase() === normalizedName,
  );
  return exactIndex === -1 ? Number.MAX_SAFE_INTEGER : exactIndex;
}

function normalizeTaxonomyName(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]/g, "");
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

  const expectedYear = Number(value);
  if (!Number.isInteger(expectedYear)) {
    return false;
  }

  return year === expectedYear;
}

function censorshipMatches(itemValue: string | null | undefined, filterValue: string) {
  const normalizedItem = normalizedFilterValue(itemValue);
  const normalizedFilter = normalizedFilterValue(filterValue);

  if (normalizedFilter === "reduced") {
    return normalizedItem.includes("reduced");
  }

  return normalizedItem === normalizedFilter;
}

function ageMatchesBucket(birthDate: string | null | undefined, value: string) {
  const age = ageFromBirthDate(birthDate);

  if (age === null) {
    return false;
  }

  if (value === "Young") {
    return age >= 18 && age <= 25;
  }

  if (value === "Adult") {
    return age >= 26 && age <= 35;
  }

  if (value === "Mature") {
    return age >= 36 && age <= 45;
  }

  if (value === "Senior") {
    return age >= 46;
  }

  return false;
}

function ageFromBirthDate(birthDate: string | null | undefined) {
  if (!birthDate) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);

  if (!match) {
    return null;
  }

  const birthYear = Number(match[1]);
  const birthMonth = Number(match[2]);
  const birthDay = Number(match[3]);
  const today = new Date();
  let age = today.getFullYear() - birthYear;
  const beforeBirthday =
    today.getMonth() + 1 < birthMonth ||
    (today.getMonth() + 1 === birthMonth && today.getDate() < birthDay);

  if (beforeBirthday) {
    age -= 1;
  }

  return Number.isFinite(age) ? age : null;
}

function heightMatchesBucket(heightCm: number | null | undefined, value: string) {
  if (typeof heightCm !== "number" || !Number.isFinite(heightCm)) {
    return false;
  }

  if (value === "Short") {
    return heightCm < 155;
  }

  if (value === "Medium") {
    return heightCm >= 156 && heightCm <= 165;
  }

  if (value === "Tall") {
    return heightCm > 166;
  }

  return false;
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

function catalogFilterSessionKey(kind: CollectionConfig["kind"]) {
  return `catalog:${kind}`;
}

function pageNumbers(pageCount: number) {
  return Array.from({ length: pageCount }, (_, index) => index + 1);
}

type TableColumn = {
  id: string;
  header: string;
  sortLabel?: string;
  sortValue?: string;
  className?: string;
  widthPx: number;
  hiddenHeader?: boolean;
  render: (
    item: CollectionItem,
    config: CollectionConfig,
    onFavoriteToggle?: (key: string, currentFavorite: boolean) => void,
  ) => ReactNode;
};

function tableColumns(kind: CollectionConfig["kind"]): TableColumn[] {
  if (kind === "performers") {
    return [
      {
        id: "status",
        header: "STATUS",
        sortLabel: "Status",
        sortValue: "Status",
        className: "w-32",
        widthPx: 128,
        render: (item) =>
          item.kind === "performers" ? (
            <StatusChip value={formatPerformerStatus(item.status)} tone="performer-status" />
          ) : null,
      },
      {
        id: "thumbnail",
        header: "THUMBNAIL",
        hiddenHeader: true,
        className: "w-24",
        widthPx: 96,
        render: (item, config) => (
          <CatalogTableThumbnail item={item} placeholderLabel={config.placeholderLabel} />
        ),
      },
      {
        id: "favorite",
        header: "FAVORITE",
        hiddenHeader: true,
        className: "w-16",
        widthPx: 64,
        render: (item, _config, onFavoriteToggle) => (
          <CatalogTableFavorite item={item} onFavoriteToggle={onFavoriteToggle} />
        ),
      },
      {
        id: "name",
        header: "NAME",
        sortLabel: "Name",
        sortValue: "Name A-Z",
        className: "w-56",
        widthPx: 224,
        render: (item) => <PrimaryTextCell value={item.kind === "performers" ? item.name : ""} />,
      },
      {
        id: "originalName",
        header: "ORIGINAL NAME",
        sortLabel: "Original Name",
        sortValue: "Original Name",
        className: "w-56",
        widthPx: 224,
        render: (item) => (
          <PlainTableValue value={item.kind === "performers" ? formatTableValue(item.originalName) : tableNA} />
        ),
      },
      {
        id: "categories",
        header: "CATEGORIES",
        sortLabel: "Categories",
        sortValue: "Categories",
        className: "w-60",
        widthPx: 240,
        render: (item) => <CatalogCategoryChips categories={item.categories} />,
      },
      {
        id: "debutYear",
        header: "DEBUT",
        sortLabel: "Debut Year",
        sortValue: "Debut Year",
        className: "w-32",
        widthPx: 128,
        render: (item) => (
          <PlainTableValue value={item.kind === "performers" ? formatYear(item.debutYear) : tableNA} />
        ),
      },
      {
        id: "filmography",
        header: "FILMOGRAPHY",
        sortLabel: "Filmography",
        sortValue: "Filmography",
        className: "w-36",
        widthPx: 144,
        render: (item) => (
          <PlainTableValue
            value={
              item.kind === "performers"
                ? formatCount(item.filmographyCountValue, "video", "videos")
                : tableNA
            }
          />
        ),
      },
      {
        id: "pictorials",
        header: "PICTORIALS",
        sortLabel: "Pictorials",
        sortValue: "Pictorials",
        className: "w-32",
        widthPx: 128,
        render: (item) => (
          <PlainTableValue
            value={
              item.kind === "performers"
                ? formatCount(item.pictorialsCountValue, "set", "sets")
                : tableNA
            }
          />
        ),
      },
      {
        id: "rating",
        header: "RATING",
        sortLabel: "Rating",
        sortValue: "Rating",
        className: "w-28",
        widthPx: 112,
        render: (item) => <RatingChip value={formatRating(item)} />,
      },
    ];
  }

  if (kind === "images") {
    return [
      {
        id: "availability",
        header: "AVAILABILITY",
        sortLabel: "Availability",
        sortValue: "Availability",
        className: "w-36",
        widthPx: 144,
        render: (item) =>
          item.kind === "images" ? (
            <StatusChip value={formatAvailability(item.availability)} tone="availability" />
          ) : null,
      },
      {
        id: "thumbnail",
        header: "THUMBNAIL",
        hiddenHeader: true,
        className: "w-28",
        widthPx: 112,
        render: (item, config) => (
          <CatalogTableThumbnail item={item} placeholderLabel={config.placeholderLabel} />
        ),
      },
      {
        id: "favorite",
        header: "FAVORITE",
        hiddenHeader: true,
        className: "w-16",
        widthPx: 64,
        render: (item, _config, onFavoriteToggle) => (
          <CatalogTableFavorite item={item} onFavoriteToggle={onFavoriteToggle} />
        ),
      },
      {
        id: "title",
        header: "TITLE",
        sortLabel: "Title",
        sortValue: "Title A-Z",
        className: "w-56",
        widthPx: 224,
        render: (item) => <PrimaryTextCell value={item.kind === "images" ? item.title : ""} />,
      },
      {
        id: "originalTitle",
        header: "ORIGINAL TITLE",
        sortLabel: "Original Title",
        sortValue: "Original Title",
        className: "w-56",
        widthPx: 224,
        render: (item) => (
          <PlainTableValue value={item.kind === "images" ? formatTableValue(item.originalTitle) : tableNA} />
        ),
      },
      {
        id: "code",
        header: "CODE",
        sortLabel: "Code",
        sortValue: "Code",
        className: "w-32",
        widthPx: 128,
        render: (item) => (
          <PlainTableValue value={item.kind === "images" ? formatTableValue(item.code) : tableNA} />
        ),
      },
      {
        id: "categories",
        header: "CATEGORIES",
        sortLabel: "Categories",
        sortValue: "Categories",
        className: "w-60",
        widthPx: 240,
        render: (item) => <CatalogCategoryChips categories={item.categories} />,
      },
      {
        id: "year",
        header: "RELEASE",
        sortLabel: "Release Year",
        sortValue: "Release Year",
        className: "w-24",
        widthPx: 96,
        render: (item) => (
          <PlainTableValue value={item.kind === "images" ? formatYear(item.releaseYear) : tableNA} />
        ),
      },
      {
        id: "imageCount",
        header: "TOTAL PICS",
        sortLabel: "Image Count",
        sortValue: "Image Count",
        className: "w-36",
        widthPx: 144,
        render: (item) => (
          <PlainTableValue
            value={
              item.kind === "images"
                ? formatCount(item.imageCountValue, "pic", "pics")
                : tableNA
            }
          />
        ),
      },
      {
        id: "quality",
        header: "QUALITY",
        sortLabel: "Quality",
        sortValue: "Quality",
        className: "w-28",
        widthPx: 112,
        render: (item) => (
          <PlainTableValue value={item.kind === "images" ? formatTableValue(item.quality) : tableNA} />
        ),
      },
      {
        id: "censorship",
        header: "CENSORSHIP",
        sortLabel: "Censorship",
        sortValue: "Censorship",
        className: "w-32",
        widthPx: 128,
        render: (item) =>
          item.kind === "images" ? (
            <StatusChip value={formatCensorship(item.censorship)} tone="censorship" />
          ) : null,
      },
      {
        id: "rating",
        header: "RATING",
        sortLabel: "Rating",
        sortValue: "Rating",
        className: "w-28",
        widthPx: 112,
        render: (item) => <RatingChip value={formatRating(item)} />,
      },
    ];
  }

  return [
    {
      id: "availability",
      header: "AVAILABILITY",
      sortLabel: "Availability",
      sortValue: "Availability",
      className: "w-36",
      widthPx: 144,
      render: (item) =>
        item.kind === "videos" ? (
          <StatusChip value={formatAvailability(item.availability)} tone="availability" />
        ) : null,
    },
    {
      id: "thumbnail",
      header: "THUMBNAIL",
      hiddenHeader: true,
      className: "w-28",
      widthPx: 112,
      render: (item, config) => (
        <CatalogTableThumbnail item={item} placeholderLabel={config.placeholderLabel} />
      ),
    },
    {
      id: "favorite",
      header: "FAVORITE",
      hiddenHeader: true,
      className: "w-16",
      widthPx: 64,
      render: (item, _config, onFavoriteToggle) => (
        <CatalogTableFavorite item={item} onFavoriteToggle={onFavoriteToggle} />
      ),
    },
    {
      id: "title",
      header: "TITLE",
      sortLabel: "Title",
      sortValue: "Title A-Z",
      className: "w-56",
      widthPx: 224,
      render: (item) => <PrimaryTextCell value={item.kind === "videos" ? item.title : ""} />,
    },
    {
      id: "originalTitle",
      header: "ORIGINAL TITLE",
      sortLabel: "Original Title",
      sortValue: "Original Title",
      className: "w-56",
      widthPx: 224,
      render: (item) => (
        <PlainTableValue value={item.kind === "videos" ? formatTableValue(item.originalTitle) : tableNA} />
      ),
    },
    {
      id: "code",
      header: "CODE",
      sortLabel: "Code",
      sortValue: "Code",
      className: "w-32",
      widthPx: 128,
      render: (item) => (
        <PlainTableValue value={item.kind === "videos" ? formatTableValue(item.code) : tableNA} />
      ),
    },
    {
      id: "categories",
      header: "CATEGORIES",
      sortLabel: "Categories",
      sortValue: "Categories",
      className: "w-60",
      widthPx: 240,
      render: (item) => <CatalogCategoryChips categories={item.categories} />,
    },
    {
      id: "year",
      header: "RELEASE",
      sortLabel: "Release Year",
      sortValue: "Release Year",
      className: "w-24",
      widthPx: 96,
      render: (item) => (
        <PlainTableValue value={item.kind === "videos" ? formatYear(item.releaseYear) : tableNA} />
      ),
    },
    {
      id: "duration",
      header: "DURATION",
      sortLabel: "Duration",
      sortValue: "Duration",
      className: "w-28",
      widthPx: 112,
      render: (item) => (
        <PlainTableValue value={item.kind === "videos" ? formatDuration(item) : tableNA} />
      ),
    },
    {
      id: "quality",
      header: "QUALITY",
      sortLabel: "Quality",
      sortValue: "Quality",
      className: "w-28",
      widthPx: 112,
      render: (item) => (
        <PlainTableValue value={item.kind === "videos" ? formatTableValue(item.quality) : tableNA} />
      ),
    },
    {
      id: "censorship",
      header: "CENSORSHIP",
      sortLabel: "Censorship",
      sortValue: "Censorship",
      className: "w-32",
      widthPx: 128,
      render: (item) =>
        item.kind === "videos" ? (
          <StatusChip value={formatCensorship(item.censorship)} tone="censorship" />
        ) : null,
    },
    {
      id: "rating",
      header: "RATING",
      sortLabel: "Rating",
      sortValue: "Rating",
      className: "w-28",
      widthPx: 112,
      render: (item) => <RatingChip value={formatRating(item)} />,
    },
  ];
}

function ariaSortForColumn(column: TableColumn, tableSort: TableSortState) {
  return column.sortValue && tableSort?.value === column.sortValue
    ? tableSort.direction
    : undefined;
}

const tableNA = "N/A";

function catalogTableMinWidth(kind: CollectionConfig["kind"]) {
  if (kind === "performers") {
    return "min-w-[1200px]";
  }

  return "min-w-[1480px]";
}

function tableWidthPx(columns: TableColumn[]) {
  return columns.reduce((total, column) => total + column.widthPx, 0);
}

function formatTableValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value !== 0 ? String(value) : tableNA;
  }

  const trimmed = value?.trim();
  if (!trimmed) {
    return tableNA;
  }

  if (
    trimmed === "-" ||
    trimmed === "0" ||
    trimmed.toLowerCase() === "null" ||
    trimmed.toLowerCase() === "undefined" ||
    trimmed.toLowerCase() === "nan" ||
    trimmed.toLowerCase() === "not set" ||
    trimmed.toLowerCase() === "unspecified" ||
    trimmed.toLowerCase() === "no code" ||
    trimmed.toLowerCase() === "no quality"
  ) {
    return tableNA;
  }

  return trimmed === "Unknow" ? "Unknown" : trimmed;
}

function formatYear(year: number | null | undefined) {
  return typeof year === "number" && Number.isInteger(year) && year > 0
    ? String(year)
    : tableNA;
}

function formatCount(
  count: number | null | undefined,
  singular: string,
  plural: string,
) {
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) {
    return tableNA;
  }

  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function formatDuration(item: CollectionItem) {
  if (item.kind !== "videos") {
    return tableNA;
  }

  const minutes = item.durationMinutes;
  if (typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0 && remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }

    if (hours > 0) {
      return `${hours}h`;
    }

    return `${minutes} min`;
  }

  return formatTableValue(item.duration);
}

function formatRating(item: CollectionItem) {
  const value = item.ratingAverage;
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5
    ? value.toFixed(1)
    : "-";
}

function normalizeUnknown(value: string | null | undefined) {
  const formatted = formatTableValue(value);
  if (formatted === tableNA) {
    return tableNA;
  }

  return formatted.toLowerCase() === "unknow" ? "Unknown" : formatted;
}

function formatAvailability(value: string | null | undefined) {
  const formatted = normalizeUnknown(value);
  if (formatted === tableNA) {
    return tableNA;
  }

  const normalized = formatted.toLowerCase();
  if (normalized === "owned") {
    return "Owned";
  }
  if (normalized === "not owned" || normalized === "notowned") {
    return "Not Owned";
  }
  if (normalized === "missing") {
    return "Missing";
  }

  return formatted;
}

function formatCensorship(value: string | null | undefined) {
  const formatted = normalizeUnknown(value);
  if (formatted === tableNA) {
    return tableNA;
  }

  const normalized = formatted.toLowerCase();
  if (normalized === "censored") {
    return "Censored";
  }
  if (normalized === "uncensored") {
    return "Uncensored";
  }
  if (normalized === "leaked") {
    return "Leaked";
  }
  if (normalized === "unknown" || normalized === "reduced") {
    return "Unknown";
  }

  return formatted;
}

function formatPerformerStatus(value: string | null | undefined) {
  const formatted = normalizeUnknown(value);
  if (formatted === tableNA) {
    return tableNA;
  }

  const normalized = formatted.toLowerCase();
  if (normalized === "active") {
    return "Active";
  }
  if (normalized === "retired") {
    return "Retired";
  }
  if (normalized === "unknown") {
    return "Unknown";
  }

  return formatted;
}

function PrimaryTextCell({ value }: { value: string | null | undefined }) {
  const formatted = formatTableValue(value);
  return (
    <span
      className="block min-w-0 max-w-full truncate whitespace-nowrap font-semibold text-slate-950"
      title={formatted}
      data-testid="catalog-table-primary-text"
    >
      {formatted}
    </span>
  );
}

function PlainTableValue({ value }: { value: string }) {
  const t = useTranslation();
  const translatedValue = translateUiDisplayValue(t, value);
  return (
    <span className="block min-w-0 max-w-full truncate whitespace-nowrap" title={translatedValue}>
      {translatedValue}
    </span>
  );
}

function CatalogCategoryChips({ categories }: { categories: string[] }) {
  const cleanCategories = categories
    .map((category) => category.trim())
    .filter(Boolean);

  if (cleanCategories.length === 0) {
    return <PlainTableValue value={tableNA} />;
  }

  const visibleCategories = cleanCategories.slice(0, 2);
  const hiddenCount = cleanCategories.length - visibleCategories.length;

  return (
    <div
      className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden"
      title={cleanCategories.join(", ")}
      data-testid="catalog-table-category-chips"
    >
      {visibleCategories.map((category) => (
        <span
          key={category}
          className="inline-flex min-w-0 max-w-[7rem] shrink items-center overflow-hidden rounded-md border border-sakura-100 bg-sakura-50 px-2 py-1 text-xs font-semibold text-sakura-700"
        >
          <span className="min-w-0 truncate whitespace-nowrap">{category}</span>
        </span>
      ))}
      {hiddenCount > 0 && (
        <span
          className="inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600"
          aria-label={`${hiddenCount} more categories`}
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}

function StatusChip({
  value,
  tone,
}: {
  value: string;
  tone: "availability" | "censorship" | "performer-status";
}) {
  const t = useTranslation();
  const translatedValue = translateUiDisplayLabel(t, value);
  const className = [
    "inline-flex w-fit max-w-full items-center overflow-hidden rounded-md border px-2.5 py-1 text-xs font-semibold",
    tableChipToneClassName(value, tone),
  ].join(" ");

  return (
    <span className={className} title={translatedValue} data-testid="catalog-table-status-chip">
      <span className="truncate">{translatedValue}</span>
    </span>
  );
}

function collectionColumnHeader(t: UiTranslator, column: TableColumn) {
  const keys: Record<string, string> = {
    availability: "catalog.table.header.availability",
    title: "catalog.table.header.title",
    originalTitle: "catalog.table.header.originalTitle",
    code: "catalog.table.header.code",
    categories: "catalog.table.header.categories",
    year: "catalog.table.header.release",
    duration: "catalog.table.header.duration",
    imageCount: "catalog.table.header.totalPics",
    quality: "catalog.table.header.quality",
    censorship: "catalog.table.header.censorship",
    rating: "catalog.table.header.rating",
    name: "catalog.table.header.name",
    status: "catalog.table.header.availability",
    originalName: "catalog.table.header.originalName",
    debutYear: "catalog.table.header.debut",
    filmography: "catalog.table.header.filmography",
    pictorials: "catalog.table.header.pictorials",
  };
  return keys[column.id] ? t(keys[column.id]) : translateUiDisplayLabel(t, column.sortLabel ?? column.header);
}

function RatingChip({ value }: { value: string }) {
  return (
    <span
      className="inline-flex w-fit max-w-full items-center overflow-hidden rounded-md border border-sakura-200 bg-sakura-50 px-2.5 py-1 text-xs font-semibold text-sakura-700"
      title={value}
      data-testid="catalog-table-rating-chip"
    >
      {value}
    </span>
  );
}

function tableChipToneClassName(
  value: string,
  tone: "availability" | "censorship" | "performer-status",
) {
  if (value === tableNA) {
    return "border-slate-200 bg-slate-50 text-slate-500";
  }

  if (tone === "availability") {
    if (value === "Owned") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    if (value === "Not Owned") {
      return "border-rose-200 bg-rose-50 text-rose-700";
    }
    if (value === "Missing") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }
  }

  if (tone === "performer-status") {
    if (value === "Active") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    if (value === "Retired") {
      return "border-slate-200 bg-slate-50 text-slate-600";
    }
    if (value === "Unknown") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }
  }

  if (value === "Unknown") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function CatalogTableThumbnail({
  item,
  placeholderLabel,
}: {
  item: CollectionItem;
  placeholderLabel: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const assetSrc = localImagePathToAssetSrc(item.coverPath);
  const showImage = Boolean(assetSrc && !imageFailed);
  const isPerformer = item.kind === "performers";
  const Icon = item.kind === "videos" ? Video : item.kind === "images" ? ImageIcon : UserRound;

  useEffect(() => {
    setImageFailed(false);
  }, [assetSrc]);

  return (
    <div
      className={[
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sakura-50 text-sakura-500",
        isPerformer ? "h-14 w-11" : "h-12 w-20",
      ].join(" ")}
      data-testid={`${item.kind}-catalog-table-thumbnail`}
      data-thumbnail-shape={isPerformer ? "portrait" : "16:9"}
      role={showImage ? undefined : "img"}
      aria-label={showImage ? undefined : placeholderLabel}
    >
      {showImage ? (
        <img
          src={assetSrc ?? undefined}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Icon size={18} aria-hidden="true" />
      )}
    </div>
  );
}

function CatalogTableFavorite({
  item,
  onFavoriteToggle,
}: {
  item: CollectionItem;
  onFavoriteToggle?: (key: string, currentFavorite: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-label={item.favorite ? "Remove from Favorites" : "Add to Favorites"}
      title={item.favorite ? "Favorite" : "Not favorite"}
      className={[
        "inline-flex size-9 items-center justify-center rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-sakura-200",
        item.favorite
          ? "border-sakura-200 bg-sakura-50 text-sakura-600"
          : "border-slate-200 bg-white text-slate-400 hover:border-sakura-200 hover:text-sakura-500",
      ].join(" ")}
      data-testid="catalog-table-favorite-button"
      onClick={(event) => {
        event.stopPropagation();
        onFavoriteToggle?.(item.key, item.favorite);
      }}
    >
      <Star size={16} fill={item.favorite ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}

export default CollectionPage;
