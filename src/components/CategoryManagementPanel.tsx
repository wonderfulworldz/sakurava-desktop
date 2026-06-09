import {
  Check,
  ChevronDown,
  ChevronRight,
  Grid2X2,
  Image,
  List,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Tags,
  Trash2,
  UserRound,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ManagedCategory } from "../backend/types";
import {
  MANAGED_CATEGORY_DESCRIPTION_MAX_LENGTH,
  countManagedCategoryUsage,
  findManagedCategoryDescendantKeys,
} from "../backend/managedCategoryModel";
import CategoryCatalogCard from "./CategoryCatalogCard";
import {
  CATALOG_PAGE_SIZE_OPTIONS,
  DEFAULT_CATALOG_PAGE_SIZE,
  type CatalogPageSize,
} from "../lib/catalogPagination";
import { getStoredManagedCategories, storeManagedCategories } from "../lib/managedCategories";
import { selectLocalImageFile } from "../runtime/dialogCommands";
import { localImagePathToAssetSrc } from "../runtime/localAsset";
import {
  createManagedCategory,
  deleteManagedCategory,
  listManagedCategories,
  updateManagedCategory,
} from "../runtime/managedCategoryCommands";
import { listImages } from "../runtime/imageCommands";
import { listPerformers } from "../runtime/performerCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";
import { listVideos } from "../runtime/videoCommands";
import ConfirmDialog from "./ConfirmDialog";

type FormState = {
  name: string;
  thumbnailPath: string;
  parentKey: string;
  description: string;
  showInVideos: boolean;
  showInImages: boolean;
  showInPerformers: boolean;
};

type StatusState =
  | { state: "idle" }
  | { state: "pending"; message: string }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type CategoryConfirmation = "save" | "delete" | "discard" | null;
type FormErrors = Partial<Record<keyof FormState | "parent", string>>;

type FilterValue =
  | "all"
  | "parent-only"
  | "child-only"
  | "videos"
  | "images"
  | "performers"
  | "active"
  | "unused";
type ActiveFilterValue = Exclude<FilterValue, "all">;
type CategoryFilterOption = {
  value: FilterValue;
  label: string;
  chipLabel: string;
  chipPrefix: string;
};
type ActiveCategoryFilterOption = CategoryFilterOption & {
  value: ActiveFilterValue;
};
type SortValue =
  | "name"
  | "usage-desc"
  | "usage-asc"
  | "updated-desc"
  | "created-desc";
type ViewValue = "card" | "table";

const parentPickerRowStyles =
  "group grid h-12 w-full grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-4";
const categoryTableThumbnailClassName =
  "category-table-thumbnail-box aspect-square size-11 h-11 w-11 min-h-11 min-w-11 max-h-11 max-w-11 shrink-0 overflow-hidden rounded-lg";
const filterOptions: CategoryFilterOption[] = [
  { value: "all", label: "All", chipLabel: "All", chipPrefix: "Filter" },
  { value: "parent-only", label: "Parent categories", chipLabel: "Parent", chipPrefix: "Parent" },
  { value: "child-only", label: "Child categories", chipLabel: "Child", chipPrefix: "Parent" },
  { value: "videos", label: "Used by Videos", chipLabel: "Videos", chipPrefix: "Usage" },
  { value: "images", label: "Used by Images", chipLabel: "Images", chipPrefix: "Usage" },
  { value: "performers", label: "Used by Performers", chipLabel: "Performers", chipPrefix: "Usage" },
  { value: "active", label: "In Use", chipLabel: "Active", chipPrefix: "Status" },
  { value: "unused", label: "Unused", chipLabel: "Unused", chipPrefix: "Status" },
];
const selectableFilterOptions = filterOptions.filter(
  (option): option is ActiveCategoryFilterOption => option.value !== "all",
);
const sortOptions: Array<{ value: SortValue; label: string }> = [
  { value: "name", label: "Name A-Z" },
  { value: "usage-desc", label: "Usage high-low" },
  { value: "usage-asc", label: "Usage low-high" },
  { value: "updated-desc", label: "Last Updated" },
  { value: "created-desc", label: "Last Added" },
];

const emptyForm: FormState = {
  name: "",
  thumbnailPath: "",
  parentKey: "",
  description: "",
  showInVideos: true,
  showInImages: true,
  showInPerformers: true,
};

const emptyRecords = {
  videos: [] as Array<{ categoriesJson: string }>,
  images: [] as Array<{ categoriesJson: string }>,
  performers: [] as Array<{ categoriesJson: string }>,
};

type CategoryUsageRow = {
  category: ManagedCategory;
  parent: ManagedCategory | null;
  usage: {
    videos: number;
    images: number;
    performers: number;
    total: number;
  };
  childCount: number;
};

type CategoryTableDisplayRow = CategoryUsageRow & {
  kind: "parent" | "child" | "standalone";
  children: CategoryUsageRow[];
};

