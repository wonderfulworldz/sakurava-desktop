import { type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, BookOpenText, Check, ChevronDown, ChevronRight, Filter, Link2, Plus, Search, Star, Trash2, X } from "lucide-react";
import type {
  GlossaryEntry,
  GlossaryEntryPatch,
  NewGlossaryEntry,
} from "../backend/types";
import { parseTextLabelArray, stringifyTextLabelArray } from "../backend/json";
import {
  createGlossaryEntry,
  deleteGlossaryEntry,
  isGlossaryRuntimeAvailable,
  listGlossaryEntries,
  updateGlossaryEntry,
} from "../runtime/glossaryCommands";
import { selectLocalImageFile } from "../runtime/dialogCommands";
import ConfirmDialog from "../components/ConfirmDialog";
import StickyHorizontalScroll from "../components/StickyHorizontalScroll";
import {
  clearSessionFilterState,
  readSessionFilterState,
  writeSessionFilterState,
} from "../lib/sessionFilterState";

type GlossarySortKey = "az" | "za" | "created-desc" | "updated-desc";
type GlossaryFormMode = "add" | "edit";
type GlossaryConfirmation = "save" | "delete" | "discard" | null;
type GlossaryTableDisplayRow = {
  entry: GlossaryEntry;
  depth: number;
  childCount: number;
  expanded: boolean;
};
type GlossarySessionFilters = {
  searchQuery: string;
  parentFilter: GlossaryFilterValue | string[] | string;
  sortKey?: GlossarySortKey;
  tableSort?: GlossaryTableSortState;
  pageSize?: (typeof pageSizeOptions)[number];
  page?: number;
  expandedEntryIds?: string[];
};
type GlossaryFilterValue = "all" | "parent" | "child";
type GlossaryTableSortState = {
  value: GlossarySortKey;
  direction: "ascending" | "descending";
} | null;

type GlossaryFormState = {
  term: string;
  synonyms: string[];
  parentId: string;
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
const glossaryFilterSessionKey = "glossary-library";
const emptyGlossarySessionFilters: GlossarySessionFilters = {
  searchQuery: "",
  parentFilter: "all",
};
const glossaryFilterOptions: Array<{ value: GlossaryFilterValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "parent", label: "Parent Only" },
  { value: "child", label: "Child Only" },
];
const sortOptions: Array<{ value: GlossarySortKey; label: string }> = [
  { value: "az", label: "Term A-Z" },
  { value: "za", label: "Term Z-A" },
  { value: "created-desc", label: "Last Added" },
  { value: "updated-desc", label: "Last Updated" },
];

const sampleGlossaryEntries: GlossaryEntry[] = [
  {
    id: "glossary-alias-mapping",
    term: "Alias Mapping",
    definition:
      "A reference note that tracks alternate names for a term without changing performer aliases or catalog metadata.",
    synonymsJson: stringifyTextLabelArray([
      "Alternate name",
      "Nickname",
      "Reference alias",
    ]),
    category: "Vocabulary",
    parentId: "",
    thumbnailPath: "",
    favorite: true,
    sourceTitle: "Internal reference note",
    sourceUrl: "https://example.invalid/glossary/alias-mapping",
    createdAt: 1,
    updatedAt: 4,
  },
  {
    id: "glossary-category-drift",
    term: "Category Drift",
    definition:
      "A planning phrase for when labels become inconsistent over time and need review without automatic catalog mutation.",
    synonymsJson: stringifyTextLabelArray(["Label drift", "Taxonomy drift"]),
    category: "",
    parentId: "glossary-alias-mapping",
    thumbnailPath: "",
    favorite: false,
    sourceTitle: "Glossary planning memo",
    sourceUrl: "https://example.invalid/glossary/category-drift",
    createdAt: 2,
    updatedAt: 3,
  },
  {
    id: "glossary-nested-child",
    term: "Nested Child",
    definition:
      "A deeper child entry used to show sub-parent hierarchy labels in the glossary category picker.",
    synonymsJson: stringifyTextLabelArray([]),
    category: "",
    parentId: "glossary-category-drift",
    thumbnailPath: "",
    favorite: false,
    sourceTitle: "",
    sourceUrl: "",
    createdAt: 6,
    updatedAt: 2,
  },
  {
    id: "glossary-local-reference",
    term: "Local Reference",
    definition: "",
    synonymsJson: stringifyTextLabelArray([]),
    category: "",
    parentId: "",
    thumbnailPath: "",
    favorite: false,
    sourceTitle: "",
    sourceUrl: "",
    createdAt: 3,
    updatedAt: 2,
  },
  {
    id: "glossary-source-citation",
    term: "Source Citation",
    definition:
      "A title and URL kept with a glossary entry so the reference can be inspected later without fetching metadata during save.",
    synonymsJson: stringifyTextLabelArray([
      "Reference link",
      "Source note",
      "Citation title",
      "URL reference",
    ]),
    category: "",
    parentId: "glossary-local-reference",
    thumbnailPath: "",
    favorite: true,
    sourceTitle: "Source safety plan",
    sourceUrl: "https://example.invalid/glossary/source-citation",
    createdAt: 4,
    updatedAt: 1,
  },
  {
    id: "glossary-standalone-note",
    term: "AAA Standalone",
    definition:
      "A root glossary entry with no child terms, used to keep standalone rows separate from parent groups.",
    synonymsJson: stringifyTextLabelArray(["Loose term"]),
    category: "",
    parentId: "",
    thumbnailPath: "",
    favorite: false,
    sourceTitle: "",
    sourceUrl: "",
    createdAt: 5,
    updatedAt: 99,
  },
];

const emptyFormState: GlossaryFormState = {
  term: "",
  synonyms: [],
  parentId: "",
  thumbnailPath: "",
  favorite: false,
  sourceTitle: "",
  sourceUrl: "",
  definition: "",
};

function entryToFormState(entry: GlossaryEntry): GlossaryFormState {
  return {
    term: entry.term,
    synonyms: parseTextLabelArray(entry.synonymsJson),
    parentId: entry.parentId,
    thumbnailPath: entry.thumbnailPath,
    favorite: entry.favorite,
    sourceTitle: entry.sourceTitle,
    sourceUrl: entry.sourceUrl,
    definition: entry.definition,
  };
}

function formStateToInput(formState: GlossaryFormState): NewGlossaryEntry {
  return {
    term: formState.term.trim(),
    definition: formState.definition.trim(),
    synonymsJson: stringifyTextLabelArray(formState.synonyms),
    category: "",
    parentId: formState.parentId,
    thumbnailPath: formState.thumbnailPath.trim(),
    favorite: formState.favorite,
    sourceTitle: formState.sourceTitle.trim(),
    sourceUrl: formState.sourceUrl.trim(),
  };
}

function glossaryFormSnapshot(formState: GlossaryFormState, synonymDraft: string) {
  return JSON.stringify({
    formState,
    synonymDraft: synonymDraft.trim(),
  });
}

function glossaryConfirmationCopy(
  confirmation: GlossaryConfirmation,
  formMode: GlossaryFormMode,
) {
  if (confirmation === "delete") {
    return {
      title: "Delete glossary entry?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      pendingLabel: "Deleting...",
    };
  }

  if (confirmation === "discard") {
    return {
      title: "Discard changes?",
      description: "Unsaved Glossary entry changes will be lost.",
      confirmLabel: "Discard",
      pendingLabel: "Discarding...",
    };
  }

  return formMode === "add"
    ? {
        title: "Save glossary entry?",
        description: "Review the entry before saving it.",
        confirmLabel: "Save",
        pendingLabel: "Saving...",
      }
    : {
        title: "Save changes?",
        description: "The Glossary entry will be updated with these changes.",
        confirmLabel: "Save changes",
        pendingLabel: "Saving...",
      };
}

