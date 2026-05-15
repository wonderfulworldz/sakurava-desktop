import { Search, Tags } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildCategoryAudit,
  type CategoryAuditRow,
} from "../lib/categoryAudit";
import { getStoredManagedCategories } from "../lib/managedCategories";
import { listImages } from "../runtime/imageCommands";
import { listPerformers } from "../runtime/performerCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";
import { listVideos } from "../runtime/videoCommands";

type CategoryStatus = "Managed" | "Record-only" | "Unused Managed";
type SortValue = "name" | "usage-desc" | "usage-asc";

type CategoryBrowseRow = CategoryAuditRow & {
  status: CategoryStatus;
  isManaged: boolean;
};

const emptyAudit = buildCategoryAudit({
  videos: [],
  images: [],
  performers: [],
});

function CategoriesPage() {
  const [auditRows, setAuditRows] = useState<CategoryAuditRow[]>([]);
  const [managedCategories, setManagedCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortValue, setSortValue] = useState<SortValue>("name");
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const isDesktopRuntime = isTauriRuntimeAvailable();

  useEffect(() => {
    setManagedCategories(getStoredManagedCategories());
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!isDesktopRuntime) {
      setAuditRows(emptyAudit.rows);
      setLoadState("idle");
      return;
    }

    setLoadState("loading");

    Promise.all([listVideos(), listImages(), listPerformers()])
      .then(([videos, images, performers]) => {
        if (!cancelled) {
          setAuditRows(buildCategoryAudit({ videos, images, performers }).rows);
          setLoadState("idle");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuditRows(emptyAudit.rows);
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
    () => sortCategoryRows(filterCategoryRows(categories, searchQuery), sortValue),
    [categories, searchQuery, sortValue],
  );
  const usedCategories = categories.filter((category) => category.total > 0);
  const managedCount = categories.filter((category) => category.isManaged).length;
  const recordOnlyCount = categories.filter(
    (category) => category.status === "Record-only",
  ).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-sakura-500">
            Catalog Browse
          </p>
          <h1 className="text-4xl font-semibold tracking-normal text-slate-950">
            Categories
          </h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500">
            Browse category usage across Videos, Images, and Performers. Manage
            category names and record maintenance from Category Management.
          </p>
        </div>
        <Link
          to="/settings/category-management"
          className="inline-flex h-11 w-fit items-center justify-center rounded-lg border border-sakura-200 bg-white px-4 text-sm font-semibold text-sakura-600 shadow-sm transition hover:bg-sakura-50"
        >
          Open Category Management
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total Categories" value={categories.length} />
        <SummaryCard label="Used Categories" value={usedCategories.length} />
        <SummaryCard label="Managed Categories" value={managedCount} />
        <SummaryCard label="Record-only Categories" value={recordOnlyCount} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px]">
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
        <section className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
          {visibleCategories.map((category) => (
            <CategoryCard key={category.name.toLowerCase()} category={category} />
          ))}
        </section>
      ) : (
        <CategoryEmptyState
          message={
            searchQuery.trim()
              ? "No categories match the current search."
              : "No categories to browse yet."
          }
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function CategoryCard({ category }: { category: CategoryBrowseRow }) {
  return (
    <article
      aria-label={`Category ${category.name}`}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500">
              <Tags size={18} />
            </span>
            <h2 className="truncate text-lg font-semibold tracking-normal text-slate-950">
              {category.name}
            </h2>
          </div>
          <StatusBadge status={category.status} />
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            Total
          </p>
          <p className="text-2xl font-semibold text-slate-950">
            {category.total}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
        <CountBlock label="Videos" value={category.videos} />
        <CountBlock label="Images" value={category.images} />
        <CountBlock label="Performers" value={category.performers} />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {category.videos > 0 && <BrowseLink to="/videos" label="Open Videos" />}
        {category.images > 0 && <BrowseLink to="/images" label="Open Images" />}
        {category.performers > 0 && (
          <BrowseLink to="/performers" label="Open Performers" />
        )}
        {category.total === 0 && (
          <span className="text-xs font-medium text-slate-500">
            No record usage yet.
          </span>
        )}
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: CategoryStatus }) {
  const className =
    status === "Managed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "Record-only"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span
      className={`mt-3 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${className}`}
    >
      {status}
    </span>
  );
}

function CountBlock({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function BrowseLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-sakura-200 hover:text-sakura-600"
    >
      {label}
    </Link>
  );
}

function CategoryEmptyState({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
      <p className="text-base font-semibold text-slate-700">{message}</p>
      <p className="mt-2 text-sm text-slate-500">
        Record Categories come from saved `categoriesJson` labels. Managed
        Categories can be reviewed in Category Management.
      </p>
    </section>
  );
}

function mergeCategoryRows(
  auditRows: CategoryAuditRow[],
  managedCategories: string[],
): CategoryBrowseRow[] {
  const rowsByKey = new Map<string, CategoryBrowseRow>();
  const managedKeys = new Set(
    managedCategories.map((category) => category.trim().toLowerCase()),
  );

  for (const row of auditRows) {
    const key = row.name.trim().toLowerCase();
    const isManaged = managedKeys.has(key);
    rowsByKey.set(key, {
      ...row,
      isManaged,
      status: isManaged ? "Managed" : "Record-only",
    });
  }

  for (const category of managedCategories) {
    const name = category.trim();
    const key = name.toLowerCase();

    if (!name || rowsByKey.has(key)) {
      continue;
    }

    rowsByKey.set(key, {
      name,
      videos: 0,
      images: 0,
      performers: 0,
      total: 0,
      isManaged: true,
      status: "Unused Managed",
    });
  }

  return [...rowsByKey.values()];
}

function filterCategoryRows(
  categories: CategoryBrowseRow[],
  searchQuery: string,
) {
  const query = searchQuery.trim().toLowerCase();

  if (!query) {
    return categories;
  }

  return categories.filter((category) =>
    category.name.toLowerCase().includes(query),
  );
}

function sortCategoryRows(categories: CategoryBrowseRow[], sortValue: SortValue) {
  return [...categories].sort((left, right) => {
    if (sortValue === "usage-desc") {
      return right.total - left.total || left.name.localeCompare(right.name);
    }

    if (sortValue === "usage-asc") {
      return left.total - right.total || left.name.localeCompare(right.name);
    }

    return left.name.localeCompare(right.name);
  });
}

export default CategoriesPage;
