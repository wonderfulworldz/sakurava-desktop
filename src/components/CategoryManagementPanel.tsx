import { ImageIcon, Pencil, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ManagedCategory } from "../backend/types";
import {
  countManagedCategoryUsage,
  findManagedCategoryDescendantKeys,
} from "../backend/managedCategoryModel";
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

type FormState = {
  name: string;
  thumbnailPath: string;
  parentKey: string;
  description: string;
};

type StatusState =
  | { state: "idle" }
  | { state: "pending"; message: string }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type FilterValue = "all" | "parent-only" | "child-only" | "active" | "unused";
type SortValue =
  | "name"
  | "usage-desc"
  | "usage-asc"
  | "updated-desc"
  | "created-desc";

const emptyForm: FormState = {
  name: "",
  thumbnailPath: "",
  parentKey: "",
  description: "",
};

const emptyRecords = {
  videos: [] as Array<{ categoriesJson: string }>,
  images: [] as Array<{ categoriesJson: string }>,
  performers: [] as Array<{ categoriesJson: string }>,
};

function CategoryManagementPanel() {
  const isDesktopRuntime = isTauriRuntimeAvailable();
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [records, setRecords] = useState(emptyRecords);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sort, setSort] = useState<SortValue>("name");
  const [status, setStatus] = useState<StatusState>({ state: "idle" });
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

    const query = search.trim().toLowerCase();
    const withUsage = categories.map((category) => {
      const usage = countManagedCategoryUsage(category.name, records);
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
        if (filter === "parent-only") {
          return row.childCount > 0;
        }
        if (filter === "child-only") {
          return !!row.category.parentKey;
        }
        if (filter === "active") {
          return row.usage.total > 0;
        }
        if (filter === "unused") {
          return row.usage.total === 0;
        }
        return true;
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
  }, [categories, filter, records, search, sort]);

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
              createdAt: "",
              updatedAt: "",
            }),
          );
          if (!cancelled) {
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
    setCategories(nextCategories);
    if (message) {
      setStatus({ state: "success", message });
    }
  }

  async function handleSubmit() {
    if (!isDesktopRuntime) {
      setStatus({
        state: "error",
        message: "Category metadata requires the desktop runtime.",
      });
      return;
    }

    setStatus({
      state: "pending",
      message: editingCategory ? "Saving category..." : "Adding category...",
    });

    try {
      if (editingCategory) {
        await updateManagedCategory(editingCategory.key, {
          name: form.name,
          parentKey: form.parentKey || null,
          description: form.description,
          thumbnailPath: form.thumbnailPath,
        });
        await refreshCategories(`Saved category "${form.name.trim()}".`);
      } else {
        await createManagedCategory({
          name: form.name,
          parentKey: form.parentKey || null,
          description: form.description,
          thumbnailPath: form.thumbnailPath,
        });
        await refreshCategories(`Added category "${form.name.trim()}".`);
      }
      resetForm();
    } catch (error) {
      setStatus({
        state: "error",
        message: formatError(error, "Category could not be saved."),
      });
    }
  }

  async function handleDelete() {
    if (!editingCategory || !isDesktopRuntime) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${editingCategory.name}"? This only deletes unused managed category metadata.`,
    );
    if (!confirmed) {
      return;
    }

    setStatus({ state: "pending", message: "Deleting category..." });

    try {
      await deleteManagedCategory(editingCategory.key);
      await refreshCategories(`Deleted category "${editingCategory.name}".`);
      resetForm();
    } catch (error) {
      setStatus({
        state: "error",
        message: formatError(error, "Category could not be deleted."),
      });
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
    setForm({
      name: category.name,
      thumbnailPath: category.thumbnailPath,
      parentKey: category.parentKey ?? "",
      description: category.description,
    });
    setStatus({ state: "idle" });
    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function resetForm() {
    setEditingKey(null);
    setForm(emptyForm);
  }

  const canSave = isDesktopRuntime && status.state !== "pending";
  const editingCategoryHasChildren = editingKey
    ? categories.some((category) => category.parentKey === editingKey)
    : false;
  const parentOptions = categories.filter(
    (category) =>
      category.key !== editingKey &&
      !descendantKeys.has(category.key) &&
      !category.parentKey,
  );

  return (
    <div className="space-y-4">
      <section
        ref={formSectionRef}
        className="scroll-mt-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-slate-950">
            Add / Edit Category
          </h2>
          <p className="text-sm text-slate-500">
            Manage category metadata. Record categories remain saved as labels.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Category name"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>Parent</span>
            <select
              value={form.parentKey}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  parentKey: event.target.value,
                }))
              }
              disabled={editingCategoryHasChildren}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">No Parent</option>
              {parentOptions.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.name}
                </option>
              ))}
            </select>
            <span className="block text-xs font-normal text-slate-500">
              One level is supported: categories with No Parent can have
              children; child categories cannot be selected as parents.
            </span>
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>Thumbnail</span>
            <div className="flex gap-2">
              <input
                value={form.thumbnailPath}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    thumbnailPath: event.target.value,
                  }))
                }
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Local path or reference"
              />
              <button
                type="button"
                onClick={handleBrowseThumbnail}
                disabled={!isDesktopRuntime}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Browse
              </button>
            </div>
            <span className="block text-xs font-normal text-slate-500">
              Enter a local image path or reference. Browse selects one image
              path; files are not scanned or changed.
            </span>
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              maxLength={500}
              placeholder="Plain text description"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-md bg-sakura-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {editingCategory ? "Save" : "Add Category"}
          </button>
          {editingCategory && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canSave}
              className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <Trash2 size={16} />
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={resetForm}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
        </div>

        <StatusMessage status={status} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search categories</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm"
              placeholder="Search categories..."
            />
          </label>
          <select
            aria-label="Filter categories"
            value={filter}
            onChange={(event) => setFilter(event.target.value as FilterValue)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="parent-only">Parent Only</option>
            <option value="child-only">Child Only</option>
            <option value="active">Active</option>
            <option value="unused">Unused</option>
          </select>
          <select
            aria-label="Sort categories"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortValue)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="name">Name A-Z</option>
            <option value="usage-desc">Usage high-low</option>
            <option value="usage-asc">Usage low-high</option>
            <option value="updated-desc">Last Updated</option>
            <option value="created-desc">Last Added</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Name</th>
                <th className="px-3 py-3 font-semibold">Parent</th>
                <th className="px-3 py-3 font-semibold">Description</th>
                <th className="px-3 py-3 font-semibold">Videos</th>
                <th className="px-3 py-3 font-semibold">Images</th>
                <th className="px-3 py-3 font-semibold">Performers</th>
                <th className="px-3 py-3 font-semibold">Usage</th>
                <th className="px-3 py-3 font-semibold">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ category, parent, usage }) => (
                <tr key={category.key} className="align-top">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <ThumbnailPreview category={category} />
                      <div>
                        <div className="font-semibold text-slate-950">
                          {category.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {parent ? parent.name : "No Parent"}
                  </td>
                  <td className="max-w-xs px-3 py-3 text-slate-600">
                    <span className="line-clamp-2">
                      {category.description || "No description"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{usage.videos}</td>
                  <td className="px-3 py-3 text-slate-600">{usage.images}</td>
                  <td className="px-3 py-3 text-slate-600">
                    {usage.performers}
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-900">
                    {usage.total}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => handleEdit(category)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      <Pencil size={14} />
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No categories match the current view.
            </div>
          )}
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        <ShieldCheck className="mt-0.5 text-slate-400" size={14} />
        <p>
          Thumbnails are stored as path references only. Delete is blocked when
          child categories or record usage exist.
        </p>
      </div>
    </div>
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

function ThumbnailPreview({ category }: { category: ManagedCategory }) {
  const [imageFailed, setImageFailed] = useState(false);
  const assetSrc = localImagePathToAssetSrc(category.thumbnailPath);

  useEffect(() => {
    setImageFailed(false);
  }, [assetSrc]);

  if (!category.thumbnailPath.trim()) {
    return (
      <div
        aria-hidden="true"
        className="h-10 w-10 shrink-0 rounded-md bg-slate-100"
      >
      </div>
    );
  }

  if (!assetSrc || imageFailed) {
    return (
      <div
        aria-label="Thumbnail path saved"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400"
      >
        <ImageIcon size={16} />
      </div>
    );
  }

  return (
    <img
      src={assetSrc}
      alt=""
      className="h-10 w-10 shrink-0 rounded-md border border-slate-200 object-cover"
      onError={(event) => {
        event.currentTarget.style.display = "none";
        setImageFailed(true);
      }}
    />
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

export default CategoryManagementPanel;