function GlossaryPage() {
  const initialFilters = readSessionFilterState(
    glossaryFilterSessionKey,
    emptyGlossarySessionFilters,
  );
  const [entries, setEntries] = useState<GlossaryEntry[]>(() =>
    isGlossaryRuntimeAvailable() ? [] : sampleGlossaryEntries,
  );
  const [isRuntimeMode, setIsRuntimeMode] = useState(() =>
    isGlossaryRuntimeAvailable(),
  );
  const [isLoading, setIsLoading] = useState(() => isGlossaryRuntimeAvailable());
  const [dataStatus, setDataStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState(initialFilters.searchQuery);
  const [parentFilter, setParentFilter] = useState<GlossaryFilterValue>(
    normalizeGlossaryFilterValue(initialFilters.parentFilter),
  );
  const [sortKey, setSortKey] = useState<GlossarySortKey>(
    initialFilters.sortKey ?? "az",
  );
  const [tableSort, setTableSort] = useState<GlossaryTableSortState>(
    initialFilters.tableSort ?? null,
  );
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(
    initialFilters.pageSize ?? 32,
  );
  const [page, setPage] = useState(initialFilters.page ?? 1);
  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<GlossaryFormMode>("add");
  const [editingEntryId, setEditingEntryId] = useState("");
  const [formState, setFormState] = useState<GlossaryFormState>(emptyFormState);
  const [synonymDraft, setSynonymDraft] = useState("");
  const [formErrors, setFormErrors] = useState<GlossaryFormErrors>({});
  const [formMessage, setFormMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<GlossaryConfirmation>(null);
  const [cleanFormSnapshot, setCleanFormSnapshot] = useState(() =>
    glossaryFormSnapshot(emptyFormState, ""),
  );
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState("");
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [sortPickerOpen, setSortPickerOpen] = useState(false);
  const [sortSearch, setSortSearch] = useState("");
  const [expandedEntryIds, setExpandedEntryIds] = useState<Set<string>>(
    () => new Set(initialFilters.expandedEntryIds ?? []),
  );
  const formSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isGlossaryRuntimeAvailable()) {
      setIsRuntimeMode(false);
      setEntries(sampleGlossaryEntries);
      setIsLoading(false);
      setDataStatus("");
      return;
    }

    let isMounted = true;
    setIsRuntimeMode(true);
    setIsLoading(true);
    setDataStatus("");
    listGlossaryEntries()
      .then((loadedEntries) => {
        if (isMounted) {
          setEntries(loadedEntries);
        }
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }
        setEntries([]);
        setDataStatus(
          error instanceof Error
            ? error.message
            : "Unable to load Glossary entries.",
        );
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const entryById = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry])),
    [entries],
  );
  const parentIdsWithChildren = useMemo(
    () => new Set(entries.map((entry) => entry.parentId).filter(Boolean)),
    [entries],
  );

  useEffect(() => {
    if (initialFilters.expandedEntryIds) {
      return;
    }
    setExpandedEntryIds((current) => {
      const next = new Set(current);
      for (const parentId of parentIdsWithChildren) {
        next.add(parentId);
      }
      return next;
    });
  }, [parentIdsWithChildren]);

  useEffect(() => {
    writeSessionFilterState(glossaryFilterSessionKey, {
      searchQuery,
      parentFilter,
      sortKey,
      tableSort,
      pageSize,
      page,
      expandedEntryIds: [...expandedEntryIds],
    });
  }, [
    expandedEntryIds,
    page,
    pageSize,
    parentFilter,
    searchQuery,
    sortKey,
    tableSort,
  ]);
  const parentOptions = useMemo(
    () =>
      entries
        .filter((entry) => entry.id !== editingEntryId)
        .filter((entry) => !isDescendantEntry(entry.id, editingEntryId, entryById))
        .sort((left, right) => left.term.localeCompare(right.term)),
    [editingEntryId, entries, entryById],
  );
  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch = (entry: GlossaryEntry) => {
      if (!normalizedQuery) {
        return true;
      }

      return [
        entry.term,
        entry.definition,
        parentPathLabel(entry, entryById),
        entry.sourceTitle,
        ...parseTextLabelArray(entry.synonymsJson),
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    };

    return entries
      .filter((entry) => {
        if (parentFilter === "all") {
          return true;
        }
        if (parentFilter === "parent") {
          return parentIdsWithChildren.has(entry.id);
        }
        return Boolean(entry.parentId);
      })
      .filter(matchesSearch)
        .sort((left, right) =>
          sortGlossaryEntries(
            left,
            right,
            tableSort?.value ?? sortKey,
            tableSort?.direction,
          ),
        );
  }, [
    entries,
    entryById,
    parentFilter,
    parentIdsWithChildren,
    searchQuery,
    sortKey,
    tableSort,
  ]);

  const tableRows = useMemo(
    () =>
      buildGlossaryTableRows({
        entries,
        filteredEntries,
        expandedEntryIds,
        sortKey: tableSort?.value ?? sortKey,
        sortDirection: tableSort?.direction,
        hierarchical:
          parentFilter === "all" && searchQuery.trim().length === 0,
      }),
    [
      entries,
      expandedEntryIds,
      filteredEntries,
      parentFilter,
      searchQuery,
      sortKey,
      tableSort,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(tableRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStartIndex = (safePage - 1) * pageSize;
  const pageRows = tableRows.slice(pageStartIndex, pageStartIndex + pageSize);
  const showingStart = tableRows.length === 0 ? 0 : pageStartIndex + 1;
  const showingEnd = Math.min(pageStartIndex + pageRows.length, tableRows.length);
  const editingEntry = editingEntryId ? entryById.get(editingEntryId) ?? null : null;
  const activeFilterChips = useMemo(
    () => {
      const chips: Array<{ key: string; label: string; fullLabel: string }> = [];
      if (parentFilter !== "all") {
        const label =
          glossaryFilterOptions.find((option) => option.value === parentFilter)?.label ??
          parentFilter;
        chips.push({
          key: `filter-${parentFilter}`,
          label: `Filter: ${label}`,
          fullLabel: `Filter: ${label}`,
        });
      }
      return chips;
    },
    [parentFilter],
  );

  const updateSearchQuery = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  const updateParentFilter = (value: GlossaryFilterValue) => {
    setParentFilter(value);
    setPage(1);
  };

  const removeFilterChip = (key: string) => {
    if (key.startsWith("filter-")) {
      updateParentFilter("all");
    }
  };

  const clearTableFilters = () => {
    setSearchQuery("");
    setParentFilter("all");
    setSortKey("az");
    setTableSort(null);
    setPageSize(32);
    setExpandedEntryIds(defaultGlossaryExpandedEntryIds(entries));
    clearSessionFilterState(glossaryFilterSessionKey);
    setPage(1);
  };

  const updateSortKey = (value: GlossarySortKey) => {
    setSortKey(value);
    setTableSort(null);
    setPage(1);
    setSortPickerOpen(false);
    setSortSearch("");
  };

  const updateTableSort = (value: GlossarySortKey) => {
    setTableSort((current) => ({
      value,
      direction:
        current?.value === value && current.direction === "ascending"
          ? "descending"
          : "ascending",
    }));
    setPage(1);
  };

  const toggleEntryExpansion = (entryId: string) => {
    setExpandedEntryIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const updatePageSize = (value: (typeof pageSizeOptions)[number]) => {
    setPageSize(value);
    setPage(1);
  };

  const openAddForm = () => {
    setFormVisible(true);
    setFormMode("add");
    setEditingEntryId("");
    setFormState(emptyFormState);
    setCleanFormSnapshot(glossaryFormSnapshot(emptyFormState, ""));
    setSynonymDraft("");
    setFormErrors({});
    setFormMessage("");
    setConfirmation(null);
    window.requestAnimationFrame(() => {
      scrollFormIntoView(formSectionRef.current);
    });
  };

  const openEditForm = (entry: GlossaryEntry) => {
    const nextFormState = entryToFormState(entry);
    setFormVisible(true);
    setFormMode("edit");
    setEditingEntryId(entry.id);
    setFormState(nextFormState);
    setCleanFormSnapshot(glossaryFormSnapshot(nextFormState, ""));
    setSynonymDraft("");
    setFormErrors({});
    setFormMessage("");
    setConfirmation(null);
    window.requestAnimationFrame(() => {
      scrollFormIntoView(formSectionRef.current);
    });
  };

  const closeForm = () => {
    setFormVisible(false);
    setFormMode("add");
    setEditingEntryId("");
    setFormState(emptyFormState);
    setCleanFormSnapshot(glossaryFormSnapshot(emptyFormState, ""));
    setSynonymDraft("");
    setFormErrors({});
    setFormMessage("");
    setIsSubmitting(false);
    setConfirmation(null);
  };

  const resetFormAfterSuccessfulSave = () => {
    setFormVisible(true);
    setFormMode("add");
    setEditingEntryId("");
    setFormState(emptyFormState);
    setCleanFormSnapshot(glossaryFormSnapshot(emptyFormState, ""));
    setSynonymDraft("");
    setFormErrors({});
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

  const addSynonymParts = (value: string) => {
    const nextSynonyms = value
      .split(",")
      .map((synonym) => synonym.trim())
      .filter(Boolean);
    if (nextSynonyms.length === 0) {
      return;
    }

    setFormState((current) => {
      const existing = new Set(
        current.synonyms.map((synonym) => synonym.toLowerCase()),
      );
      const uniqueSynonyms = nextSynonyms.filter((synonym) => {
        const key = synonym.toLowerCase();
        if (existing.has(key)) {
          return false;
        }
        existing.add(key);
        return true;
      });
      return uniqueSynonyms.length > 0
        ? { ...current, synonyms: [...current.synonyms, ...uniqueSynonyms] }
        : current;
    });
    setSynonymDraft("");
    setFormMessage("");
  };

  const handleSynonymChange = (value: string) => {
    if (value.includes(",")) {
      const parts = value.split(",");
      addSynonymParts(parts.slice(0, -1).join(","));
      setSynonymDraft(parts[parts.length - 1] ?? "");
      return;
    }
    setSynonymDraft(value);
  };

  const handleSynonymKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addSynonymParts(synonymDraft);
      return;
    }
    if (
      event.key === "Backspace" &&
      !synonymDraft &&
      formState.synonyms.length > 0
    ) {
      event.preventDefault();
      setFormState((current) => ({
        ...current,
        synonyms: current.synonyms.slice(0, -1),
      }));
    }
  };

  const removeSynonym = (synonymToRemove: string) => {
    setFormState((current) => ({
      ...current,
      synonyms: current.synonyms.filter((synonym) => synonym !== synonymToRemove),
    }));
    setFormMessage("");
  };

  const browseThumbnailPath = async () => {
    const selectedPath = await selectLocalImageFile();
    if (selectedPath) {
      updateFormField("thumbnailPath", selectedPath);
    }
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

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage("");
    addSynonymParts(synonymDraft);
    if (!validateForm()) {
      return;
    }

    if (!isRuntimeMode) {
      setFormMessage("Open the desktop app to save Glossary entries.");
      return;
    }

    setConfirmation("save");
  };

  const executeSubmitForm = async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const input = formStateToInput({
        ...formState,
        synonyms: mergeSynonymDraft(formState.synonyms, synonymDraft),
      });
      if (formMode === "add") {
        const created = await createGlossaryEntry(input);
        setEntries((currentEntries) => [created, ...currentEntries]);
        if (created.parentId) {
          setExpandedEntryIds((current) => new Set(current).add(created.parentId));
        }
        setFormMessage("Data created successfully.");
        resetFormAfterSuccessfulSave();
      } else if (editingEntryId) {
        const patch: GlossaryEntryPatch = input;
        const updated = await updateGlossaryEntry(editingEntryId, patch);
        if (!updated) {
          setFormMessage("Glossary entry was not found.");
          return;
        }
        setEntries((currentEntries) =>
          currentEntries.map((entry) =>
            entry.id === updated.id ? updated : entry,
          ),
        );
        if (updated.parentId) {
          setExpandedEntryIds((current) => new Set(current).add(updated.parentId));
        }
        setFormMessage("Data updated successfully.");
        resetFormAfterSuccessfulSave();
      }
      setSynonymDraft("");
      setConfirmation(null);
    } catch (error) {
      setFormMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleFavorite = async (entry: GlossaryEntry) => {
    if (!isRuntimeMode) {
      setDataStatus("Open the desktop app to update favorites.");
      return;
    }

    try {
      const updated = await updateGlossaryEntry(entry.id, {
        favorite: !entry.favorite,
      });
      if (!updated) {
        setDataStatus("Glossary entry was not found.");
        return;
      }
      setEntries((currentEntries) =>
        currentEntries.map((currentEntry) =>
          currentEntry.id === updated.id ? updated : currentEntry,
        ),
      );
      if (editingEntryId === updated.id) {
        setFormState(entryToFormState(updated));
      }
      setDataStatus("Glossary favorite updated.");
    } catch (error) {
      setDataStatus(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    }
  };

  const deleteEditingEntry = async () => {
    if (!editingEntry) {
      return;
    }
    if (!isRuntimeMode) {
      setDataStatus("Open the desktop app to delete Glossary entries.");
      return;
    }
    setConfirmation("delete");
  };

  const executeDeleteEditingEntry = async () => {
    if (!editingEntry || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await deleteGlossaryEntry(editingEntry.id);
      if (!result.deleted) {
        setDataStatus("Glossary entry was not found.");
        return;
      }
      setEntries((currentEntries) =>
        currentEntries.filter((entry) => entry.id !== editingEntry.id),
      );
      closeForm();
      setDataStatus("Data deleted successfully.");
    } catch (error) {
      setDataStatus(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormDirty =
    formVisible &&
    glossaryFormSnapshot(formState, synonymDraft) !== cleanFormSnapshot;

  const requestCloseForm = () => {
    if (!isFormDirty) {
      closeForm();
      return;
    }
    setConfirmation("discard");
  };

  const closeConfirmation = () => {
    if (!isSubmitting) {
      setConfirmation(null);
    }
  };

  const confirmCurrentAction = async () => {
    if (confirmation === "save") {
      await executeSubmitForm();
      return;
    }
    if (confirmation === "delete") {
      await executeDeleteEditingEntry();
      return;
    }
    if (confirmation === "discard") {
      closeForm();
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold tracking-normal text-slate-950">
            Glossary Library
          </h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500">
            Store and manage definitions, references, and terms for your
            personal use.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddForm}
          className="inline-flex h-12 w-fit items-center justify-center gap-2 rounded-lg bg-sakura-500 px-5 text-base font-semibold text-white shadow-sm shadow-sakura-200 transition hover:bg-sakura-600 focus:outline-none focus:ring-4 focus:ring-sakura-100"
        >
          <Plus size={20} />
          Add Entry
        </button>
      </header>

      {(dataStatus || isLoading) && (
        <div
          className="rounded-lg border border-sakura-100 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm"
          role="status"
        >
          {isLoading ? "Loading Glossary entries..." : dataStatus}
        </div>
      )}

      {formVisible && (
        <section
          ref={formSectionRef}
          className="scroll-mt-4 rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm"
          aria-labelledby="glossary-form-title"
        >
          <h2
            id="glossary-form-title"
            className="text-lg font-semibold text-slate-950"
          >
            {formMode === "add" ? "Add Glossary Entry" : "Edit Glossary Entry"}
          </h2>

          {formMessage && (
            <div
              className="mt-4 rounded-lg border border-sakura-100 bg-sakura-50 px-4 py-3 text-sm font-medium text-sakura-700"
              role="status"
            >
              {formMessage}
            </div>
          )}

          <form className="mt-5 space-y-5" onSubmit={submitForm} noValidate>
            <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
              <FieldErrorLabel label="Term" required error={formErrors.term}>
                <input
                  type="text"
                  aria-label="Term"
                  value={formState.term}
                  onChange={(event) => updateFormField("term", event.target.value)}
                  className={inputClassName}
                  placeholder="Enter term or title"
                />
              </FieldErrorLabel>

              <SwitchField
                checked={formState.favorite}
                onChange={(checked) => updateFormField("favorite", checked)}
              />

              <div>
                <span className="block text-sm font-medium text-slate-700">
                  Synonyms
                </span>
                <div className="mt-1 flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm transition focus-within:border-sakura-300 focus-within:ring-4 focus-within:ring-sakura-100">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {formState.synonyms.map((synonym) => (
                      <button
                        key={synonym}
                        type="button"
                        onClick={() => removeSynonym(synonym)}
                        className="inline-flex max-w-full items-center gap-1 rounded-md bg-sakura-50 px-2.5 py-1 text-xs font-semibold text-sakura-700 transition hover:bg-sakura-100"
                        aria-label={`Remove synonym ${synonym}`}
                      >
                        <span className="truncate">{synonym}</span>
                        <X size={13} />
                      </button>
                    ))}
                    <input
                      type="text"
                      value={synonymDraft}
                      onChange={(event) => handleSynonymChange(event.target.value)}
                      onKeyDown={handleSynonymKeyDown}
                      className="min-w-36 flex-1 border-0 bg-transparent px-1 py-1 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                      placeholder="Add synonym and press Enter..."
                      aria-label="Synonyms"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => addSynonymParts(synonymDraft)}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-sakura-500 text-white shadow-sm transition hover:bg-sakura-600"
                    aria-label="Add synonym"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <label className="block text-sm font-medium text-slate-700">
                Source Title
                <input
                  type="text"
                  value={formState.sourceTitle}
                  onChange={(event) =>
                    updateFormField("sourceTitle", event.target.value)
                  }
                  className={inputClassName}
                  placeholder="e.g. Wikipedia, Official Website, Article"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Category
                <GlossaryParentPicker
                  value={formState.parentId}
                  options={parentOptions}
                  entryById={entryById}
                  open={parentPickerOpen}
                  search={parentSearch}
                  onOpenChange={setParentPickerOpen}
                  onSearchChange={setParentSearch}
                  onChange={(parentId) => updateFormField("parentId", parentId)}
                  ariaLabel="Search glossary parent terms"
                  placeholder="Select parent term..."
                />
              </label>

              <FieldErrorLabel label="Source URL" error={formErrors.sourceUrl}>
                <div className="relative mt-1">
                  <input
                    type="url"
                    value={formState.sourceUrl}
                    onChange={(event) =>
                      updateFormField("sourceUrl", event.target.value)
                    }
                    className={`${inputClassName} mt-0 pr-11`}
                    placeholder="https://example.com/reference-page"
                  />
                  <Link2
                    size={18}
                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
              </FieldErrorLabel>

              <label className="block text-sm font-medium text-slate-700">
                Thumbnail
                <div className="mt-1 flex gap-3">
                  <input
                    type="text"
                    value={formState.thumbnailPath}
                    onChange={(event) =>
                      updateFormField("thumbnailPath", event.target.value)
                    }
                    className={`${inputClassName} mt-0 min-w-0 flex-1`}
                    placeholder="/path/to/image.jpg"
                  />
                  <button
                    type="button"
                    onClick={browseThumbnailPath}
                    className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Browse
                  </button>
                </div>
              </label>

              <FieldErrorLabel label="Definition" required error={formErrors.definition}>
                <textarea
                  aria-label="Definition"
                  value={formState.definition}
                  onChange={(event) =>
                    updateFormField("definition", event.target.value)
                  }
                  className="mt-1 min-h-32 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                  placeholder="Write the definition, explanation, or details about this term..."
                />
              </FieldErrorLabel>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {formMode === "edit" && (
                <button
                  type="button"
                  onClick={deleteEditingEntry}
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={requestCloseForm}
                className={secondaryButtonClassName}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-11 rounded-lg border border-sakura-300 bg-sakura-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-sakura-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Saving..." : "Save Entry"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="glossary-table-title">
        <div
          className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
          aria-label="Glossary toolbar"
        >
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search terms</span>
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => updateSearchQuery(event.target.value)}
                placeholder="Search terms..."
                aria-label="Search terms"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-12 pr-10 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
              />
              {searchQuery.trim() && (
                <button
                  type="button"
                  aria-label="Clear glossary search"
                  title="Clear glossary search"
                  className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-sakura-50 hover:text-sakura-600 focus:outline-none focus:ring-2 focus:ring-sakura-200"
                  onClick={() => updateSearchQuery("")}
                >
                  <X size={15} />
                </button>
              )}
            </label>

            <GlossaryParentFilter
              value={parentFilter}
              open={filterPickerOpen}
              onOpenChange={setFilterPickerOpen}
              onChange={updateParentFilter}
            />

            <SortPicker
              value={sortKey}
              open={sortPickerOpen}
              search={sortSearch}
              onOpenChange={setSortPickerOpen}
              onSearchChange={setSortSearch}
              onChange={updateSortKey}
            />
          </div>
          {activeFilterChips.length > 0 && (
            <div
              className="mt-3 flex flex-col gap-3 rounded-lg border border-sakura-100 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              aria-label="Glossary active filters"
            >
              <div className="flex flex-wrap gap-2">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => removeFilterChip(chip.key)}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-sakura-100 bg-sakura-50 px-3 text-sm font-semibold text-sakura-600 transition hover:border-sakura-200 hover:bg-sakura-100"
                    aria-label={`Remove filter ${chip.fullLabel}`}
                    title={chip.fullLabel}
                  >
                    {chip.label}
                    <X size={14} />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={clearTableFilters}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sakura-200 hover:text-sakura-600"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        <nav
          className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          aria-label="Glossary pagination"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <p className="text-sm font-semibold text-slate-600">
              Showing {showingStart}-{showingEnd} of {tableRows.length}
            </p>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              Page size
              <select
                value={pageSize}
                aria-label="Terms per page"
                onChange={(event) =>
                  updatePageSize(
                    Number(event.target.value) as (typeof pageSizeOptions)[number],
                  )
                }
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <span>per page</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              className={paginationButtonClassName}
            >
              Previous
            </button>
            {buildGlossaryPaginationPages(safePage, totalPages).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
                aria-current={pageNumber === safePage ? "page" : undefined}
                aria-label={`Page ${pageNumber}`}
                className={`flex size-9 items-center justify-center rounded-lg text-sm font-semibold ${
                  pageNumber === safePage
                    ? "bg-sakura-500 text-white"
                    : "border border-slate-200 bg-white text-slate-500"
                }`}
              >
                {pageNumber}
              </button>
            ))}
            <button
              type="button"
              disabled={safePage === totalPages}
              onClick={() =>
                setPage((currentPage) => Math.min(totalPages, currentPage + 1))
              }
              className={paginationButtonClassName}
            >
              Next
            </button>
          </div>
        </nav>

        {pageRows.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <StickyHorizontalScroll testId="glossary-table-scroll">
              <table className="w-full min-w-[1040px] table-fixed divide-y divide-slate-200 text-left text-sm">
                <colgroup>
                  <col className="w-[44px]" />
                  <col className="w-[72px]" />
                  <col className="w-[66px]" />
                  <col className="w-[220px]" />
                  <col className="w-[96px]" />
                  <col className="w-[150px]" />
                  <col />
                  <col className="w-[160px]" />
                </colgroup>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3" />
                    <th className="px-3 py-3" />
                    <th className="px-3 py-3" />
                    <th
                      className="px-3 py-3 font-semibold"
                      aria-sort={glossaryAriaSort(tableSort, "az")}
                    >
                      <GlossarySortHeader
                        label="Term"
                        sortValue="az"
                        tableSort={tableSort}
                        onSort={updateTableSort}
                      />
                    </th>
                    <th className="px-3 py-3 font-semibold">Synonyms</th>
                    <th className="px-3 py-3 font-semibold">Categories</th>
                    <th className="px-3 py-3 font-semibold">Definition</th>
                    <th className="px-3 py-3 font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {pageRows.map((row) => (
                    <GlossaryTableRow
                      key={row.entry.id}
                      row={row}
                      entryById={entryById}
                      onEdit={openEditForm}
                      onFavorite={toggleFavorite}
                      onToggleExpansion={toggleEntryExpansion}
                    />
                  ))}
                </tbody>
              </table>
            </StickyHorizontalScroll>
          </div>
        ) : (
          <div className="flex min-h-56 items-center justify-center rounded-lg border border-slate-200 bg-white px-6 py-12 shadow-sm">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-sakura-50 text-sm font-bold text-sakura-600">
                GL
              </div>
              <h3 className="text-base font-semibold text-slate-950">
                No glossary entries found
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Try a different search term or category filter, or add a new
                Glossary entry.
              </p>
            </div>
          </div>
        )}
      </section>

      <footer className="rounded-lg border border-sakura-100 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
        Glossary entries are independent from Video, Image, Performer, and
        Category catalog metadata.
      </footer>
      <ConfirmDialog
        open={confirmation !== null}
        title={glossaryConfirmationCopy(confirmation, formMode).title}
        description={glossaryConfirmationCopy(confirmation, formMode).description}
        confirmLabel={glossaryConfirmationCopy(confirmation, formMode).confirmLabel}
        variant={confirmation === "delete" ? "destructive" : "default"}
        pending={isSubmitting}
        pendingLabel={glossaryConfirmationCopy(confirmation, formMode).pendingLabel}
        onCancel={closeConfirmation}
        onConfirm={() => void confirmCurrentAction()}
      />
    </div>
  );
}

function GlossaryTableRow({
  row,
  entryById,
  onEdit,
  onFavorite,
  onToggleExpansion,
}: {
  row: GlossaryTableDisplayRow;
  entryById: Map<string, GlossaryEntry>;
  onEdit: (entry: GlossaryEntry) => void;
  onFavorite: (entry: GlossaryEntry) => void;
  onToggleExpansion: (entryId: string) => void;
}) {
  const { entry, depth, childCount, expanded } = row;
  const synonyms = parseTextLabelArray(entry.synonymsJson);
  const sourceLabel = entry.sourceTitle.trim() || shortSourceUrl(entry.sourceUrl);
  const categoryLabel = categoryDisplayLabel(entry, entryById);
  const hasChildren = childCount > 0;
  const childIndentClass = depth > 0 ? "ml-6" : "";

  const stopRowAction = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <tr
      className={[
        "cursor-pointer align-middle transition hover:bg-sakura-50/40",
        childCount > 0
          ? "bg-slate-100/70"
          : depth > 0
            ? "bg-slate-50/40"
            : "bg-white",
      ].join(" ")}
      tabIndex={0}
      onClick={() => onEdit(entry)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit(entry);
        }
      }}
      aria-label={`Edit glossary entry ${entry.term}`}
      data-glossary-row-depth={depth}
      data-glossary-row-kind={childCount > 0 ? "parent" : depth > 0 ? "child" : "root"}
      data-glossary-child-indent={depth > 0 ? "from-thumbnail" : undefined}
    >
      <td
        className="px-3 py-2.5"
        style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              stopRowAction(event);
              onToggleExpansion(entry.id);
            }}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600"
            aria-label={`${expanded ? "Collapse" : "Expand"} glossary children for ${entry.term}`}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span
            className="block size-7"
            aria-hidden="true"
            data-glossary-hierarchy-spacer="true"
          />
        )}
      </td>
      <td className="w-16 px-3 py-2.5">
        <div className={`inline-flex size-11 shrink-0 ${childIndentClass}`}>
          <ThumbnailPreview entry={entry} />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <button
          type="button"
          onClick={(event) => {
            stopRowAction(event);
            onFavorite(entry);
          }}
          className={`inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600 ${childIndentClass}`}
          aria-label={`Toggle favorite ${entry.term}`}
          title={entry.favorite ? "Remove favorite" : "Favorite"}
        >
          <Star
            size={16}
            className={entry.favorite ? "fill-sakura-400 text-sakura-500" : ""}
          />
        </button>
      </td>
      <td className="px-3 py-2.5 overflow-hidden">
        <div className={`flex min-w-0 items-center gap-2 overflow-hidden ${childIndentClass}`}>
          <span
            className="block min-w-0 truncate font-medium text-slate-950"
            title={entry.term || "N/A"}
          >
            {entry.term || "N/A"}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 overflow-hidden">
        {synonyms.length > 0 ? (
          <span
            className={`inline-flex max-w-full overflow-hidden rounded-md bg-sakura-50 px-2 py-1 text-xs font-semibold text-sakura-600 ${childIndentClass}`}
            title={synonyms.join(", ")}
            aria-label={`Synonyms: ${synonyms.join(", ")}`}
          >
            +{synonyms.length}
          </span>
        ) : (
          <span className={`text-slate-400 ${childIndentClass}`}>N/A</span>
        )}
      </td>
      <td className="px-3 py-2.5 overflow-hidden">
        <span
          className={`inline-flex max-w-full min-w-0 shrink overflow-hidden rounded-md bg-sakura-50 px-2.5 py-1 text-xs font-semibold text-sakura-600 ${childIndentClass}`}
          title={categoryLabel}
        >
          <span className="truncate">{categoryLabel}</span>
        </span>
      </td>
      <td className="px-3 py-2.5 overflow-hidden">
        <p className={`truncate text-sm leading-6 text-slate-600 ${childIndentClass}`} title={entry.definition || "N/A"}>
          {entry.definition || "N/A"}
        </p>
      </td>
      <td className="px-3 py-2.5 overflow-hidden">
        {entry.sourceUrl.trim() ? (
          <a
            href={entry.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className={`block truncate overflow-hidden text-sm font-medium text-sakura-600 hover:text-sakura-700 ${childIndentClass}`}
            title={sourceLabel || "N/A"}
            aria-label={`Open source ${sourceLabel || "N/A"}`}
            onClick={stopRowAction}
          >
            {sourceLabel || "N/A"}
          </a>
        ) : (
          <span className={`text-slate-400 ${childIndentClass}`}>N/A</span>
        )}
      </td>
    </tr>
  );
}

