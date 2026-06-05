import { Image, Search, Tags, UserRound, Video, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ManagedCategory } from "../backend/types";
import {
  buildCategoryAudit,
  type CategoryAuditRow,
} from "../lib/categoryAudit";
import CategoryCatalogCard, {
  type CategoryCatalogCardData,
  type CategoryCatalogCardStatus,
} from "../components/CategoryCatalogCard";
import { getStoredManagedCategories } from "../lib/managedCategories";
import { listManagedCategories } from "../runtime/managedCategoryCommands";
import { listImages } from "../runtime/imageCommands";
import { listPerformers } from "../runtime/performerCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";
import { listVideos } from "../runtime/videoCommands";

type CategoryStatus = CategoryCatalogCardStatus;
type SortValue = "name" | "usage-desc" | "usage-asc" | "updated-desc" | "created-desc";
type UsageFilter = "all" | "videos" | "images" | "performers";

type CategoryBrowseRow = CategoryAuditRow & CategoryCatalogCardData & {
  status: CategoryStatus;
  isManaged: boolean;
  key: string;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
};

const emptyAudit = buildCategoryAudit({
  videos: [],
  images: [],
  performers: [],
});

function CategoriesPage() {
  const [auditRows, setAuditRows] = useState<CategoryAuditRow[]>([]);
  const [managedCategories, setManagedCategories] = useState<ManagedCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [sortValue, setSortValue] = useState<SortValue>("name");
  const [pageSize, setPageSize] = useState("24");
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const isDesktopRuntime = isTauriRuntimeAvailable();

  useEffect(() => {
    if (!isDesktopRuntime) {
      setManagedCategories(legacyManagedCategories());
    }
  }, [isDesktopRuntime]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, usageFilter, sortValue, pageSize]);

  useEffect(() => {
    let cancelled = false;

    if (!isDesktopRuntime) {
      setAuditRows(emptyAudit.rows);
      setLoadState("idle");
      return;
    }

    setLoadState("loading");

    Promise.all([listVideos(), listImages(), listPerformers(), listManagedCategories()])
      .then(([videos, images, performers, categories]) => {
        if (!cancelled) {
          setAuditRows(buildCategoryAudit({ videos, images, performers }).rows);
          setManagedCategories(categories);
          setLoadState("idle");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuditRows(emptyAudit.rows);
          setManagedCategories(legacyManagedCategories());
          setLoadState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isDesktopRuntime]);

  const categories = useMemo(
    () => mergeCategoryRows(auditRows, managedCategories),
    [auditRows, managedCategories],
  );
  const visibleCategories = useMemo(
    () =>
      sortCategoryRows(
        filterCategoryRows(categories, searchQuery, usageFilter),
        sortValue,
      ),
    [categories, searchQuery, usageFilter, sortValue],
  );
  const numericPageSize = Number(pageSize);
  const pageCount = Math.max(1, Math.ceil(visibleCategories.length / numericPageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = (currentPage - 1) * numericPageSize;
  const pageCategories = visibleCategories.slice(startIndex, startIndex + numericPageSize);
  const videoCategoryCount = categories.filter((category) => category.videos > 0).length;
  const imageCategoryCount = categories.filter((category) => category.images > 0).length;
  const performerCategoryCount = categories.filter(
    (category) => category.performers > 0,
  ).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-normal text-slate-950">
            Categories
          </h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500">
            Browse category usage across Videos, Images, and Performers.
          </p>
        </div>
        <Link
          to="/settings/category-management"
          className="inline-flex h-12 w-fit items-center justify-center gap-2 rounded-lg bg-sakura-500 px-6 text-base font-semibold text-white shadow-sm shadow-sakura-200 transition hover:bg-sakura-600"
        >
          <Tags size={20} />
          Manage Category
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total Category" value={categories.length} icon={Tags} />
        <SummaryCard label="Videos Category" value={videoCategoryCount} icon={Video} />
        <SummaryCard label="Images Category" value={imageCategoryCount} icon={Image} />
        <SummaryCard
          label="Performers Category"
          value={performerCategoryCount}
          icon={UserRound}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_220px]">
          <label className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
              placeholder="Search categories..."
              aria-label="Categories search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>

          <label
            className="flex h-11 min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3"
            htmlFor="categories-usage-filter"
          >
            <span className="shrink-0 text-xs font-semibold text-slate-500">
              Filter
            </span>
            <select
              id="categories-usage-filter"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-950 outline-none"
              value={usageFilter}
              onChange={(event) => setUsageFilter(event.target.value as UsageFilter)}
            >
              <option value="all">All</option>
              <option value="videos">Video Only</option>
              <option value="images">Image Only</option>
              <option value="performers">Performer Only</option>
            </select>
          </label>

          <label
            className="flex h-11 min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3"
            htmlFor="categories-sort"
          >
            <span className="shrink-0 text-xs font-semibold text-slate-500">
              Sort
            </span>
            <select
              id="categories-sort"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-950 outline-none"
              value={sortValue}
              onChange={(event) => setSortValue(event.target.value as SortValue)}
            >
              <option value="name">Name A-Z</option>
              <option value="usage-desc">Usage high-low</option>
              <option value="usage-asc">Usage low-high</option>
              <option value="updated-desc">Last Updated</option>
              <option value="created-desc">Last Added</option>
            </select>
          </label>
        </div>
      </section>

      {loadState === "error" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          Category usage could not be loaded. No records were changed.
        </p>
      )}

      {loadState === "loading" ? (
        <CategoryEmptyState message="Loading category usage..." />
      ) : visibleCategories.length > 0 ? (
        <>
          <section className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
            {pageCategories.map((category) => (
              <CategoryCard key={category.key} category={category} />
            ))}
          </section>
          <CategoryPaginationBar
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            totalCount={visibleCategories.length}
            startIndex={startIndex}
            visibleCount={pageCategories.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      ) : (
        <CategoryEmptyState
          message={
            searchQuery.trim() || usageFilter !== "all"
              ? "No categories match the current search and filter."
              : "No categories to browse yet."
          }
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500">
        <Icon size={20} />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
      </div>
    </div>
  );
}

function CategoryCard({ category }: { category: CategoryBrowseRow }) {
  return <CategoryCatalogCard category={category} />;
}

function CategoryEmptyState({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
      <p className="text-base font-semibold text-slate-700">{message}</p>
      <p className="mt-2 text-sm text-slate-500">
        Record Categories come from saved catalog labels. Managed Categories can
        be reviewed in Category Management.
      </p>
    </section>
  );
}

function CategoryPaginationBar({
  page,
  pageCount,
  pageSize,
  totalCount,
  startIndex,
  visibleCount,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: string;
  totalCount: number;
  startIndex: number;
  visibleCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: string) => void;
}) {
  const firstVisible = totalCount === 0 ? 0 : startIndex + 1;
  const lastVisible = startIndex + visibleCount;

  return (
    <nav
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Categories pagination"
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold text-slate-500">
          Showing {firstVisible}-{lastVisible} of {totalCount} categories
        </p>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          Per page
          <select
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
            value={pageSize}
            onChange={(event) => onPageSizeChange(event.target.value)}
            aria-label="Categories per page"
          >
            {["12", "24", "48"].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-500 disabled:opacity-50"
          disabled={page === 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </button>
        <span className="text-sm font-semibold text-slate-500">
          Page {page} of {pageCount}
        </span>
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

function mergeCategoryRows(
  auditRows: CategoryAuditRow[],
  managedCategories: ManagedCategory[],
): CategoryBrowseRow[] {
  const rowsByKey = new Map<string, CategoryBrowseRow>();
  const auditRowsByKey = new Map(
    auditRows.map((row) => [row.name.trim().toLowerCase(), row]),
  );

  const parentNameByKey = new Map(
    managedCategories.map((category) => [category.key, category.name]),
  );
  const childCountByKey = new Map<string, number>();
  for (const category of managedCategories) {
    if (!category.parentKey) {
      continue;
    }
    childCountByKey.set(
      category.parentKey,
      (childCountByKey.get(category.parentKey) ?? 0) + 1,
    );
  }

  for (const category of managedCategories) {
    const name = category.name.trim();
    const key = name.toLowerCase();

    if (!name || rowsByKey.has(key)) {
      continue;
    }

    const auditRow = auditRowsByKey.get(key);
    rowsByKey.set(key, {
      name,
      videos: auditRow?.videos ?? 0,
      images: auditRow?.images ?? 0,
      performers: auditRow?.performers ?? 0,
      total: auditRow?.total ?? 0,
      key: category.key,
      parentName: category.parentKey
        ? parentNameByKey.get(category.parentKey) ?? null
        : null,
      childCount: childCountByKey.get(category.key) ?? 0,
      description: category.description.trim(),
      thumbnailPath: category.thumbnailPath.trim(),
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      isManaged: true,
      status: auditRow && auditRow.total > 0 ? "Managed" : "Unused Managed",
    });
  }

  return [...rowsByKey.values()];
}

function filterCategoryRows(
  categories: CategoryBrowseRow[],
  searchQuery: string,
  usageFilter: UsageFilter,
) {
  const query = searchQuery.trim().toLowerCase();

  return categories.filter((category) => {
    if (usageFilter === "videos" && category.videos <= 0) {
      return false;
    }

    if (usageFilter === "images" && category.images <= 0) {
      return false;
    }

    if (usageFilter === "performers" && category.performers <= 0) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      category.name,
      category.parentName ?? "",
      category.description,
    ].some((value) => value.toLowerCase().includes(query));
  });
}

function sortCategoryRows(categories: CategoryBrowseRow[], sortValue: SortValue) {
  return [...categories].sort((left, right) => {
    if (sortValue === "usage-desc") {
      return right.total - left.total || left.name.localeCompare(right.name);
    }

    if (sortValue === "usage-asc") {
      return left.total - right.total || left.name.localeCompare(right.name);
    }

    if (sortValue === "updated-desc") {
      return (
        timestamp(right.updatedAt) - timestamp(left.updatedAt) ||
        left.name.localeCompare(right.name)
      );
    }

    if (sortValue === "created-desc") {
      return (
        timestamp(right.createdAt) - timestamp(left.createdAt) ||
        left.name.localeCompare(right.name)
      );
    }

    return left.name.localeCompare(right.name);
  });
}

function legacyManagedCategories(): ManagedCategory[] {
  const timestampValue = "0";
  return getStoredManagedCategories().map((name, index) => ({
    key: `legacy-category-${index}`,
    name,
    parentKey: null,
    description: "",
    thumbnailPath: "",
    createdAt: timestampValue,
    updatedAt: timestampValue,
  }));
}

function timestamp(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const numericTime = Number(trimmed);
  if (/^\d+$/.test(trimmed) && Number.isFinite(numericTime)) {
    return numericTime;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default CategoriesPage;
