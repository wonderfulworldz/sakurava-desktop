import { useMemo, useState } from "react";

type GlossarySampleEntry = {
  id: string;
  term: string;
  definition: string;
  synonyms: string[];
  category: string;
  thumbnailPath: string | null;
  favorite: boolean;
  sourceTitle: string;
  sourceUrl: string;
};

type GlossarySortKey = "term-asc" | "term-desc";

const pageSizeOptions = [32, 64, 128, 256] as const;

const sampleGlossaryEntries: GlossarySampleEntry[] = [
  {
    id: "glossary-alias-mapping",
    term: "Alias Mapping",
    definition:
      "A reference note that tracks alternate names for a term without changing performer aliases or catalog metadata.",
    synonyms: ["Alternate name", "Nickname", "Reference alias"],
    category: "Vocabulary",
    thumbnailPath: null,
    favorite: true,
    sourceTitle: "Internal reference note",
    sourceUrl: "https://example.invalid/glossary/alias-mapping",
  },
  {
    id: "glossary-category-drift",
    term: "Category Drift",
    definition:
      "A planning phrase for when labels become inconsistent over time and need review without automatic catalog mutation.",
    synonyms: ["Label drift", "Taxonomy drift"],
    category: "Planning",
    thumbnailPath: null,
    favorite: false,
    sourceTitle: "Glossary planning memo",
    sourceUrl: "https://example.invalid/glossary/category-drift",
  },
  {
    id: "glossary-local-reference",
    term: "Local Reference",
    definition:
      "A private note stored for personal use inside the desktop app, independent from remote services or account systems.",
    synonyms: ["Offline note", "Private reference"],
    category: "Storage",
    thumbnailPath: null,
    favorite: false,
    sourceTitle: "Local-first product notes",
    sourceUrl: "https://example.invalid/glossary/local-reference",
  },
  {
    id: "glossary-source-citation",
    term: "Source Citation",
    definition:
      "A title and URL kept with a glossary entry so the reference can be inspected later without fetching metadata during save.",
    synonyms: ["Reference link", "Source note"],
    category: "Reference",
    thumbnailPath: null,
    favorite: true,
    sourceTitle: "Source safety plan",
    sourceUrl: "https://example.invalid/glossary/source-citation",
  },
];

function GlossaryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortKey, setSortKey] = useState<GlossarySortKey>("term-asc");
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(32);
  const [page, setPage] = useState(1);

  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(sampleGlossaryEntries.map((entry) => entry.category)))
        .sort((left, right) => left.localeCompare(right)),
    [],
  );

  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch = (entry: GlossarySampleEntry) => {
      if (!normalizedQuery) {
        return true;
      }

      return [
        entry.term,
        entry.definition,
        entry.category,
        entry.sourceTitle,
        ...entry.synonyms,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    };

    return sampleGlossaryEntries
      .filter((entry) =>
        categoryFilter === "all" ? true : entry.category === categoryFilter,
      )
      .filter(matchesSearch)
      .sort((left, right) => {
        const comparison = left.term.localeCompare(right.term);
        return sortKey === "term-asc" ? comparison : -comparison;
      });
  }, [categoryFilter, searchQuery, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStartIndex = (safePage - 1) * pageSize;
  const pageEntries = filteredEntries.slice(pageStartIndex, pageStartIndex + pageSize);
  const showingStart = filteredEntries.length === 0 ? 0 : pageStartIndex + 1;
  const showingEnd = Math.min(pageStartIndex + pageEntries.length, filteredEntries.length);

  const updateSearchQuery = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  const updateCategoryFilter = (value: string) => {
    setCategoryFilter(value);
    setPage(1);
  };

  const updateSortKey = (value: GlossarySortKey) => {
    setSortKey(value);
    setPage(1);
  };

  const updatePageSize = (value: (typeof pageSizeOptions)[number]) => {
    setPageSize(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-lg border border-sakura-100 bg-white px-6 py-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-sakura-600">
            Reference Library
          </p>
          <div>
            <h1 className="text-3xl font-semibold text-slate-950">
              Glossary Library
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Store and manage definitions, references, and terms for your
              personal use.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled
          className="inline-flex h-10 items-center justify-center rounded-lg border border-sakura-200 bg-sakura-50 px-4 text-sm font-semibold text-sakura-500 shadow-sm opacity-75"
        >
          Add Entry
        </button>
      </header>

      <section
        className="rounded-lg border border-dashed border-sakura-200 bg-sakura-50/60 px-6 py-5"
        aria-labelledby="glossary-form-shell-title"
      >
        <div className="flex flex-col gap-2">
          <h2
            id="glossary-form-shell-title"
            className="text-lg font-semibold text-slate-950"
          >
            Add/Edit Glossary Entry
          </h2>
          <p className="max-w-3xl text-sm text-slate-600">
            Persistence is planned for a later batch. These fields are static
            placeholders and do not save or update glossary data.
          </p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {[
            "Term",
            "Synonyms",
            "Category",
            "Thumbnail",
            "Source Title",
            "Source URL",
          ].map((label) => (
            <label key={label} className="block text-sm font-medium text-slate-700">
              {label}
              <input
                type="text"
                disabled
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500"
                placeholder="Planned"
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" disabled className="size-4 accent-sakura-500" />
            Favorite
          </label>
          <label className="block text-sm font-medium text-slate-700 md:col-span-2">
            Definition
            <textarea
              disabled
              className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500"
              placeholder="Planned"
            />
          </label>
        </div>
      </section>

      <section
        className="rounded-lg border border-slate-200 bg-white shadow-sm"
        aria-labelledby="glossary-table-title"
      >
        <div className="space-y-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2
              id="glossary-table-title"
              className="text-lg font-semibold text-slate-950"
            >
              Glossary Entries
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Static sample entries for table, search, filter, sort, and
              pagination review only.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_160px]">
            <label className="block text-sm font-medium text-slate-700">
              Search glossary
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => updateSearchQuery(event.target.value)}
                placeholder="Search glossary..."
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sakura-300 focus:ring-2 focus:ring-sakura-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Category filter
              <select
                value={categoryFilter}
                onChange={(event) => updateCategoryFilter(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sakura-300 focus:ring-2 focus:ring-sakura-100"
              >
                <option value="all">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Sort
              <select
                value={sortKey}
                onChange={(event) =>
                  updateSortKey(event.target.value as GlossarySortKey)
                }
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sakura-300 focus:ring-2 focus:ring-sakura-100"
              >
                <option value="term-asc">Term A-Z</option>
                <option value="term-desc">Term Z-A</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Rows per page
              <select
                value={pageSize}
                onChange={(event) =>
                  updatePageSize(Number(event.target.value) as typeof pageSize)
                }
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sakura-300 focus:ring-2 focus:ring-sakura-100"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {showingStart}-{showingEnd} of {filteredEntries.length} entries
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage === 1}
                onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="rounded-lg bg-sakura-50 px-3 py-2 text-sm font-semibold text-sakura-600">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage === totalPages}
                onClick={() =>
                  setPage((currentPage) => Math.min(totalPages, currentPage + 1))
                }
                className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {pageEntries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Thumbnail</th>
                  <th className="px-4 py-3">Term</th>
                  <th className="px-4 py-3">Synonyms</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Definition</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {pageEntries.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="px-4 py-4">
                      <div
                        className="flex size-11 items-center justify-center rounded-lg border border-sakura-100 bg-sakura-50 text-sm font-semibold text-sakura-600"
                        aria-label={`${entry.term} thumbnail placeholder`}
                      >
                        {entry.term
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-950">
                          {entry.term}
                        </span>
                        {entry.favorite && (
                          <span className="rounded-full bg-sakura-50 px-2 py-0.5 text-xs font-semibold text-sakura-600">
                            Favorite
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex max-w-56 flex-wrap gap-1.5">
                        {entry.synonyms.map((synonym) => (
                          <span
                            key={synonym}
                            className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
                          >
                            {synonym}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-sakura-50 px-2.5 py-1 text-xs font-semibold text-sakura-600">
                        {entry.category}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="max-h-16 max-w-md overflow-hidden text-sm leading-6 text-slate-600">
                        {entry.definition}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        disabled
                        className="text-left text-sm font-semibold text-sakura-600 disabled:opacity-75"
                        aria-label={`Source ${entry.sourceTitle}`}
                      >
                        {entry.sourceTitle}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex min-h-56 items-center justify-center px-6 py-12">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-sakura-50 text-sakura-600">
                GL
              </div>
              <h3 className="text-base font-semibold text-slate-950">
                No glossary entries found
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Try a different search term or category filter. This table uses
                static sample entries only.
              </p>
            </div>
          </div>
        )}
      </section>

      <footer className="rounded-lg border border-sakura-100 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
        Glossary entries are independent from Video, Image, Performer, and
        Category catalog metadata.
      </footer>
    </div>
  );
}

export default GlossaryPage;