function GlossarySortHeader({
  label,
  sortValue,
  tableSort,
  onSort,
}: {
  label: string;
  sortValue: GlossarySortKey;
  tableSort: GlossaryTableSortState;
  onSort: (value: GlossarySortKey) => void;
}) {
  const active = tableSort?.value === sortValue;
  return (
    <button
      type="button"
      aria-label={`Sort by ${label}`}
      className={[
        "inline-flex max-w-full items-center gap-1 text-left font-semibold transition hover:text-sakura-600 focus:outline-none",
        active ? "text-sakura-700" : "",
      ].join(" ")}
      onClick={() => onSort(sortValue)}
    >
      <span className="truncate">{label}</span>
      {active && (
        <span aria-hidden="true" className="text-[10px] text-slate-500">
          {tableSort.direction === "ascending" ? "↑" : "↓"}
        </span>
      )}
    </button>
  );
}

function glossaryAriaSort(
  tableSort: GlossaryTableSortState,
  sortValue: GlossarySortKey,
) {
  return tableSort?.value === sortValue ? tableSort.direction : undefined;
}

function ThumbnailPreview({ entry }: { entry: GlossaryEntry }) {
  const src = thumbnailSrc(entry.thumbnailPath);
  if (src) {
    return (
      <img
        src={src}
        alt={`${entry.term} thumbnail`}
        className="glossary-thumbnail-box aspect-square size-11 shrink-0 rounded-lg border border-sakura-100 object-cover"
        data-testid="glossary-thumbnail"
      />
    );
  }

  return (
    <div
      className="glossary-thumbnail-box flex aspect-square size-11 shrink-0 items-center justify-center rounded-lg border border-sakura-100 bg-sakura-50 text-sakura-500"
      data-testid="glossary-thumbnail-placeholder"
      aria-label={`${entry.term} thumbnail not available`}
    >
      <BookOpenText size={20} aria-hidden="true" />
    </div>
  );
}

