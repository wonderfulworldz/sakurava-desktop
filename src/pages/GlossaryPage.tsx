import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";

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
type GlossaryFormMode = "add" | "edit";

type GlossaryFormState = {
  term: string;
  synonyms: string[];
  category: string;
  thumbnailPath: string;
  favorite: boolean;
  sourceTitle: string;
  sourceUrl: string;
  definition: string;
};

type GlossaryFormErrors = Partial<
  Record<"term" | "definition" | "sourceUrl", string>
>;

const pageSizeOptions = [32, 64, 128, 256] as const;

const glossaryFormCategoryOptions = [
  "Concepts",
  "People",
  "Media Terms",
  "Production",
  "Setting",
] as const;

const emptyFormState: GlossaryFormState = {
  term: "",
  synonyms: [],
  category: glossaryFormCategoryOptions[0],
  thumbnailPath: "",
  favorite: false,
  sourceTitle: "",
  sourceUrl: "",
  definition: "",
};

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

function entryToFormState(entry: GlossarySampleEntry): GlossaryFormState {
  const matchingCategory = glossaryFormCategoryOptions.includes(
    entry.category as (typeof glossaryFormCategoryOptions)[number],
  )
    ? entry.category
    : glossaryFormCategoryOptions[0];

  return {
    term: entry.term,
    synonyms: entry.synonyms,
    category: matchingCategory,
    thumbnailPath: entry.thumbnailPath ?? "",
    favorite: entry.favorite,
    sourceTitle: entry.sourceTitle,
    sourceUrl: entry.sourceUrl,
    definition: entry.definition,
  };
}

function GlossaryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortKey, setSortKey] = useState<GlossarySortKey>("term-asc");
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(32);
  const [page, setPage] = useState(1);
  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<GlossaryFormMode>("add");
  const [editingEntryTerm, setEditingEntryTerm] = useState("");
  const [formState, setFormState] = useState<GlossaryFormState>(emptyFormState);
  const [synonymDraft, setSynonymDraft] = useState("");
  const [formErrors, setFormErrors] = useState<GlossaryFormErrors>({});
  const [formMessage, setFormMessage] = useState("");

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

  const openAddForm = () => {
    setFormVisible(true);
    setFormMode("add");
    setEditingEntryTerm("");
    setFormState(emptyFormState);
    setSynonymDraft("");
    setFormErrors({});
    setFormMessage("");
  };

  const openEditForm = (entry: GlossarySampleEntry) => {
    setFormVisible(true);
    setFormMode("edit");
    setEditingEntryTerm(entry.term);
    setFormState(entryToFormState(entry));
    setSynonymDraft("");
    setFormErrors({});
    setFormMessage("");
  };

  const closeForm = () => {
    setFormVisible(false);
    setFormMode("add");
    setEditingEntryTerm("");
    setFormState(emptyFormState);
    setSynonymDraft("");
    setFormErrors({});
    setFormMessage("");
  };

  const clearForm = () => {
    setFormState(emptyFormState);
    setSynonymDraft("");
    setFormErrors({});
    setFormMessage("");
  };

  const updateFormField = <TKey extends keyof GlossaryFormState>(
    key: TKey,
    value: GlossaryFormState[TKey],
  ) => {
    setFormState((current) => ({ ...current, [key]: value }));
    if (key === "term" || key === "definition" || key === "sourceUrl") {
      setFormErrors((current) => ({ ...current, [key]: undefined }));
    }
    setFormMessage("");
  };

  const addSynonym = () => {
    const nextSynonym = synonymDraft.trim();
    if (!nextSynonym) {
      return;
    }

    setFormState((current) => {
      const exists = current.synonyms.some(
        (synonym) => synonym.toLowerCase() === nextSynonym.toLowerCase(),
      );
      return exists
        ? current
        : { ...current, synonyms: [...current.synonyms, nextSynonym] };
    });
    setSynonymDraft("");
    setFormMessage("");
  };

  const handleSynonymKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addSynonym();
    }
  };

  const removeSynonym = (synonymToRemove: string) => {
    setFormState((current) => ({
      ...current,
      synonyms: current.synonyms.filter((synonym) => synonym !== synonymToRemove),
    }));
    setFormMessage("");
  };

  const validateForm = () => {
    const nextErrors: GlossaryFormErrors = {};
    if (!formState.term.trim()) {
      nextErrors.term = "Term is required.";
    }
    if (!formState.definition.trim()) {
      nextErrors.definition = "Definition is required.";
    }
    if (
      formState.sourceUrl.trim() &&
      !/^https?:\/\//i.test(formState.sourceUrl.trim())
    ) {
      nextErrors.sourceUrl = "Source URL must start with http:// or https://.";
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage("");
    if (!validateForm()) {
      return;
    }

    setFormMessage(
      formMode === "add"
        ? "Glossary persistence is planned for a later batch. This entry preview was not saved."
        : "Glossary persistence is planned for a later batch. Static sample data was not changed.",
    );
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
          onClick={openAddForm}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-sakura-200 bg-sakura-50 px-4 text-sm font-semibold text-sakura-600 shadow-sm transition hover:bg-sakura-100"
        >
          Add Entry
        </button>
      </header>

      {formVisible && (
        <section
          className="rounded-lg border border-sakura-100 bg-white px-6 py-5 shadow-sm"
          aria-labelledby="glossary-form-title"
        >
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-sakura-600">
              {formMode === "add" ? "Add state" : "Edit preview"}
            </p>
            <h2
              id="glossary-form-title"
              className="text-lg font-semibold text-slate-950"
            >
              Add/Edit Glossary Entry
            </h2>
            <p className="max-w-3xl text-sm text-slate-600">
              This form is a UI preview only. Persistence is planned for a later
              batch, so saving does not create, update, or delete glossary data.
              {formMode === "edit" && editingEntryTerm
                ? ` Editing preview: ${editingEntryTerm}.`
                : ""}
            </p>
          </div>

          {formMessage && (
            <div
              className="mt-4 rounded-lg border border-sakura-100 bg-sakura-50 px-4 py-3 text-sm font-medium text-sakura-700"
              role="status"
            >
              {formMessage}
            </div>
          )}

          <form className="mt-5 space-y-5" onSubmit={submitForm} noValidate>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldErrorLabel label="Term" error={formErrors.term}>
                <input
                  type="text"
                  value={formState.term}
                  onChange={(event) => updateFormField("term", event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sakura-300 focus:ring-2 focus:ring-sakura-100"
                />
              </FieldErrorLabel>

              <label className="block text-sm font-medium text-slate-700">
                Category
                <select
                  value={formState.category}
                  onChange={(event) =>
                    updateFormField("category", event.target.value)
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sakura-300 focus:ring-2 focus:ring-sakura-100"
                >
                  {glossaryFormCategoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700">
                  Synonyms
                  <div className="mt-1 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm focus-within:border-sakura-300 focus-within:ring-2 focus-within:ring-sakura-100">
                    <div className="flex flex-wrap gap-2">
                      {formState.synonyms.map((synonym) => (
                        <button
                          key={synonym}
                          type="button"
                          onClick={() => removeSynonym(synonym)}
                          className="rounded-full bg-sakura-50 px-3 py-1 text-xs font-semibold text-sakura-600 transition hover:bg-sakura-100"
                          aria-label={`Remove synonym ${synonym}`}
                        >
                          {synonym} x
                        </button>
                      ))}
                      {formState.synonyms.length === 0 && (
                        <span className="px-1 py-1 text-xs text-slate-500">
                          No synonyms added
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={synonymDraft}
                        onChange={(event) => setSynonymDraft(event.target.value)}
                        onKeyDown={handleSynonymKeyDown}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none"
                        placeholder="Type synonym and press Enter"
                        aria-label="Synonyms"
                      />
                      <button
                        type="button"
                        onClick={addSynonym}
                        className="h-9 rounded-lg border border-sakura-200 px-3 text-sm font-semibold text-sakura-600"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </label>
              </div>

              <label className="block text-sm font-medium text-slate-700">
                Thumbnail
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={formState.thumbnailPath}
                    onChange={(event) =>
                      updateFormField("thumbnailPath", event.target.value)
                    }
                    className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sakura-300 focus:ring-2 focus:ring-sakura-100"
                    placeholder="Path reference only"
                  />
                  <button
                    type="button"
                    disabled
                    className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-500 opacity-75"
                  >
                    Browse planned
                  </button>
                </div>
              </label>

              <label className="flex items-center gap-3 self-end rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={formState.favorite}
                  onChange={(event) =>
                    updateFormField("favorite", event.target.checked)
                  }
                  className="size-4 accent-sakura-500"
                />
                Favorite
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Source Title
                <input
                  type="text"
                  value={formState.sourceTitle}
                  onChange={(event) =>
                    updateFormField("sourceTitle", event.target.value)
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sakura-300 focus:ring-2 focus:ring-sakura-100"
                />
              </label>

              <FieldErrorLabel label="Source URL" error={formErrors.sourceUrl}>
                <input
                  type="url"
                  value={formState.sourceUrl}
                  onChange={(event) =>
                    updateFormField("sourceUrl", event.target.value)
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sakura-300 focus:ring-2 focus:ring-sakura-100"
                  placeholder="https://"
                />
              </FieldErrorLabel>

              <FieldErrorLabel
                label="Definition"
                error={formErrors.definition}
                className="md:col-span-2"
              >
                <textarea
                  value={formState.definition}
                  onChange={(event) =>
                    updateFormField("definition", event.target.value)
                  }
                  className="mt-1 min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sakura-300 focus:ring-2 focus:ring-sakura-100"
                />
              </FieldErrorLabel>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={clearForm}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Clear form
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-10 rounded-lg border border-sakura-200 bg-sakura-50 px-4 text-sm font-semibold text-sakura-600 transition hover:bg-sakura-100"
              >
                {formMode === "add" ? "Save Draft" : "Preview Entry"}
              </button>
            </div>
          </form>
        </section>
      )}

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
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-950">
                            {entry.term}
                          </span>
                          {entry.favorite && (
                            <span className="rounded-full bg-sakura-50 px-2 py-0.5 text-xs font-semibold text-sakura-600">
                              Favorite
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => openEditForm(entry)}
                          className="w-fit text-xs font-semibold text-sakura-600 hover:text-sakura-700"
                          aria-label={`Edit ${entry.term}`}
                        >
                          Edit preview
                        </button>
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

function FieldErrorLabel({
  label,
  error,
  className = "",
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block text-sm font-medium text-slate-700 ${className}`}>
      {label}
      {children}
      {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </label>
  );
}

export default GlossaryPage;