function CategoryManagementPanel() {
  const isDesktopRuntime = isTauriRuntimeAvailable();
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [records, setRecords] = useState(emptyRecords);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formVisible, setFormVisible] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<ActiveFilterValue[]>([]);
  const [sort, setSort] = useState<SortValue>("name");
  const [view, setView] = useState<ViewValue>("table");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [expandedParentKeys, setExpandedParentKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<CatalogPageSize>(
    DEFAULT_CATALOG_PAGE_SIZE,
  );
  const [status, setStatus] = useState<StatusState>({ state: "idle" });
  const [confirmation, setConfirmation] = useState<CategoryConfirmation>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [cleanFormSnapshot, setCleanFormSnapshot] = useState(() =>
    categoryFormSnapshot(emptyForm),
  );
  const formSectionRef = useRef<HTMLElement | null>(null);

  const editingCategory = useMemo(
    () => categories.find((category) => category.key === editingKey) ?? null,
    [categories, editingKey],
  );

  const descendantKeys = useMemo(
    () =>
      editingKey
        ? new Set(findManagedCategoryDescendantKeys(categories, editingKey))
        : new Set<string>(),
    [categories, editingKey],
  );

  const rows = useMemo(() => {
    const childCounts = new Map<string, number>();
    for (const category of categories) {
      if (category.parentKey) {
        childCounts.set(
          category.parentKey,
          (childCounts.get(category.parentKey) ?? 0) + 1,
        );
      }
    }

    const usageByKey = new Map(
      categories.map((category) => [
        category.key,
        countManagedCategoryUsage(category.name, records),
      ]),
    );
    const childKeysByParentKey = new Map<string, string[]>();
    for (const category of categories) {
      if (!category.parentKey) {
        continue;
      }
      childKeysByParentKey.set(category.parentKey, [
        ...(childKeysByParentKey.get(category.parentKey) ?? []),
        category.key,
      ]);
    }

    const query = search.trim().toLowerCase();
    const withUsage = categories.map((category) => {
      const ownUsage =
        usageByKey.get(category.key) ?? createEmptyCategoryUsageCounts();
      const childKeys = childKeysByParentKey.get(category.key) ?? [];
      const usage = childKeys.reduce(
        (total, childKey) =>
          addCategoryUsageCounts(
            total,
            usageByKey.get(childKey) ?? createEmptyCategoryUsageCounts(),
          ),
        ownUsage,
      );
      const parent = category.parentKey
        ? categories.find((item) => item.key === category.parentKey) ?? null
        : null;

      return {
        category,
        parent,
        usage,
        childCount: childCounts.get(category.key) ?? 0,
      };
    });

    return withUsage
      .filter((row) => {
        if (!query) {
          return true;
        }

        return [row.category.name, row.category.description, row.parent?.name ?? "No Parent"].some(
          (value) => value.toLowerCase().includes(query),
        );
      })
      .filter((row) => {
        if (selectedFilters.length === 0) {
          return true;
        }

        return selectedFilters.some((filter) =>
          matchesCategoryFilter(row, filter),
        );
      })
      .sort((first, second) => {
        if (sort === "usage-desc") {
          return second.usage.total - first.usage.total;
        }
        if (sort === "usage-asc") {
          return first.usage.total - second.usage.total;
        }
        if (sort === "updated-desc") {
          return compareTimestampDesc(
            first.category.updatedAt,
            second.category.updatedAt,
          );
        }
        if (sort === "created-desc") {
          return compareTimestampDesc(
            first.category.createdAt,
            second.category.createdAt,
          );
        }
        return first.category.name.localeCompare(second.category.name, undefined, {
          sensitivity: "base",
        });
      });
  }, [categories, records, search, selectedFilters, sort]);

  const numericRowsPerPage = Number(rowsPerPage);
  const totalPages = Math.max(1, Math.ceil(rows.length / numericRowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * numericRowsPerPage;
  const paginatedRows = rows.slice(pageStartIndex, pageStartIndex + numericRowsPerPage);
  const rangeStart = rows.length === 0 ? 0 : pageStartIndex + 1;
  const rangeEnd = Math.min(pageStartIndex + numericRowsPerPage, rows.length);
  const rangeText =
    rows.length === 0
      ? "Showing 0 of 0"
      : `Showing ${rangeStart}-${rangeEnd} of ${rows.length}`;

  useEffect(() => {
    setCurrentPage(1);
  }, [rowsPerPage, search, selectedFilters, sort]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setStatus({ state: "pending", message: "Loading categories..." });

        if (!isDesktopRuntime) {
          const localCategories = getStoredManagedCategories().map(
            (name, index): ManagedCategory => ({
              key: `local-${index}`,
              name,
              parentKey: null,
              description: "",
              thumbnailPath: "",
              showInVideos: true,
              showInImages: true,
              showInPerformers: true,
              createdAt: "",
              updatedAt: "",
            }),
          );
          if (!cancelled) {
            setExpandedParentKeys(defaultExpandedParentKeys(localCategories));
            setCategories(localCategories);
            setRecords(emptyRecords);
            setStatus({
              state: "idle",
            });
          }
          return;
        }

        const [videos, images, performers] = await Promise.all([
          listVideos(),
          listImages(),
          listPerformers(),
        ]);
        const migrated = await migrateLegacyManagedCategories();
        const nextCategories = migrated.length ? migrated : await listManagedCategories();
        storeManagedCategories(nextCategories.map((category) => category.name));

        if (!cancelled) {
          setExpandedParentKeys(defaultExpandedParentKeys(nextCategories));
          setRecords({ videos, images, performers });
          setCategories(nextCategories);
          setStatus({ state: "idle" });
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            state: "error",
            message: formatError(error, "Category data could not be loaded."),
          });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [isDesktopRuntime]);

  async function refreshCategories(message?: string) {
    const nextCategories = await listManagedCategories();
    storeManagedCategories(nextCategories.map((category) => category.name));
    setExpandedParentKeys(defaultExpandedParentKeys(nextCategories));
    setCategories(nextCategories);
    if (message) {
      setStatus({ state: "success", message });
    }
    return nextCategories;
  }

  async function handleSubmit() {
    if (!isDesktopRuntime) {
      setStatus({
        state: "error",
        message: "Category metadata requires the desktop runtime.",
      });
      return;
    }

    const validationErrors = validateCategoryForm({
      form,
      categories,
      editingKey,
      descendantKeys,
      editingCategoryHasChildren,
      editingCategoryUsage,
    });
    setFormErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setStatus({
        state: "error",
        message: "Resolve the highlighted category fields before saving.",
      });
      return;
    }

    const selectedParentKey = form.parentKey || null;
    if (
      editingKey &&
      selectedParentKey &&
      (selectedParentKey === editingKey || descendantKeys.has(selectedParentKey))
    ) {
      setStatus({
        state: "error",
        message: "A category cannot use itself or its child category as parent.",
      });
      return;
    }

    const selectedParent = selectedParentKey
      ? categories.find((category) => category.key === selectedParentKey)
      : null;
    if (selectedParent?.parentKey) {
      setStatus({
        state: "error",
        message: "Only categories with No Parent can be selected as parent.",
      });
      return;
    }

    setConfirmation("save");
  }

  async function executeSubmit() {
    if (confirmationPending) {
      return;
    }

    setConfirmationPending(true);
    setStatus({
      state: "pending",
      message: editingCategory ? "Saving category..." : "Adding category...",
    });

    try {
      if (editingCategory) {
        await updateManagedCategory(editingCategory.key, {
          name: form.name.trim(),
          parentKey: form.parentKey || null,
          description: form.description.trim(),
          thumbnailPath: form.thumbnailPath.trim(),
          showInVideos: form.showInVideos,
          showInImages: form.showInImages,
          showInPerformers: form.showInPerformers,
        });
        const nextCategories = await refreshCategories(
          `Saved category "${form.name.trim()}".`,
        );
        const updatedCategory =
          nextCategories.find((category) => category.key === editingCategory.key) ??
          null;
        if (updatedCategory) {
          setForm(categoryToFormState(updatedCategory));
          setCleanFormSnapshot(categoryFormSnapshot(categoryToFormState(updatedCategory)));
        }
      } else {
        const created = await createManagedCategory({
          name: form.name.trim(),
          parentKey: form.parentKey || null,
          description: form.description.trim(),
          thumbnailPath: form.thumbnailPath.trim(),
          showInVideos: form.showInVideos,
          showInImages: form.showInImages,
          showInPerformers: form.showInPerformers,
        });
        const nextCategories = await refreshCategories(
          `Added category "${form.name.trim()}".`,
        );
        const createdCategory =
          nextCategories.find((category) => category.key === created.key) ??
          created;
        setEditingKey(createdCategory.key);
        const nextForm = categoryToFormState(createdCategory);
        setForm(nextForm);
        setCleanFormSnapshot(categoryFormSnapshot(nextForm));
      }
      setConfirmation(null);
    } catch (error) {
      setStatus({
        state: "error",
        message: formatError(error, "Category could not be saved."),
      });
    } finally {
      setConfirmationPending(false);
    }
  }

  async function handleDelete() {
    if (!editingCategory || !isDesktopRuntime) {
      return;
    }

    if (deleteBlockReason) {
      setStatus({ state: "error", message: deleteBlockReason });
      return;
    }

    setConfirmation("delete");
  }

  async function executeDelete() {
    if (!editingCategory || confirmationPending) {
      return;
    }

    setConfirmationPending(true);

    setStatus({ state: "pending", message: "Deleting category..." });

    try {
      await deleteManagedCategory(editingCategory.key);
      await refreshCategories(`Deleted category "${editingCategory.name}".`);
      resetForm();
      setConfirmation(null);
    } catch (error) {
      setStatus({
        state: "error",
        message: formatError(error, "Category could not be deleted."),
      });
    } finally {
      setConfirmationPending(false);
    }
  }

  async function handleBrowseThumbnail() {
    const selectedPath = await selectLocalImageFile();
    if (!selectedPath) {
      return;
    }

    setForm((current) => ({
      ...current,
      thumbnailPath: selectedPath,
    }));
  }

  function handleEdit(category: ManagedCategory) {
    setEditingKey(category.key);
    setFormVisible(true);
    setFormErrors({});
    const nextForm = categoryToFormState(category);
    setForm(nextForm);
    setCleanFormSnapshot(categoryFormSnapshot(nextForm));
    setStatus({ state: "idle" });
    window.requestAnimationFrame(() => {
      scrollFormIntoView(formSectionRef.current);
    });
  }

  function resetForm() {
    setEditingKey(null);
    setForm(emptyForm);
    setFormErrors({});
    setFormVisible(false);
    setCleanFormSnapshot(categoryFormSnapshot(emptyForm));
    setConfirmation(null);
    setConfirmationPending(false);
  }

  function handleAddEntry() {
    setEditingKey(null);
    setForm(emptyForm);
    setFormErrors({});
    setFormVisible(true);
    setCleanFormSnapshot(categoryFormSnapshot(emptyForm));
    setStatus({ state: "idle" });
    window.requestAnimationFrame(() => {
      scrollFormIntoView(formSectionRef.current);
    });
  }

  const canSave = isDesktopRuntime && status.state !== "pending";
  const editingCategoryHasChildren = editingKey
    ? categories.some((category) => category.parentKey === editingKey)
    : false;
  const editingCategoryUsage = editingCategory
    ? countManagedCategoryUsage(editingCategory.name, records)
    : createEmptyCategoryUsageCounts();
  const deleteBlockReason = editingCategoryHasChildren
    ? "Delete is blocked while this category has child categories."
    : editingCategoryUsage.total > 0
      ? "Delete is blocked while records use this category."
      : "";
  const parentOptions = categories.filter(
    (category) =>
      category.key !== editingKey &&
      !descendantKeys.has(category.key) &&
      !category.parentKey,
  );
  const tableRows = buildVisibleTableRows(
    paginatedRows,
    expandedParentKeys,
  );
  const isFormDirty = categoryFormSnapshot(form) !== cleanFormSnapshot;
  const activeFilterCount = selectedFilters.length;
  const selectedSortLabel =
    sortOptions.find((option) => option.value === sort)?.label ?? "Name A-Z";
  const activeFilterChips = [
    ...(search.trim()
      ? [{ key: "search", label: `Search: ${search.trim()}`, onRemove: () => setSearch("") }]
      : []),
    ...selectedFilters.map((filter) => {
      const option = selectableFilterOptions.find((item) => item.value === filter);
      const label = option
        ? `${option.chipPrefix}: ${option.chipLabel}`
        : `Filter: ${filter}`;

      return {
        key: `filter-${filter}`,
        label,
        onRemove: () =>
          setSelectedFilters((current) => current.filter((item) => item !== filter)),
      };
    }),
  ];

  function toggleParentExpansion(key: string) {
    setExpandedParentKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function requestCancelForm() {
    if (!isFormDirty) {
      resetForm();
      return;
    }
    setConfirmation("discard");
  }

  function clearActiveFilters() {
    setSearch("");
    setSelectedFilters([]);
  }

  function toggleCategoryFilter(nextFilter: FilterValue) {
    if (nextFilter === "all") {
      setSelectedFilters([]);
      return;
    }

    setSelectedFilters((current) =>
      current.includes(nextFilter)
        ? current.filter((filter) => filter !== nextFilter)
        : [...current, nextFilter],
    );
  }

  function updateSort(nextSort: SortValue) {
    setSort(nextSort);
    setSortOpen(false);
  }

  function closeConfirmation() {
    if (!confirmationPending) {
      setConfirmation(null);
    }
  }

  async function confirmCurrentAction() {
    if (confirmation === "save") {
      await executeSubmit();
      return;
    }
    if (confirmation === "delete") {
      await executeDelete();
      return;
    }
    if (confirmation === "discard") {
      resetForm();
    }
  }

  return (
    <div className="space-y-6" data-testid="category-management-page">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1
            aria-label="Category Management"
            className="text-4xl font-semibold tracking-normal text-slate-950"
          >
            Category Management
          </h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500">
            Create, organize, and maintain categories used by Videos, Images,
            and Performers.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddEntry}
          className="inline-flex h-12 w-fit items-center justify-center gap-2 rounded-lg bg-sakura-500 px-5 text-base font-semibold text-white shadow-sm shadow-sakura-200 transition hover:bg-sakura-600 focus:outline-none focus:ring-4 focus:ring-sakura-100"
        >
          <Plus size={20} />
          Add Category
        </button>
      </header>

      {formVisible && (
        <section
          ref={formSectionRef}
          className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-slate-950">
              {editingCategory ? "Edit Category" : "Add Category"}
            </h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>
                Category <span className="text-red-600">*</span>
              </span>
              <input
                value={form.name}
                onChange={(event) => {
                  setForm((current) => ({ ...current, name: event.target.value }));
                  setFormErrors((current) => ({ ...current, name: undefined }));
                }}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                placeholder="Category name"
              />
              {formErrors.name && (
                <p className="text-xs font-medium text-red-600">{formErrors.name}</p>
              )}
            </label>

            <div className="space-y-1 text-sm font-medium text-slate-700">
              <span>Parent Category</span>
              <ParentCategoryPicker
                value={form.parentKey}
                options={parentOptions}
                categories={categories}
                disabled={editingCategoryHasChildren}
                onChange={(parentKey) => {
                  setForm((current) => ({
                    ...current,
                    parentKey,
                  }));
                  setFormErrors((current) => ({ ...current, parent: undefined }));
                }}
              />
              {formErrors.parent && (
                <p className="text-xs font-medium text-red-600">
                  {formErrors.parent}
                </p>
              )}
            </div>

            <fieldset className="w-full space-y-2 text-sm font-medium text-slate-700">
              <legend>
                Used In <span className="text-red-600">*</span>
              </legend>
              <div
                aria-label="Used In controls"
                className="grid w-full grid-cols-3 gap-2 text-sm font-semibold"
              >
                <UsedInToggle
                  label="Videos"
                  icon={Video}
                  checked={form.showInVideos}
                  onChange={(showInVideos) =>
                    setForm((current) => ({ ...current, showInVideos }))
                  }
                />
                <UsedInToggle
                  label="Images"
                  icon={Image}
                  checked={form.showInImages}
                  onChange={(showInImages) =>
                    setForm((current) => ({ ...current, showInImages }))
                  }
                />
                <UsedInToggle
                  label="Performers"
                  icon={UserRound}
                  checked={form.showInPerformers}
                  onChange={(showInPerformers) =>
                    setForm((current) => ({ ...current, showInPerformers }))
                  }
                />
              </div>
            </fieldset>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Thumbnail</span>
              <div className="flex gap-2">
                <input
                  value={form.thumbnailPath}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      thumbnailPath: event.target.value,
                    }));
                    setFormErrors((current) => ({
                      ...current,
                      thumbnailPath: undefined,
                    }));
                  }}
                  className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                  placeholder="Local path or reference"
                />
                <button
                  type="button"
                  onClick={handleBrowseThumbnail}
                  disabled={!isDesktopRuntime}
                  className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Browse
                </button>
              </div>
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700 lg:col-span-2">
              <span>Definition</span>
              <textarea
                value={form.description}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }));
                  setFormErrors((current) => ({
                    ...current,
                    description: undefined,
                  }));
                }}
                className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                maxLength={500}
                placeholder="Plain text definition"
              />
              {formErrors.description && (
                <p className="text-xs font-medium text-red-600">
                  {formErrors.description}
                </p>
              )}
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSave}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-sakura-500 px-4 text-sm font-semibold text-white transition hover:bg-sakura-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Save Category
            </button>
            {editingCategory && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canSave || Boolean(deleteBlockReason)}
                title={deleteBlockReason || "Delete category"}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={requestCancelForm}
              className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
          {editingCategory && deleteBlockReason && (
            <p className="mt-2 text-xs font-medium text-slate-500">
              {deleteBlockReason}
            </p>
          )}

          <StatusMessage status={status} />
        </section>
      )}

      {!formVisible && (
        <StatusMessage status={status} />
      )}

      <section className="space-y-3">
        <div
          className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
          aria-label="Category Management toolbar"
        >
          <div
            className="grid grid-cols-[minmax(9rem,1fr)_minmax(8rem,11rem)_minmax(8rem,11rem)_auto] items-center gap-2 sm:gap-3"
            data-testid="category-management-toolbar-row"
          >
            <label className="relative block min-w-0">
              <span className="sr-only">Search categories</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                placeholder="Search categories..."
              />
            </label>

            <div
              className="relative"
              onBlur={() => {
                window.setTimeout(() => setFilterOpen(false), 120);
              }}
            >
              <button
                type="button"
                aria-label="Filter categories"
                aria-haspopup="listbox"
                aria-expanded={filterOpen}
                onClick={() => {
                  setSortOpen(false);
                  setFilterOpen((open) => !open);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setFilterOpen(false);
                  }
                }}
                className="flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left transition hover:border-sakura-200 focus:outline-none focus:ring-4 focus:ring-sakura-100"
              >
                <span className="shrink-0 text-xs font-semibold text-slate-500">
                  Filter
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">
                  {selectedFilters.length === 0
                    ? "All"
                    : selectedFilters
                        .map(
                          (filter) =>
                            selectableFilterOptions.find((option) => option.value === filter)
                              ?.chipLabel ?? filter,
                        )
                        .join(", ")}
                </span>
                <span
                  aria-label={`${activeFilterCount} active filters`}
                  className="shrink-0 rounded-md bg-sakura-50 px-2 py-0.5 text-xs font-semibold text-sakura-700"
                >
                  {activeFilterCount}
                </span>
                <ChevronDown size={16} className="shrink-0 text-slate-400" />
              </button>
              {filterOpen && (
                <div
                  role="listbox"
                  aria-label="Category filter options"
                  className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
                >
                  {filterOptions.map((option) => {
                    const selected =
                      option.value === "all"
                        ? selectedFilters.length === 0
                        : selectedFilters.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold transition ${
                          selected
                            ? "bg-sakura-50 text-sakura-700"
                            : "bg-white text-slate-700 hover:bg-sakura-50 hover:text-sakura-700"
                        }`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          toggleCategoryFilter(option.value);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {selected && <Check size={15} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              className="relative"
              onBlur={() => {
                window.setTimeout(() => setSortOpen(false), 120);
              }}
            >
              <button
                type="button"
                aria-label="Sort"
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
                onClick={() => {
                  setFilterOpen(false);
                  setSortOpen((open) => !open);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSortOpen(false);
                  }
                }}
                className="flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left transition hover:border-sakura-200 focus:outline-none focus:ring-4 focus:ring-sakura-100"
              >
                <span className="shrink-0 text-xs font-semibold text-slate-500">
                  Sort
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">
                  {selectedSortLabel}
                </span>
                <ChevronDown size={16} className="shrink-0 text-slate-400" />
              </button>
              {sortOpen && (
                <div
                  role="listbox"
                  aria-label="Sort options"
                  className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
                >
                  {sortOptions.map((option) => {
                    const selected = option.value === sort;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold transition ${
                          selected
                            ? "bg-sakura-50 text-sakura-700"
                            : "bg-white text-slate-700 hover:bg-sakura-50 hover:text-sakura-700"
                        }`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => updateSort(option.value)}
                      >
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-sakura-200 hover:text-sakura-600"
              type="button"
              aria-label={view === "table" ? "Card view" : "Table view"}
              onClick={() => setView(view === "table" ? "card" : "table")}
            >
              {view === "table" ? <Grid2X2 size={18} /> : <List size={18} />}
              View
            </button>
          </div>

          {activeFilterChips.length > 0 && (
            <div
              aria-label="Active category filters"
              className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-wrap gap-2">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onRemove}
                    className="inline-flex h-8 max-w-full items-center gap-2 rounded-md border border-sakura-100 bg-sakura-50 px-2.5 text-xs font-semibold text-sakura-700 transition hover:border-sakura-200 hover:bg-white"
                    aria-label={`Remove ${chip.label} filter`}
                  >
                    <span className="truncate">{chip.label}</span>
                    <X size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={clearActiveFilters}
                className="h-8 self-start rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-sakura-200 hover:text-sakura-700 sm:self-auto"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        <nav
          className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          aria-label="Category Management pagination"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <p className="text-sm font-semibold text-slate-600">{rangeText}</p>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              Page size
              <select
                aria-label="Categories per page"
                value={rowsPerPage}
                onChange={(event) =>
                  setRowsPerPage(event.target.value as CatalogPageSize)
                }
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
              >
                {CATALOG_PAGE_SIZE_OPTIONS.map((option) => (
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
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safeCurrentPage === 1}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-500 disabled:opacity-50"
            >
              Previous
            </button>
            {buildPaginationPages(safeCurrentPage, totalPages).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                aria-current={page === safeCurrentPage ? "page" : undefined}
                aria-label={`Page ${page}`}
                className={`flex size-9 items-center justify-center rounded-lg text-sm font-semibold ${
                  page === safeCurrentPage
                    ? "bg-sakura-500 text-white"
                    : "border border-slate-200 bg-white text-slate-500"
                }`}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={safeCurrentPage === totalPages}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-500 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </nav>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {view === "card" ? (
            <div className="grid gap-4 p-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
              {paginatedRows.map(({ category, parent, usage, childCount }) => (
                <CategoryCatalogCard
                  key={category.key}
                  category={{
                    name: category.name,
                    parentName: parent?.name ?? null,
                    description: category.description,
                    thumbnailPath: category.thumbnailPath,
                    childCount,
                    videos: usage.videos,
                    images: usage.images,
                    performers: usage.performers,
                    total: usage.total,
                    status: usage.total > 0 ? "Managed" : "Unused Managed",
                  }}
                  actions={
                    <button
                      type="button"
                      onClick={() => handleEdit(category)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Pencil size={14} />
                      Edit
                    </button>
                  }
                  density="compact"
                  thumbnailShape="square"
                  emptyDescriptionText="N/A"
                />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] table-fixed text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-12 px-3 py-3 font-semibold">
                      <span className="sr-only">Hierarchy</span>
                    </th>
                    <th className="w-20 px-3 py-3 font-semibold">
                      <span className="sr-only">Thumbnail</span>
                    </th>
                    <th className="w-[22%] px-3 py-3 font-semibold">Name</th>
                    <th className="w-[16%] px-3 py-3 font-semibold">Parent</th>
                    <th className="w-[28%] px-3 py-3 font-semibold">
                      Description
                    </th>
                    <th className="w-40 px-3 py-3 font-semibold">Usage</th>
                    <th className="w-24 px-3 py-3 font-semibold">Total Usage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tableRows.map((row) => (
                    <CategoryTableRow
                      key={`${row.kind}-${row.category.key}`}
                      row={row}
                      expanded={expandedParentKeys.has(row.category.key)}
                      onToggleParent={toggleParentExpansion}
                      onEdit={handleEdit}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              {categories.length === 0
                ? "No categories yet. Add a category to start managing the catalog vocabulary."
                : "No categories match the current search, filter, and sort view."}
            </div>
          )}
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        <ShieldCheck className="mt-0.5 text-slate-400" size={14} />
        <p>
          Delete is blocked for categories with children or record usage.
        </p>
      </div>
      <ConfirmDialog
        open={confirmation !== null}
        title={categoryConfirmationCopy(confirmation, editingCategory).title}
        description={categoryConfirmationCopy(confirmation, editingCategory).description}
        confirmLabel={categoryConfirmationCopy(confirmation, editingCategory).confirmLabel}
        variant={confirmation === "delete" ? "destructive" : "default"}
        pending={confirmationPending}
        pendingLabel={categoryConfirmationCopy(confirmation, editingCategory).pendingLabel}
        onCancel={closeConfirmation}
        onConfirm={() => void confirmCurrentAction()}
      />
    </div>
  );
}

function UsedInToggle({
  label,
  icon: Icon,
  checked,
  onChange,
}: {
  label: string;
  icon: LucideIcon;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={`Show in ${label}`}
      onClick={() => onChange(!checked)}
      className={[
        "inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border px-3 transition focus:outline-none focus:ring-2 focus:ring-sakura-200",
        checked
          ? "border-sakura-200 bg-sakura-50 text-sakura-700"
          : "border-slate-200 bg-slate-50 text-slate-500",
      ].join(" ")}
    >
      <Icon size={15} aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

async function migrateLegacyManagedCategories() {
  const legacyNames = getStoredManagedCategories();
  let categories = await listManagedCategories();
  const existingNames = new Set(
    categories.map((category) => category.name.trim().toLowerCase()),
  );

  for (const name of legacyNames) {
    if (existingNames.has(name.trim().toLowerCase())) {
      continue;
    }

    try {
      await createManagedCategory({ name });
      existingNames.add(name.trim().toLowerCase());
    } catch {
      // Duplicate or invalid legacy labels are ignored during idempotent migration.
    }
  }

  categories = await listManagedCategories();
  return categories;
}

function ParentCategoryPicker({
  value,
  options,
  categories,
  disabled,
  onChange,
}: {
  value: string;
  options: ManagedCategory[];
  categories: ManagedCategory[];
  disabled: boolean;
  onChange: (parentKey: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const selectedCategory =
    value ? categories.find((category) => category.key === value) ?? null : null;
  const displayValue = open ? search : formatParentCategoryOption(selectedCategory);
  const searchKey = search.trim().toLowerCase();
  const filteredOptions = options.filter((category) =>
    [category.name, category.description, formatParentCategoryOption(category)]
      .join(" ")
      .toLowerCase()
      .includes(searchKey),
  );
  const showResults = open && !disabled;

  function selectParent(parentKey: string) {
    onChange(parentKey);
    setSearch("");
    setOpen(false);
  }

  return (
    <div
      className="relative"
      data-testid="parent-category-picker-field"
      onBlur={() => {
        window.setTimeout(() => {
          setOpen(false);
          setSearch("");
        }, 120);
      }}
    >
      <Search
        size={18}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
      />
      <input
        aria-label="Search parent categories"
        value={displayValue}
        disabled={disabled}
        placeholder="Search parent categories..."
        className={[
          "h-11 w-full select-text rounded-lg border bg-white pl-12 pr-11 text-sm font-medium text-slate-700 outline-none transition selection:bg-sakura-100 selection:text-slate-900 placeholder:text-slate-400",
          showResults
            ? "border-sakura-400 ring-4 ring-sakura-100"
            : "border-slate-300 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100",
          disabled ? "disabled:bg-slate-50 disabled:text-slate-400" : "",
        ].join(" ")}
        onFocus={() => {
          setOpen(true);
          setSearch("");
        }}
        onChange={(event) => {
          setSearch(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            setSearch("");
          }
        }}
      />
      {showResults && (search.length > 0 || value) && (
        <button
          type="button"
          className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sakura-300"
          aria-label="Clear parent category search"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (search.length > 0) {
              setSearch("");
              return;
            }
            selectParent("");
          }}
        >
          <X size={16} />
        </button>
      )}

      {showResults && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          <button
            type="button"
            className={`${parentPickerRowStyles} overflow-hidden border-b border-slate-100 px-4 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-sakura-50 hover:text-sakura-700 focus:bg-sakura-50 focus:outline-none`}
            aria-label="Select No Parent"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectParent("")}
          >
            <span className="min-w-0 truncate whitespace-nowrap font-bold text-slate-800">
              No Parent
            </span>
            <span className="flex size-8 items-center justify-center justify-self-end rounded-full text-sakura-500">
              <ChevronRight size={14} />
            </span>
          </button>

          {filteredOptions.length > 0 ? (
            filteredOptions.map((category) => (
              <button
                key={category.key}
                type="button"
                className={`${parentPickerRowStyles} overflow-hidden border-b border-slate-100 px-4 text-left text-sm font-semibold text-slate-700 transition-colors last:border-b-0 hover:bg-sakura-50 hover:text-sakura-700 focus:bg-sakura-50 focus:outline-none`}
                data-testid="parent-category-result-row"
                aria-label={`Select parent category ${category.name}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectParent(category.key)}
              >
                <span
                  className="min-w-0 truncate whitespace-nowrap font-bold text-slate-800"
                  title={formatParentCategoryOption(category)}
                >
                  {formatParentCategoryOption(category)}
                </span>
                <span className="flex size-8 items-center justify-center justify-self-end rounded-full text-sakura-500">
                  <Plus size={14} />
                </span>
              </button>
            ))
          ) : (
            <p className="px-4 py-3 text-sm font-medium text-slate-500">
              No matching parent categories.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatParentCategoryOption(category: ManagedCategory | null) {
  return category ? category.name : "No Parent";
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

function validateCategoryForm({
  form,
  categories,
  editingKey,
  descendantKeys,
  editingCategoryHasChildren,
  editingCategoryUsage,
}: {
  form: FormState;
  categories: ManagedCategory[];
  editingKey: string | null;
  descendantKeys: Set<string>;
  editingCategoryHasChildren: boolean;
  editingCategoryUsage: ReturnType<typeof countManagedCategoryUsage>;
}) {
  const errors: FormErrors = {};
  const name = form.name.trim();
  const parentKey = form.parentKey || null;

  if (!name) {
    errors.name = "Category name is required.";
  } else if (
    categories.some(
      (category) =>
        category.key !== editingKey &&
        category.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.name = "A category with this name already exists.";
  }

  const editingCategory = editingKey
    ? categories.find((category) => category.key === editingKey) ?? null
    : null;
  if (
    editingCategory &&
    editingCategoryUsage.total > 0 &&
    editingCategory.name.trim().toLowerCase() !== name.toLowerCase()
  ) {
    errors.name =
      "Rename is blocked while records use this category. Remove or migrate record labels first.";
  }

  if (form.description.trim().length > MANAGED_CATEGORY_DESCRIPTION_MAX_LENGTH) {
    errors.description = `Definition must be ${MANAGED_CATEGORY_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  if (parentKey) {
    const parentCategory = categories.find((category) => category.key === parentKey);
    if (parentKey === editingKey || descendantKeys.has(parentKey)) {
      errors.parent = "A category cannot use itself or its child category as parent.";
    } else if (!parentCategory) {
      errors.parent = "Parent category could not be found.";
    } else if (parentCategory.parentKey) {
      errors.parent = "Only categories with No Parent can be selected as parent.";
    }
  }

  if (editingCategoryHasChildren && parentKey) {
    errors.parent = "A category with child categories must stay at No Parent.";
  }

  return errors;
}

function categoryToFormState(category: ManagedCategory): FormState {
  return {
    name: category.name,
    thumbnailPath: category.thumbnailPath,
    parentKey: category.parentKey ?? "",
    description: category.description,
    showInVideos: category.showInVideos,
    showInImages: category.showInImages,
    showInPerformers: category.showInPerformers,
  };
}

function categoryFormSnapshot(form: FormState) {
  return JSON.stringify(form);
}

function categoryConfirmationCopy(
  confirmation: CategoryConfirmation,
  editingCategory: ManagedCategory | null,
) {
  if (confirmation === "delete") {
    return {
      title: "Delete category?",
      description: `This action cannot be undone. This only deletes unused managed category metadata${
        editingCategory ? ` for ${editingCategory.name}` : ""
      }.`,
      confirmLabel: "Delete",
      pendingLabel: "Deleting...",
    };
  }

  if (confirmation === "discard") {
    return {
      title: "Discard changes?",
      description: "Unsaved category changes will be lost.",
      confirmLabel: "Discard",
      pendingLabel: "Discarding...",
    };
  }

  return editingCategory
    ? {
        title: "Save changes?",
        description: "The category will be updated with these changes.",
        confirmLabel: "Save changes",
        pendingLabel: "Saving...",
      }
    : {
        title: "Save new category?",
        description: "Review the category before saving it.",
        confirmLabel: "Save",
        pendingLabel: "Saving...",
      };
}

function buildVisibleTableRows(
  rows: CategoryUsageRow[],
  expandedParentKeys: Set<string>,
): CategoryTableDisplayRow[] {
  const rowByKey = new Map(rows.map((row) => [row.category.key, row]));
  const childrenByParentKey = new Map<string, CategoryUsageRow[]>();

  for (const row of rows) {
    if (!row.category.parentKey) {
      continue;
    }

    childrenByParentKey.set(row.category.parentKey, [
      ...(childrenByParentKey.get(row.category.parentKey) ?? []),
      row,
    ]);
  }

  const visibleRows: CategoryTableDisplayRow[] = [];
  const emittedKeys = new Set<string>();

  for (const row of rows) {
    if (emittedKeys.has(row.category.key)) {
      continue;
    }

    const children = childrenByParentKey.get(row.category.key) ?? [];
    if (!row.category.parentKey) {
      visibleRows.push({
        ...row,
        kind: row.childCount > 0 ? "parent" : "standalone",
        children,
      });
      emittedKeys.add(row.category.key);

      if (expandedParentKeys.has(row.category.key)) {
        for (const child of children) {
          visibleRows.push({ ...child, kind: "child", children: [] });
          emittedKeys.add(child.category.key);
        }
      }
      continue;
    }

    if (!rowByKey.has(row.category.parentKey)) {
      visibleRows.push({ ...row, kind: "child", children: [] });
      emittedKeys.add(row.category.key);
    }
  }

  return visibleRows;
}

function defaultExpandedParentKeys(categories: ManagedCategory[]) {
  return new Set(
    categories
      .filter((category) =>
        categories.some((child) => child.parentKey === category.key),
      )
      .map((category) => category.key),
  );
}

function createEmptyCategoryUsageCounts() {
  return {
    videos: 0,
    images: 0,
    performers: 0,
    total: 0,
  };
}

function addCategoryUsageCounts(
  first: ReturnType<typeof countManagedCategoryUsage>,
  second: ReturnType<typeof countManagedCategoryUsage>,
) {
  const videos = first.videos + second.videos;
  const images = first.images + second.images;
  const performers = first.performers + second.performers;

  return {
    videos,
    images,
    performers,
    total: videos + images + performers,
  };
}

function matchesCategoryFilter(
  row: CategoryUsageRow,
  filter: ActiveFilterValue,
) {
  if (filter === "parent-only") {
    return row.childCount > 0;
  }
  if (filter === "child-only") {
    return !!row.category.parentKey;
  }
  if (filter === "videos") {
    return row.usage.videos > 0;
  }
  if (filter === "images") {
    return row.usage.images > 0;
  }
  if (filter === "performers") {
    return row.usage.performers > 0;
  }
  if (filter === "active") {
    return row.usage.total > 0;
  }
  return row.usage.total === 0;
}

function CategoryTableRow({
  row,
  expanded,
  onToggleParent,
  onEdit,
}: {
  row: CategoryTableDisplayRow;
  expanded: boolean;
  onToggleParent: (key: string) => void;
  onEdit: (category: ManagedCategory) => void;
}) {
  const hasChildren = row.childCount > 0;
  const isChild = row.kind === "child";
  const isParent = row.kind === "parent";
  const childContentIndentClass = isChild ? "pl-6" : "";
  const nameTitle = row.parent
    ? `${row.category.name} child of ${row.parent.name}`
    : row.category.name;

  return (
    <tr
      onClick={() => onEdit(row.category)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit(row.category);
        }
      }}
      tabIndex={0}
      aria-label={`Edit ${row.category.name}`}
      data-category-row-kind={row.kind}
      data-category-child-indent={isChild ? "from-thumbnail" : undefined}
      className={`align-middle ${
        isParent
          ? "cursor-pointer bg-slate-50 hover:bg-sakura-50/60"
          : isChild
            ? "cursor-pointer bg-white hover:bg-sakura-50/50"
            : "cursor-pointer bg-white hover:bg-sakura-50/50"
      }`}
    >
      <td className="px-3 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center">
          {hasChildren ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleParent(row.category.key);
              }}
              aria-label={`${expanded ? "Collapse" : "Expand"} ${row.category.name}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-sakura-100"
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : null}
        </span>
      </td>
      <td className={`px-3 py-3 ${childContentIndentClass}`}>
        <ThumbnailPreview category={row.category} />
      </td>
      <td className={`px-3 py-3 ${childContentIndentClass}`}>
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <div
              className={`flex min-w-0 items-center gap-2 truncate font-semibold ${
                isChild ? "text-slate-900" : "text-slate-950"
              }`}
              title={nameTitle}
            >
              <span className="min-w-0 truncate">{row.category.name}</span>
              {isParent && (
                <span
                  className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-500"
                  aria-label={`${row.childCount} ${
                    row.childCount === 1 ? "child" : "children"
                  }`}
                  title={`${row.childCount} ${
                    row.childCount === 1 ? "child" : "children"
                  }`}
                >
                  {row.childCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className={`px-3 py-3 text-slate-600 ${childContentIndentClass}`}>
        {row.parent ? (
          <span
            className="inline-flex w-fit max-w-full items-center rounded-md border border-sakura-200 bg-sakura-50 px-2.5 py-1 text-xs font-semibold text-sakura-700"
            title={row.parent.name}
            data-testid="category-parent-chip"
          >
            <span className="min-w-0 truncate">{row.parent.name}</span>
          </span>
        ) : (
          <span className="text-slate-400">N/A</span>
        )}
      </td>
      <td className={`px-3 py-3 text-slate-600 ${childContentIndentClass}`}>
        <span
          className="line-clamp-2 break-words"
          title={row.category.description || "N/A"}
        >
          {row.category.description || "N/A"}
        </span>
      </td>
      <td className={`px-3 py-3 text-slate-600 ${childContentIndentClass}`}>
        <div className="flex min-w-0 items-center gap-3 text-xs font-semibold">
          <UsageShortcut
            label="Videos"
            value={row.usage.videos}
            icon={Video}
            to={categoryUsageLink("videos", row.category.name)}
          />
          <UsageShortcut
            label="Images"
            value={row.usage.images}
            icon={Image}
            to={categoryUsageLink("images", row.category.name)}
          />
          <UsageShortcut
            label="Performers"
            value={row.usage.performers}
            icon={UserRound}
            to={categoryUsageLink("performers", row.category.name)}
          />
        </div>
      </td>
      <td className={`px-3 py-3 font-semibold text-slate-900 ${childContentIndentClass}`}>
        {row.usage.total}
      </td>
    </tr>
  );
}

function UsageShortcut({
  label,
  value,
  icon: Icon,
  to,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  to: string;
}) {
  const content = (
    <>
      <Icon size={14} aria-hidden="true" />
      {value}
    </>
  );

  return value > 0 ? (
    <Link
      className="inline-flex items-center gap-1 text-sakura-600"
      aria-label={`${label} ${value}`}
      title={label}
      to={to}
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </Link>
  ) : (
    <span
      className="inline-flex items-center gap-1"
      aria-label={`${label} ${value}`}
      title={label}
    >
      {content}
    </span>
  );
}

function categoryUsageLink(
  kind: "videos" | "images" | "performers",
  category: string,
) {
  return `/${kind}?category=${encodeURIComponent(category)}`;
}

function ThumbnailPreview({ category }: { category: ManagedCategory }) {
  const [imageFailed, setImageFailed] = useState(false);
  const assetSrc = localImagePathToAssetSrc(category.thumbnailPath);

  useEffect(() => {
    setImageFailed(false);
  }, [assetSrc]);

  if (!category.thumbnailPath.trim()) {
    return (
      <div
        aria-label="Category thumbnail placeholder"
        data-testid="category-table-thumbnail-placeholder"
        className={`relative flex ${categoryTableThumbnailClassName} items-center justify-center overflow-hidden bg-sakura-50 text-sakura-500`}
      >
        <span
          className="absolute inset-0 bg-gradient-to-br from-sakura-50 via-rose-50 to-pink-50"
          aria-hidden="true"
        />
        <Tags className="relative z-10 opacity-75" size={15} />
      </div>
    );
  }

  if (!assetSrc || imageFailed) {
    return (
      <div
        aria-label="Thumbnail path saved"
        data-testid="category-table-thumbnail-placeholder"
        className={`flex ${categoryTableThumbnailClassName} items-center justify-center border border-slate-200 bg-slate-50 text-slate-400`}
      >
        <Tags size={16} />
      </div>
    );
  }

  return (
    <div
      data-testid="category-table-thumbnail"
      className={`${categoryTableThumbnailClassName} border border-slate-200 bg-slate-50`}
    >
      <img
        src={assetSrc}
        alt=""
        className="h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
          setImageFailed(true);
        }}
      />
    </div>
  );
}

function StatusMessage({ status }: { status: StatusState }) {
  if (status.state === "idle") {
    return null;
  }

  const tone =
    status.state === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : status.state === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${tone}`}>
      {status.message}
    </p>
  );
}

function formatError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  return fallback;
}

function compareTimestampDesc(first: string, second: string) {
  const firstTime = parseCategoryTimestamp(first);
  const secondTime = parseCategoryTimestamp(second);

  return secondTime - firstTime;
}

function parseCategoryTimestamp(value: string) {
  if (!value) {
    return 0;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildPaginationPages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

export default CategoryManagementPanel;