function SwitchField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-11 items-center gap-3 self-end text-sm font-medium text-slate-700">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Favorite"
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-7 w-12 shrink-0 rounded-full border transition",
          checked
            ? "border-sakura-400 bg-sakura-500"
            : "border-slate-300 bg-slate-100",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-1 size-5 rounded-full bg-white shadow transition",
            checked ? "left-6" : "left-1",
          ].join(" ")}
        />
      </button>
      Mark this entry as favorite
    </label>
  );
}

function GlossaryParentPicker({
  value,
  options,
  entryById,
  open,
  search,
  onOpenChange,
  onSearchChange,
  onChange,
  ariaLabel,
  placeholder,
}: {
  value: string;
  options: GlossaryEntry[];
  entryById: Map<string, GlossaryEntry>;
  open: boolean;
  search: string;
  onOpenChange: (open: boolean) => void;
  onSearchChange: (search: string) => void;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
}) {
  const selected = value ? entryById.get(value) ?? null : null;
  const displayValue = open
    ? search
    : selected
      ? parentPathLabel(selected, entryById)
      : "No parent";
  const query = search.trim().toLowerCase();
  const filteredOptions = options.filter((entry) =>
    parentPathLabel(entry, entryById).toLowerCase().includes(query),
  );

  return (
      <PickerShell
      open={open}
      onOpenChange={onOpenChange}
      onSearchChange={onSearchChange}
      displayValue={displayValue}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      listboxLabel={`${ariaLabel} options`}
    >
      <PickerOption
        label="No parent"
        ariaLabel="Select no parent"
        metaLabel="N/A"
        onSelect={() => {
          onChange("");
          onOpenChange(false);
          onSearchChange("");
        }}
      />
      {filteredOptions.map((entry) => (
        <PickerOption
          key={entry.id}
          label={parentPathLabel(entry, entryById)}
          query={search}
          ariaLabel={`Select glossary parent ${parentPathLabel(entry, entryById)}`}
          metaLabel={glossaryRoleLabel(entry, options)}
          onSelect={() => {
            onChange(entry.id);
            onOpenChange(false);
            onSearchChange("");
          }}
        />
      ))}
      {filteredOptions.length === 0 && (
        <p className="px-4 py-3 text-sm font-medium text-slate-500">
          No matching glossary terms.
        </p>
      )}
    </PickerShell>
  );
}

