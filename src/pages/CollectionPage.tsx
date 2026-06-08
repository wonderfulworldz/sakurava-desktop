import {
  ChevronDown,
  Filter,
  Grid2X2,
  List,
  Plus,
  Search,
  X,
} from "lucide-react";
import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
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
type DropdownState = {
  openDropdownKey: string | null;
  onOpenDropdownChange: (key: string | null) => void;
};

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
            <CollectionTable
              config={config}
              items={pageItems}
              sortValue={sortValue}
              onSortChange={(value) => {
                setSortValue(value);
                resetToFirstPage();
              }}
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
  const activeFilterCount =
    (trimmedSearch ? 1 : 0) +
    activeCategoryFilters.length +
    activeDataFilters.length;
  const hasActiveFilters = activeFilterCount > 0;
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

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openDropdownKey]);

  return (
    <section ref={toolbarRef} className="rounded-lg border border-slate-200 bg-white p-3" aria-label={`${title} catalog toolbar`}>
      <div className="grid grid-cols-[minmax(9rem,1fr)_auto_minmax(8rem,12rem)_auto] items-center gap-2 sm:gap-3">
        <label className="relative block min-w-0">
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
            "inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition sm:px-4",
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
        >
          <Filter size={18} />
          <span className="hidden sm:inline">Filters</span>
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

        <SortPicker
          dropdownKey={`${config.kind}.sort`}
          options={config.sortOptions}
          value={sortValue}
          onChange={onSortChange}
          dropdownState={dropdownState}
        />

        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-sakura-200 hover:text-sakura-600 md:justify-self-end xl:justify-self-auto"
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
          categorySelectDisabled={categorySelectDisabled}
          dataFilters={dataFilters}
          onAddCategoryFilter={onAddCategoryFilter}
          onDataFilterChange={onDataFilterChange}
          dropdownState={dropdownState}
        />
      )}

      {hasActiveFilters && (
        <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
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
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-sakura-500 transition hover:bg-white hover:text-sakura-700 focus:outline-none focus:ring-2 focus:ring-sakura-200"
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
  const [query, setQuery] = useState("");
  const open = dropdownState.openDropdownKey === dropdownKey;
  const visibleOptions = options.filter((option) =>
    normalizedFilterValue(option).includes(normalizedFilterValue(query)),
  );
  const inputValue = open ? query : value;

  function openPicker() {
    dropdownState.onOpenDropdownChange(dropdownKey);
    setQuery("");
  }

  function selectOption(option: string) {
    onChange(option);
    dropdownState.onOpenDropdownChange(null);
    setQuery("");
  }

  return (
    <div className="relative min-w-0">
      <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition focus-within:border-sakura-300 focus-within:ring-4 focus-within:ring-sakura-100">
        <span className="hidden shrink-0 text-xs font-semibold text-slate-500 sm:inline">
          Sort
        </span>
        <input
          aria-label="Sort"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400"
          value={inputValue}
          placeholder="Sort"
          onFocus={openPicker}
          onChange={(event) => {
            const nextQuery = event.target.value;
            dropdownState.onOpenDropdownChange(dropdownKey);
            setQuery(nextQuery);
            const exactOption = options.find(
              (option) => normalizedFilterValue(option) === normalizedFilterValue(nextQuery),
            );
            if (exactOption) {
              selectOption(exactOption);
            }
          }}
        />
        <button
          type="button"
          aria-label="Open Sort options"
          className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-sakura-50 hover:text-sakura-600"
          onClick={() => {
            dropdownState.onOpenDropdownChange(open ? null : dropdownKey);
            setQuery("");
          }}
        >
          <ChevronDown size={16} className={open ? "rotate-180 transition" : "transition"} />
        </button>
      </label>
      {open && (
        <div className="absolute z-50 mt-2 w-full min-w-44 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div role="listbox" aria-label="Sort options" className="max-h-64 overflow-y-auto p-1">
            {visibleOptions.map((option) => (
              <PickerOption
                key={option}
                label={option}
                selected={normalizedFilterValue(option) === normalizedFilterValue(value)}
                onSelect={() => selectOption(option)}
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
    </div>
  );
}

function CollectionFilterPanel({
  config,
  categoryOptions,
  categorySelectDisabled,
  dataFilters,
  onAddCategoryFilter,
  onDataFilterChange,
  dropdownState,
}: {
  config: CollectionConfig;
  categoryOptions: string[];
  categorySelectDisabled: boolean;
  dataFilters: DataFilterValues;
  onAddCategoryFilter: (value: string) => void;
  onDataFilterChange: (filterId: string, value: string) => void;
  dropdownState: DropdownState;
}) {
  const title = useLanguage().t(`collection.title.${config.kind}`);

  return (
    <div
      id={`${config.kind}-filter-panel`}
      role="region"
      aria-label={`${title} filters`}
      className="mt-3 overflow-visible rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <div className="grid md:grid-cols-2">
        {filterPanelCells(config, categoryOptions, categorySelectDisabled, dataFilters, onAddCategoryFilter, onDataFilterChange, dropdownState)}
      </div>
    </div>
  );
}

function filterPanelCells(
  config: CollectionConfig,
  categoryOptions: string[],
  categorySelectDisabled: boolean,
  dataFilters: DataFilterValues,
  onAddCategoryFilter: (value: string) => void,
  onDataFilterChange: (filterId: string, value: string) => void,
  dropdownState: DropdownState,
) {
  if (config.kind === "images") {
    return imageFilterPanelCells(config, categoryOptions, categorySelectDisabled, dataFilters, onAddCategoryFilter, onDataFilterChange, dropdownState);
  }

  if (config.kind === "performers") {
    return performerFilterPanelCells(config, categoryOptions, categorySelectDisabled, dataFilters, onAddCategoryFilter, onDataFilterChange, dropdownState);
  }

  return videoFilterPanelCells(config, categoryOptions, categorySelectDisabled, dataFilters, onAddCategoryFilter, onDataFilterChange, dropdownState);
}

function videoFilterPanelCells(
  config: CollectionConfig,
  categoryOptions: string[],
  categorySelectDisabled: boolean,
  dataFilters: DataFilterValues,
  onAddCategoryFilter: (value: string) => void,
  onDataFilterChange: (filterId: string, value: string) => void,
  dropdownState: DropdownState,
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
      label="Availability"
      options={["Owned", "Not Owned", "Missing"]}
        value={dataFilters.availability}
        onChange={onDataFilterChange}
        onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
      />,
    <SegmentedFilterCell
      key="censorship"
      kind={config.kind}
      filterId="censorship"
      label="Censorship"
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
        label="Release Years"
        allLabel="All release years"
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
        label="Publisher / Label"
        allLabel="All publishers"
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
      label="Quality"
      allLabel="All quality"
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
      label="Duration"
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
      label="Availability"
      options={["Owned", "Not Owned", "Missing"]}
        value={dataFilters.availability}
        onChange={onDataFilterChange}
        onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
      />,
    <SegmentedFilterCell
      key="censorship"
      kind={config.kind}
      filterId="censorship"
      label="Censorship"
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
        label="Release Years"
        allLabel="All release years"
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
        label="Publisher / Label"
        allLabel="All publishers"
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
      label="Quality"
      allLabel="All quality"
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
      label="Image Count"
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
  categorySelectDisabled: boolean,
  dataFilters: DataFilterValues,
  onAddCategoryFilter: (value: string) => void,
  onDataFilterChange: (filterId: string, value: string) => void,
  dropdownState: DropdownState,
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
      label="Status"
      options={["Active", "Retired", "Unknown"]}
      value={dataFilters.status}
      onChange={onDataFilterChange}
      onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
    />,
    cupSizeOptions.length > 0 ? (
      <PickerFilterCell
        key="cupSize"
        kind={config.kind}
        filterId="cupSize"
        label="Cup Size"
        allLabel="All cup sizes"
        options={cupSizeOptions}
        value={dataFilters.cupSize}
        onChange={onDataFilterChange}
        dropdownKey={`${config.kind}.cupSize`}
        dropdownState={dropdownState}
      />
    ) : null,
    <DeferredFilterCell key="gender" label="Gender" />,
    hasHeights ? (
      <SegmentedFilterCell
        key="height"
        kind={config.kind}
        filterId="height"
        label="Body Height"
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
        label="Age"
        options={["Young", "Adult", "Mature", "Senior"]}
        value={dataFilters.age}
        onChange={onDataFilterChange}
        onCloseDropdowns={() => dropdownState.onOpenDropdownChange(null)}
      />
    ) : null,
    <DeferredFilterCell key="bodyType" label="Body Type" />,
    nationalityOptions.length > 0 ? (
      <PickerFilterCell
        key="nationality"
        kind={config.kind}
        filterId="nationality"
        label="Nationality"
        allLabel="All nationalities"
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
        label="Debut Years"
        allLabel="All debut years"
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
      label="Filmography Count"
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
      label="Pictorials Count"
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

          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              aria-label={`${label}: ${option}`}
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
              <span className="block truncate" title={option}>{option}</span>
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
}) {
  const [query, setQuery] = useState("");
  const open = dropdownState.openDropdownKey === dropdownKey;
  const currentValue = value ?? allLabel;
  const inputValue = open ? query : currentValue;
  const visibleOptions = options.filter((option) =>
    normalizedFilterValue(option).includes(normalizedFilterValue(query)),
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
      <PanelLabel>{label}</PanelLabel>
      <label className="mt-3 flex h-11 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-slate-700 transition focus-within:border-sakura-300 focus-within:ring-4 focus-within:ring-sakura-100">
        <Search size={16} className="shrink-0 text-slate-400" />
        <input
          id={`${kind}-${filterId}-panel-filter`}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
          placeholder={pickerPlaceholder(label)}
          value={inputValue}
          onFocus={openPicker}
          onChange={(event) => {
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
          className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-sakura-50 hover:text-sakura-600"
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
          id={`${kind}-${filterId}-panel-popup`}
          className="absolute z-50 mt-2 w-full rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div role="listbox" aria-label={`${label} options`} className="max-h-56 overflow-y-auto p-1">
            <PickerOption
              label={allLabel}
              selected={isAllFilterValue(filterId, value)}
                onSelect={() => {
                  onChange(filterId, allLabel);
                  closePicker();
              }}
            />
            {visibleOptions.map((option) => (
              <PickerOption
                key={option}
                label={option}
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
      <PanelLabel>Category</PanelLabel>
      <label className="mt-3 flex h-11 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-slate-700 transition focus-within:border-sakura-300 focus-within:ring-4 focus-within:ring-sakura-100">
        <Search size={16} className="shrink-0 text-slate-400" />
        <input
          id={`${kind}-category-panel-filter`}
          aria-label="Category"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400 disabled:text-slate-400"
          placeholder="Add category filter"
          value={open ? query : "Add category filter"}
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
          aria-label="Open Category options"
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
          <div role="listbox" aria-label="Category options" className="max-h-56 overflow-y-auto p-1">
            {visibleOptions.map((category) => (
              <PickerOption
              key={category}
              label={category}
              selected={false}
              onSelect={() => {
                onAddCategoryFilter(category);
                closePicker();
              }}
            />
            ))}
            {visibleOptions.length === 0 && (
              <p className="px-3 py-2 text-xs font-semibold text-slate-500">
                No matching categories
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
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
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
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={selected ? "text-sakura-600" : "text-slate-400"}>+</span>
    </button>
  );
}

function DeferredFilterCell({ label }: { label: string }) {
  return (
    <>
      <PanelLabel>{label}</PanelLabel>
      <div className="mt-3 flex h-11 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">
        Deferred
      </div>
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
  const currentRating = numberFromDisplayText(value ?? "") ?? 1;
  const isActive = !isAllFilterValue("rating", value);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PanelLabel>Rating</PanelLabel>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-sakura-50 hover:text-sakura-600"
          onFocus={onCloseDropdowns}
          onClick={() => {
            onCloseDropdowns?.();
            onChange("rating", "All ratings");
          }}
        >
          All
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
          {isActive ? `${currentRating}+` : "Any"}
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
      { id: "status", label: "Status", options: ["All status", "Active", "Retired", "Unknown"] },
      { id: "age", label: "Age", options: ["All age", "Young", "Adult", "Mature", "Senior"] },
      { id: "height", label: "Body Height", options: ["All height", "Short", "Medium", "Tall"] },
      { id: "nationality", label: "Nationality", options: ["All nationalities"] },
      { id: "cupSize", label: "Cup Size", options: ["All cup sizes"] },
      { id: "rating", label: "Rating", options: ratingFilterOptions() },
      { id: "debutYear", label: "Debut Years", options: yearFilterOptions("All debut years") },
      { id: "filmography", label: "Filmography Count", options: countFilterOptions("All filmography") },
      { id: "pictorials", label: "Pictorials Count", options: countFilterOptions("All pictorials") },
    ];
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
    ];
  }

  return [
    { id: "availability", label: "Availability", options: ["All availability", "Owned", "Not Owned", "Missing"] },
    { id: "censorship", label: "Censorship", options: ["All censorship", "Uncensored", "Censored", "Reduced", "Leaked"] },
    { id: "publisherLabel", label: "Publisher / Label", options: ["All publishers"] },
    { id: "quality", label: "Quality", options: qualityFilterOptions() },
    { id: "rating", label: "Rating", options: ratingFilterOptions() },
    { id: "year", label: "Release Years", options: yearFilterOptions("All release years") },
    { id: "duration", label: "Duration", options: ["All durations", "Short", "Medium", "Long"] },
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
  onSortChange,
}: {
  config: CollectionConfig;
  items: CollectionItem[];
  sortValue: string;
  onSortChange: (value: string) => void;
}) {
  const columns = tableColumns(config.kind);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  aria-sort={ariaSortForColumn(column, sortValue)}
                  className={["px-4 py-3", column.className ?? ""].join(" ")}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      aria-label={`Sort by ${column.header}`}
                      title={`Sort by ${column.header}`}
                      className={[
                        "inline-flex max-w-full items-center gap-1 rounded-md text-left font-semibold transition hover:text-sakura-600 focus:outline-none focus:ring-2 focus:ring-sakura-200",
                        sortValue === column.sortValue ? "text-sakura-600" : "",
                      ].join(" ")}
                      onClick={() => onSortChange(column.sortValue!)}
                    >
                      <span className="truncate">{column.header}</span>
                      {sortValue === column.sortValue && (
                        <span aria-hidden="true" className="text-[10px] text-sakura-500">
                          {sortDirectionLabel(column.sortValue)}
                        </span>
                      )}
                    </button>
                  ) : (
                    <span className="block truncate">{column.header}</span>
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
              />
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
  columns,
}: {
  config: CollectionConfig;
  item: CollectionItem;
  columns: TableColumn[];
}) {
  return (
    <tr className="transition hover:bg-sakura-50/60">
      {columns.map((column, index) => (
        <td
          key={`${item.key}-${column.id}`}
          className={["px-4 py-3 text-slate-700", column.className ?? ""].join(" ")}
        >
          <Link
            to={`/${config.kind}/${item.key}`}
            className={[
              "block truncate",
              index === 0
                ? "font-semibold text-slate-950 hover:text-sakura-600"
                : "",
            ].join(" ")}
            title={column.value(item)}
          >
            {column.value(item)}
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
      aria-label="Collection pagination"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <p className="text-sm font-semibold text-slate-600">
          Showing {startItem}-{endItem} of {totalItems}
        </p>
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
        item.nationality,
        item.cupSize,
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
    item.publisherLabel,
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

function catalogPageSizeStorageKey(kind: CollectionConfig["kind"]) {
  return `sakurava.catalog.${kind}.pageSize.v1`;
}

function pageNumbers(pageCount: number) {
  return Array.from({ length: pageCount }, (_, index) => index + 1);
}

type TableColumn = {
  id: string;
  header: string;
  sortValue?: string;
  className?: string;
  value: (item: CollectionItem) => string;
};

function tableColumns(kind: CollectionConfig["kind"]): TableColumn[] {
  if (kind === "performers") {
    return [
      {
        id: "name",
        header: "Name",
        sortValue: "Name A-Z",
        className: "w-56",
        value: (item) => item.kind === "performers" ? item.name : "",
      },
      {
        id: "categories",
        header: "Categories",
        className: "w-52",
        value: (item) => categorySummary(item.categories),
      },
      {
        id: "status",
        header: "Status",
        sortValue: "Status",
        className: "w-32",
        value: (item) => item.kind === "performers" ? item.status : "",
      },
      {
        id: "rating",
        header: "Rating",
        sortValue: "Rating",
        className: "w-28",
        value: ratingSummary,
      },
      {
        id: "debutYear",
        header: "Debut Year",
        className: "w-32",
        value: (item) => item.kind === "performers" ? yearSummary(item.debutYear) : "",
      },
      {
        id: "filmography",
        header: "Filmography",
        sortValue: "Filmography",
        className: "w-36",
        value: (item) => item.kind === "performers" ? item.filmographyCount : "",
      },
      {
        id: "pictorials",
        header: "Pictorials",
        sortValue: "Pictorials",
        className: "w-32",
        value: (item) => item.kind === "performers" ? item.pictorialsCount : "",
      },
      {
        id: "favorite",
        header: "Favorite",
        className: "w-28",
        value: favoriteSummary,
      },
    ];
  }

  if (kind === "images") {
    return [
      {
        id: "title",
        header: "Title",
        sortValue: "Title A-Z",
        className: "w-64",
        value: (item) => item.kind === "images" ? item.title : "",
      },
      {
        id: "code",
        header: "Code",
        className: "w-32",
        value: (item) => item.kind === "images" ? fallbackText(item.code) : "",
      },
      {
        id: "categories",
        header: "Categories",
        className: "w-52",
        value: (item) => categorySummary(item.categories),
      },
      {
        id: "rating",
        header: "Rating",
        sortValue: "Rating",
        className: "w-28",
        value: ratingSummary,
      },
      {
        id: "year",
        header: "Year",
        sortValue: "Release Year",
        className: "w-24",
        value: (item) => item.kind === "images" ? yearSummary(item.releaseYear) : "",
      },
      {
        id: "imageCount",
        header: "Image Count",
        sortValue: "Image Count",
        className: "w-36",
        value: (item) => item.kind === "images" ? item.imageCount : "",
      },
      {
        id: "quality",
        header: "Quality",
        className: "w-28",
        value: (item) => item.kind === "images" ? fallbackText(item.quality) : "",
      },
      {
        id: "favorite",
        header: "Favorite",
        className: "w-28",
        value: favoriteSummary,
      },
    ];
  }

  return [
    {
      id: "title",
      header: "Title",
      sortValue: "Title A-Z",
      className: "w-64",
      value: (item) => item.kind === "videos" ? item.title : "",
    },
    {
      id: "code",
      header: "Code",
      className: "w-32",
      value: (item) => item.kind === "videos" ? fallbackText(item.code) : "",
    },
    {
      id: "categories",
      header: "Categories",
      className: "w-52",
      value: (item) => categorySummary(item.categories),
    },
    {
      id: "rating",
      header: "Rating",
      sortValue: "Rating",
      className: "w-28",
      value: ratingSummary,
    },
    {
      id: "year",
      header: "Year",
      sortValue: "Release Year",
      className: "w-24",
      value: (item) => item.kind === "videos" ? yearSummary(item.releaseYear) : "",
    },
    {
      id: "duration",
      header: "Duration",
      sortValue: "Duration",
      className: "w-28",
      value: (item) => item.kind === "videos" ? fallbackText(item.duration) : "",
    },
    {
      id: "quality",
      header: "Quality",
      className: "w-28",
      value: (item) => item.kind === "videos" ? fallbackText(item.quality) : "",
    },
    {
      id: "favorite",
      header: "Favorite",
      className: "w-28",
      value: favoriteSummary,
    },
  ];
}

function ariaSortForColumn(column: TableColumn, sortValue: string) {
  return column.sortValue && column.sortValue === sortValue
    ? sortDirectionForValue(column.sortValue)
    : undefined;
}

function sortDirectionForValue(sortValue: string): "ascending" | "descending" {
  return sortValue === "Title A-Z" || sortValue === "Name A-Z" || sortValue === "Status"
    ? "ascending"
    : "descending";
}

function sortDirectionLabel(sortValue: string) {
  return sortDirectionForValue(sortValue) === "ascending" ? "ASC" : "DESC";
}

function categorySummary(categories: string[]) {
  return categories.length > 0 ? categories.join(", ") : "None";
}

function ratingSummary(item: CollectionItem) {
  return typeof item.ratingBucket === "number" ? `${item.ratingBucket} star` : "Unrated";
}

function yearSummary(year: number | null | undefined) {
  return typeof year === "number" && Number.isInteger(year) ? String(year) : "Unknown";
}

function favoriteSummary(item: CollectionItem) {
  return item.favorite ? "Favorite" : "Not favorite";
}

function fallbackText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Unknown";
}

export default CollectionPage;