function GlossaryParentFilter({
  value,
  open,
  onOpenChange,
  onChange,
}: {
  value: GlossaryFilterValue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: GlossaryFilterValue) => void;
}) {
  const activeFilterCount = value === "all" ? 0 : 1;

  return (
    <div
      className="relative min-w-0 shrink-0 sm:w-auto"
      onBlur={() => {
        window.setTimeout(() => onOpenChange(false), 120);
      }}
    >
      <div
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="glossary-category-filter-control"
        className={[
          "flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border bg-white px-3 text-left text-sm font-semibold transition focus-within:ring-4 sm:w-auto",
          open
            ? "border-sakura-400 ring-sakura-100"
            : "border-slate-200 hover:border-sakura-200 focus-within:border-sakura-300 focus-within:ring-sakura-100",
        ].join(" ")}
        onClick={() => {
          onOpenChange(true);
        }}
      >
        <Filter size={18} className="shrink-0 text-slate-500" />
        <span className="hidden text-sm font-semibold text-slate-700 sm:inline">
          Filter
        </span>
        <span
          aria-label={`${activeFilterCount} active filters`}
          data-testid="glossary-category-filter-badge"
          className={[
            "shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold",
            activeFilterCount > 0
              ? "bg-sakura-50 text-sakura-700"
              : "bg-slate-50 text-slate-500",
          ].join(" ")}
        >
          {activeFilterCount}
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 text-slate-400"
          data-testid="glossary-category-filter-chevron"
        />
      </div>
      {open && (
        <div
          role="listbox"
          aria-label="Category filter options"
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          {glossaryFilterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              className={`flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold transition ${
                value === option.value
                  ? "bg-sakura-50 text-sakura-700"
                  : "bg-white text-slate-700 hover:bg-sakura-50 hover:text-sakura-700"
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                onOpenChange(false);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {value === option.value && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SortPicker({
  value,
  open,
  search,
  onOpenChange,
  onSearchChange,
  onChange,
}: {
  value: GlossarySortKey;
  open: boolean;
  search: string;
  onOpenChange: (open: boolean) => void;
  onSearchChange: (search: string) => void;
  onChange: (value: GlossarySortKey) => void;
}) {
  const selectedLabel =
    sortOptions.find((option) => option.value === value)?.label ?? "Term A-Z";
  void search;

  return (
    <PickerShell
      open={open}
      onOpenChange={onOpenChange}
      onSearchChange={onSearchChange}
      displayValue={selectedLabel}
      placeholder="Sort"
      ariaLabel="Sort"
      listboxLabel="Sort options"
      icon={<ArrowUpDown size={18} />}
      testId="glossary-sort-control"
      buttonTrigger
    >
      {sortOptions.map((option) => (
        <PickerOption
          key={option.value}
          label={option.label}
          ariaLabel={`Select sort ${option.label}`}
          selected={option.value === value}
          onSelect={() => {
            onChange(option.value);
            onOpenChange(false);
            onSearchChange("");
          }}
        />
      ))}
    </PickerShell>
  );
}

function PickerShell({
  open,
  onOpenChange,
  onSearchChange,
  displayValue,
  placeholder,
  ariaLabel,
  listboxLabel,
  icon,
  badgeLabel,
  testId,
  dropdownSearchValue,
  dropdownSearchPlaceholder,
  buttonTrigger = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearchChange: (search: string) => void;
  displayValue: string;
  placeholder: string;
  ariaLabel: string;
  listboxLabel: string;
  icon?: ReactNode;
  badgeLabel?: string;
  testId?: string;
  dropdownSearchValue?: string;
  dropdownSearchPlaceholder?: string;
  buttonTrigger?: boolean;
  children: ReactNode;
}) {
  const badgeActive = Boolean(badgeLabel && badgeLabel !== "0");
  return (
    <div
      className={buttonTrigger ? "relative min-w-0 shrink-0 sm:w-auto" : "relative mt-1"}
      onBlur={() => {
        window.setTimeout(() => {
          onOpenChange(false);
          onSearchChange("");
        }, 120);
      }}
    >
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
        {icon ?? <Search size={18} />}
      </span>
      {buttonTrigger ? (
        <button
          type="button"
          aria-label={ariaLabel}
          aria-expanded={open}
          data-testid={testId}
          className={[
            "flex h-11 w-full max-w-full items-center justify-between gap-3 rounded-lg border bg-white pl-12 pr-3 text-sm font-medium text-slate-700 outline-none transition sm:w-44",
            open
              ? "border-sakura-400 ring-4 ring-sakura-100"
              : "border-slate-200 hover:border-sakura-200 hover:text-sakura-600 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100",
          ].join(" ")}
          onFocus={() => {
            onOpenChange(true);
            onSearchChange("");
          }}
          onClick={() => {
            onOpenChange(!open);
            onSearchChange("");
          }}
        >
          <span
            className="flex min-w-0 flex-1 items-center gap-2"
            data-testid={badgeLabel ? "glossary-category-filter-label" : undefined}
          >
            <span className="truncate">{displayValue}</span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {badgeLabel && (
              <span
                aria-label={`Selected category filters: ${badgeLabel}`}
                data-testid="glossary-category-filter-badge"
                className={[
                  "inline-flex min-w-6 items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-bold",
                  badgeActive
                    ? "bg-sakura-50 text-sakura-700"
                    : "bg-slate-50 text-slate-500",
                ].join(" ")}
              >
                {badgeLabel}
              </span>
            )}
            <ChevronDown
              size={18}
              className="text-slate-500"
              data-testid={badgeLabel ? "glossary-category-filter-chevron" : undefined}
            />
          </span>
        </button>
      ) : (
        <input
          aria-label={ariaLabel}
          value={displayValue}
          placeholder={placeholder}
          data-testid={testId}
          className={[
            "h-11 w-full select-text rounded-lg border bg-white pl-12 pr-11 text-sm font-medium text-slate-700 outline-none transition selection:bg-sakura-100 selection:text-slate-900 placeholder:text-slate-400",
            open
              ? "border-sakura-400 ring-4 ring-sakura-100"
              : "border-slate-200 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100",
          ].join(" ")}
          onFocus={() => {
            onOpenChange(true);
            onSearchChange("");
          }}
          onChange={(event) => {
            onOpenChange(true);
            onSearchChange(event.target.value);
          }}
        />
      )}
      {!buttonTrigger && (
        <ChevronDown
          size={18}
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
        />
      )}

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          {buttonTrigger && dropdownSearchValue !== undefined && (
            <label className="relative mb-1 block">
              <span className="sr-only">{dropdownSearchPlaceholder ?? "Search options"}</span>
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={dropdownSearchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-2 focus:ring-sakura-100"
                placeholder={dropdownSearchPlaceholder ?? "Search options..."}
              />
            </label>
          )}
          <div
            className="max-h-64 overflow-y-auto"
            role="listbox"
            aria-label={listboxLabel}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarCategoryOption({
  label,
  query = "",
  ariaLabel,
  title,
  statusLabel,
  selected = false,
  onSelect,
}: {
  label: string;
  query?: string;
  ariaLabel: string;
  title?: string;
  statusLabel: string;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "grid h-10 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 overflow-hidden rounded-md px-3 text-left text-sm font-medium transition-colors hover:bg-sakura-50 hover:text-sakura-700 focus:bg-sakura-50 focus:outline-none",
        selected ? "bg-sakura-50 text-sakura-700" : "bg-white text-slate-700",
      ].join(" ")}
      aria-label={ariaLabel}
      aria-selected={selected}
      title={title ?? label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
    >
      <span className="min-w-0 truncate whitespace-nowrap font-semibold">
        <HighlightedText text={label} query={query} />
      </span>
      <span className="shrink-0 rounded-md border border-sakura-100 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
        {statusLabel}
      </span>
      <span className="flex size-5 shrink-0 items-center justify-center">
        {selected && (
          <Check size={17} className="text-sakura-600" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}

function PickerOption({
  label,
  query = "",
  ariaLabel,
  metaLabel,
  selected = false,
  showSelectedCheck = false,
  onSelect,
}: {
  label: string;
  query?: string;
  ariaLabel: string;
  metaLabel?: string;
  selected?: boolean;
  showSelectedCheck?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "grid h-10 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-md px-3 text-left text-sm font-medium transition-colors hover:bg-sakura-50 hover:text-sakura-700 focus:bg-sakura-50 focus:outline-none",
        selected ? "bg-sakura-50 text-sakura-700" : "text-slate-700",
      ].join(" ")}
      aria-label={ariaLabel}
      aria-selected={selected}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
    >
      <span className="min-w-0 truncate whitespace-nowrap font-semibold" title={label}>
        <HighlightedText text={label} query={query} />
      </span>
      {metaLabel && (
        <span className="shrink-0 rounded-md border border-sakura-100 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
          {metaLabel}
        </span>
      )}
      {showSelectedCheck && selected && (
        <Check size={17} className="shrink-0 text-sakura-600" aria-hidden="true" />
      )}
    </button>
  );
}

function FieldErrorLabel({
  label,
  required = false,
  error,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block text-sm font-medium text-slate-700 ${className}`}>
      <span>
        {label}
        {required && (
          <span className="text-sakura-500" aria-hidden="true">
            {" *"}
          </span>
        )}
      </span>
      {children}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </label>
  );
}

function sortGlossaryEntries(
  left: GlossaryEntry,
  right: GlossaryEntry,
  sortKey: GlossarySortKey,
  directionOverride?: "ascending" | "descending",
) {
  if (sortKey === "az") {
    const compared = left.term.localeCompare(right.term);
    return directionOverride === "descending" ? -compared : compared;
  }
  if (sortKey === "za") {
    const compared = left.term.localeCompare(right.term);
    return directionOverride === "ascending" ? compared : -compared;
  }
  if (sortKey === "created-desc") {
    const compared =
      directionOverride === "ascending"
        ? left.createdAt - right.createdAt
        : right.createdAt - left.createdAt;
    return compared || left.term.localeCompare(right.term);
  }
  const compared =
    directionOverride === "ascending"
      ? left.updatedAt - right.updatedAt
      : right.updatedAt - left.updatedAt;
  return compared || left.term.localeCompare(right.term);
}

function buildGlossaryTableRows({
  entries,
  filteredEntries,
  expandedEntryIds,
  sortKey,
  sortDirection,
  hierarchical,
}: {
  entries: GlossaryEntry[];
  filteredEntries: GlossaryEntry[];
  expandedEntryIds: Set<string>;
  sortKey: GlossarySortKey;
  sortDirection?: "ascending" | "descending";
  hierarchical: boolean;
}): GlossaryTableDisplayRow[] {
  if (!hierarchical) {
    const filteredIds = new Set(filteredEntries.map((entry) => entry.id));
    const childCountFor = (entry: GlossaryEntry) =>
      entries.filter((candidate) => candidate.parentId === entry.id).length;
    const parents = filteredEntries.filter((entry) => childCountFor(entry) > 0);
    const children = filteredEntries.filter(
      (entry) => entry.parentId && filteredIds.has(entry.parentId),
    );
    const standalone = filteredEntries.filter(
      (entry) => !entry.parentId && childCountFor(entry) === 0,
    );
    const orphans = filteredEntries.filter(
      (entry) => entry.parentId && !filteredIds.has(entry.parentId),
    );
    const orderedEntries: GlossaryEntry[] = [];
    const emittedIds = new Set<string>();
    const appendUnique = (items: GlossaryEntry[]) => {
      for (const entry of items) {
        if (emittedIds.has(entry.id)) {
          continue;
        }
        orderedEntries.push(entry);
        emittedIds.add(entry.id);
      }
    };

    appendUnique(parents);
    appendUnique(children);
    appendUnique(standalone);
    appendUnique(orphans);

    return orderedEntries.map((entry) => ({
      entry,
      depth: entry.parentId ? 1 : 0,
      childCount: childCountFor(entry),
      expanded: expandedEntryIds.has(entry.id),
    }));
  }

  const childrenByParent = new Map<string, GlossaryEntry[]>();
  for (const entry of entries) {
    const parentId = entry.parentId || "";
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), entry]);
  }
  for (const [parentId, children] of childrenByParent) {
    childrenByParent.set(
      parentId,
      [...children].sort((left, right) =>
        sortGlossaryEntries(left, right, sortKey, sortDirection),
      ),
    );
  }

  const rows: GlossaryTableDisplayRow[] = [];
  const visit = (entry: GlossaryEntry, depth: number) => {
    const children = childrenByParent.get(entry.id) ?? [];
    rows.push({
      entry,
      depth,
      childCount: children.length,
      expanded: expandedEntryIds.has(entry.id),
    });
    if (!expandedEntryIds.has(entry.id)) {
      return;
    }
    for (const child of children) {
      visit(child, depth + 1);
    }
  };

  const rootEntries = childrenByParent.get("") ?? [];
  const parentRootEntries = rootEntries.filter((entry) =>
    (childrenByParent.get(entry.id) ?? []).length > 0,
  );
  const standaloneRootEntries = rootEntries.filter((entry) =>
    (childrenByParent.get(entry.id) ?? []).length === 0,
  );

  for (const rootEntry of parentRootEntries) {
    visit(rootEntry, 0);
  }
  for (const rootEntry of standaloneRootEntries) {
    visit(rootEntry, 0);
  }

  return rows;
}

function defaultGlossaryExpandedEntryIds(entries: GlossaryEntry[]) {
  return new Set(
    entries
      .filter((entry) => entries.some((candidate) => candidate.parentId === entry.id))
      .map((entry) => entry.id),
  );
}

function normalizeGlossaryFilterValue(value: GlossarySessionFilters["parentFilter"]): GlossaryFilterValue {
  if (value === "parent" || value === "child") {
    return value;
  }
  return "all";
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return <>{text}</>;
  }

  const matchIndex = text.toLowerCase().indexOf(trimmedQuery.toLowerCase());
  if (matchIndex < 0) {
    return <>{text}</>;
  }

  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + trimmedQuery.length);
  const after = text.slice(matchIndex + trimmedQuery.length);

  return (
    <>
      {before}
      <mark className="rounded-sm bg-sakura-100 px-0 text-slate-900">
        {match}
      </mark>
      {after}
    </>
  );
}

function parentPathLabel(entry: GlossaryEntry, entryById: Map<string, GlossaryEntry>) {
  const path = [entry.term];
  let parentId = entry.parentId;
  const visited = new Set([entry.id]);
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = entryById.get(parentId);
    if (!parent) {
      break;
    }
    path.unshift(parent.term);
    parentId = parent.parentId;
  }
  return path.join(" > ");
}

function compactCategoryPathLabel(path: string) {
  const segments = path
    .split(">")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length <= 1) {
    return segments[0] ?? path;
  }
  if (segments.length === 2) {
    return `${abbreviateCategorySegment(segments[0])} > ${segments[1]}`;
  }
  return `... > ${abbreviateCategorySegment(segments[segments.length - 2])} > ${
    segments[segments.length - 1]
  }`;
}

function abbreviateCategorySegment(segment: string) {
  if (segment.length <= 3) {
    return segment;
  }
  return segment.slice(0, 3);
}

function scrollFormIntoView(element: HTMLElement | null) {
  if (typeof element?.scrollIntoView !== "function") {
    return;
  }

  element.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function categoryDisplayLabel(entry: GlossaryEntry, entryById: Map<string, GlossaryEntry>) {
  if (entry.parentId) {
    const parent = entryById.get(entry.parentId);
    return parent ? parentPathLabel(parent, entryById) : "Parent unavailable";
  }
  return entry.category || "N/A";
}

function glossaryRoleLabel(entry: GlossaryEntry, entries: GlossaryEntry[]) {
  const entryById = new Map(entries.map((candidate) => [candidate.id, candidate]));
  const hasParent = Boolean(entry.parentId);
  const hasChildren = entries.some((candidate) => candidate.parentId === entry.id);
  const depth = glossaryDepth(entry, entryById);

  if (!hasParent && !hasChildren) {
    return "N/A";
  }
  if (!hasParent && hasChildren) {
    return "Parent";
  }
  if (hasChildren || depth > 1) {
    return "Sub-Parent";
  }
  return "Child";
}

function glossaryDepth(entry: GlossaryEntry, entryById: Map<string, GlossaryEntry>) {
  let depth = 0;
  let parentId = entry.parentId;
  const visited = new Set([entry.id]);

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = entryById.get(parentId);
    if (!parent) {
      break;
    }
    depth += 1;
    parentId = parent.parentId;
  }

  return depth;
}

function isDescendantEntry(
  candidateId: string,
  entryId: string,
  entryById: Map<string, GlossaryEntry>,
) {
  if (!entryId) {
    return false;
  }
  let parentId = entryById.get(candidateId)?.parentId ?? "";
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    if (parentId === entryId) {
      return true;
    }
    visited.add(parentId);
    parentId = entryById.get(parentId)?.parentId ?? "";
  }
  return false;
}

function mergeSynonymDraft(synonyms: string[], draft: string) {
  const merged = [...synonyms];
  for (const synonym of draft.split(",").map((value) => value.trim()).filter(Boolean)) {
    if (!merged.some((value) => value.toLowerCase() === synonym.toLowerCase())) {
      merged.push(synonym);
    }
  }
  return merged;
}

function shortSourceUrl(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return sourceUrl;
  }
}

function thumbnailSrc(path: string) {
  const trimmedPath = path.trim();
  if (!trimmedPath) {
    return "";
  }
  return window.__TAURI_INTERNALS__?.convertFileSrc?.(trimmedPath) ?? trimmedPath;
}

const inputClassName =
  "mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100";

const secondaryButtonClassName =
  "h-11 rounded-lg border border-slate-300 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50";

const paginationButtonClassName =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-500 disabled:opacity-50";

function buildGlossaryPaginationPages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

export default GlossaryPage;
