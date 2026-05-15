import {
  Eye,
  Info,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Image, Performer, Video as VideoRecord } from "../backend/types";
import { buildCategoryAudit, type CategoryAuditSummary } from "../lib/categoryAudit";
import {
  removeCategoryFromCategoriesJson,
  renameCategoryInCategoriesJson,
} from "../lib/categoryRenameApply";
import {
  buildCategoryDeletePreview,
  buildCategoryRenamePreview,
  type CategoryRenamePreview,
} from "../lib/categoryRenamePreview";
import {
  addStoredManagedCategory,
  deleteStoredManagedCategory,
  getStoredManagedCategories,
  renameStoredManagedCategory,
  validateManagedCategoryRename,
} from "../lib/managedCategories";
import { listImages, updateImage } from "../runtime/imageCommands";
import { listPerformers, updatePerformer } from "../runtime/performerCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";
import { listVideos, updateVideo } from "../runtime/videoCommands";

type CategoryStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type CategoryListFilter = "all" | "used" | "unused" | "record";
type CategoryListSort = "name" | "usage-desc" | "usage-asc";
type RecordActionMode = "rename" | "remove";

type CategoryTableRow = {
  name: string;
  videos: number;
  images: number;
  performers: number;
  total: number;
  isManaged: boolean;
  isRecordCategory: boolean;
};

const emptyCategoryAudit = buildCategoryAudit({
  videos: [],
  images: [],
  performers: [],
});
const emptyCategoryRenamePreviewRecords = {
  videos: [] as VideoRecord[],
  images: [] as Image[],
  performers: [] as Performer[],
};

function CategoryManagementPanel() {
  const isDesktopRuntime = isTauriRuntimeAvailable();
  const [categoryAudit, setCategoryAudit] =
    useState<CategoryAuditSummary>(emptyCategoryAudit);
  const [categoryRenamePreviewRecords, setCategoryRenamePreviewRecords] =
    useState(emptyCategoryRenamePreviewRecords);
  const [managedCategories, setManagedCategories] = useState<string[]>([]);
  const [managedCategoryInput, setManagedCategoryInput] = useState("");
  const [managedCategoryStatus, setManagedCategoryStatus] =
    useState<CategoryStatus>({ state: "idle" });

  useEffect(() => {
    setManagedCategories(getStoredManagedCategories());
  }, []);

  async function loadCategoryData() {
    const [videos, images, performers] = await Promise.all([
      listVideos(),
      listImages(),
      listPerformers(),
    ]);

    setCategoryAudit(buildCategoryAudit({ videos, images, performers }));
    setCategoryRenamePreviewRecords({ videos, images, performers });
  }

  useEffect(() => {
    if (!isDesktopRuntime) {
      setCategoryAudit(emptyCategoryAudit);
      setCategoryRenamePreviewRecords(emptyCategoryRenamePreviewRecords);
      return;
    }

    let cancelled = false;

    async function loadCategoryAudit() {
      try {
        if (!cancelled) {
          await loadCategoryData();
        }
      } catch {
        if (!cancelled) {
          setCategoryAudit(emptyCategoryAudit);
          setCategoryRenamePreviewRecords(emptyCategoryRenamePreviewRecords);
        }
      }
    }

    void loadCategoryAudit();

    return () => {
      cancelled = true;
    };
  }, [isDesktopRuntime]);

  function handleAddManagedCategory() {
    const result = addStoredManagedCategory(
      managedCategoryInput,
      categoryAudit.rows.map((row) => row.name),
    );

    setManagedCategories(result.categories);
    setManagedCategoryStatus({
      state: result.state,
      message: result.message,
    });

    if (result.state === "success") {
      setManagedCategoryInput("");
    }
  }

  function handleRenameManagedCategory(currentName: string, nextName: string) {
    const result = renameStoredManagedCategory(
      currentName,
      nextName,
      managedCategories,
    );

    setManagedCategories(result.categories);
    setManagedCategoryStatus({
      state: result.state,
      message: result.message,
    });

    return result.state === "success";
  }

  function handleDeleteManagedCategory(category: string) {
    const result = deleteStoredManagedCategory(category, managedCategories);

    setManagedCategories(result.categories);
    setManagedCategoryStatus({
      state: result.state,
      message: result.message,
    });

    return result.state === "success";
  }

  async function handleApplyRecordCategoryRemove(sourceCategory: string) {
    setManagedCategoryStatus({ state: "pending" });

    const videoUpdates = categoryRenamePreviewRecords.videos
      .map((record) => ({
        record,
        remove: removeCategoryFromCategoriesJson(
          record.categoriesJson,
          sourceCategory,
        ),
      }))
      .filter((entry) => entry.remove.changed);
    const imageUpdates = categoryRenamePreviewRecords.images
      .map((record) => ({
        record,
        remove: removeCategoryFromCategoriesJson(
          record.categoriesJson,
          sourceCategory,
        ),
      }))
      .filter((entry) => entry.remove.changed);
    const performerUpdates = categoryRenamePreviewRecords.performers
      .map((record) => ({
        record,
        remove: removeCategoryFromCategoriesJson(
          record.categoriesJson,
          sourceCategory,
        ),
      }))
      .filter((entry) => entry.remove.changed);
    const affectedCount =
      videoUpdates.length + imageUpdates.length + performerUpdates.length;

    if (affectedCount === 0) {
      setManagedCategoryStatus({
        state: "error",
        message: "No existing records use this category.",
      });
      return false;
    }

    try {
      await Promise.all([
        ...videoUpdates.map(({ record, remove }) =>
          updateVideo(record.id, { categoriesJson: remove.categoriesJson }),
        ),
        ...imageUpdates.map(({ record, remove }) =>
          updateImage(record.id, { categoriesJson: remove.categoriesJson }),
        ),
        ...performerUpdates.map(({ record, remove }) =>
          updatePerformer(record.id, { categoriesJson: remove.categoriesJson }),
        ),
      ]);
      await loadCategoryData();
      setManagedCategoryStatus({
        state: "success",
        message: `Removed category from ${affectedCount} existing record${
          affectedCount === 1 ? "" : "s"
        }. Managed categories were not changed.`,
      });
      return true;
    } catch (error) {
      setManagedCategoryStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Record category removal did not complete.",
      });
      return false;
    }
  }

  async function handleApplyRecordCategoryRename(
    sourceCategory: string,
    targetCategory: string,
  ) {
    setManagedCategoryStatus({ state: "pending" });

    const videoUpdates = categoryRenamePreviewRecords.videos
      .map((record) => ({
        record,
        rename: renameCategoryInCategoriesJson(
          record.categoriesJson,
          sourceCategory,
          targetCategory,
        ),
      }))
      .filter((entry) => entry.rename.changed);
    const imageUpdates = categoryRenamePreviewRecords.images
      .map((record) => ({
        record,
        rename: renameCategoryInCategoriesJson(
          record.categoriesJson,
          sourceCategory,
          targetCategory,
        ),
      }))
      .filter((entry) => entry.rename.changed);
    const performerUpdates = categoryRenamePreviewRecords.performers
      .map((record) => ({
        record,
        rename: renameCategoryInCategoriesJson(
          record.categoriesJson,
          sourceCategory,
          targetCategory,
        ),
      }))
      .filter((entry) => entry.rename.changed);
    const affectedCount =
      videoUpdates.length + imageUpdates.length + performerUpdates.length;

    if (affectedCount === 0) {
      setManagedCategoryStatus({
        state: "error",
        message: "No existing records use this category.",
      });
      return false;
    }

    try {
      await Promise.all([
        ...videoUpdates.map(({ record, rename }) =>
          updateVideo(record.id, { categoriesJson: rename.categoriesJson }),
        ),
        ...imageUpdates.map(({ record, rename }) =>
          updateImage(record.id, { categoriesJson: rename.categoriesJson }),
        ),
        ...performerUpdates.map(({ record, rename }) =>
          updatePerformer(record.id, { categoriesJson: rename.categoriesJson }),
        ),
      ]);
      await loadCategoryData();
      setManagedCategoryStatus({
        state: "success",
        message: `Renamed category in ${affectedCount} existing record${
          affectedCount === 1 ? "" : "s"
        }. Managed categories were not changed.`,
      });
      return true;
    } catch (error) {
      setManagedCategoryStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Record category rename did not complete.",
      });
      return false;
    }
  }

  return (
    <CategoryManagementSurface
      audit={categoryAudit}
      renamePreviewRecords={categoryRenamePreviewRecords}
      managedCategories={managedCategories}
      managedCategoryInput={managedCategoryInput}
      managedCategoryStatus={managedCategoryStatus}
      onManagedCategoryInputChange={(value) => {
        setManagedCategoryInput(value);
        setManagedCategoryStatus({ state: "idle" });
      }}
      onAddManagedCategory={handleAddManagedCategory}
      onRenameManagedCategory={handleRenameManagedCategory}
      onApplyRecordCategoryRename={handleApplyRecordCategoryRename}
      onDeleteManagedCategory={handleDeleteManagedCategory}
      onApplyRecordCategoryRemove={handleApplyRecordCategoryRemove}
    />
  );
}

function CategoryManagementSurface({
  audit,
  renamePreviewRecords,
  managedCategories,
  managedCategoryInput,
  managedCategoryStatus,
  onManagedCategoryInputChange,
  onAddManagedCategory,
  onRenameManagedCategory,
  onApplyRecordCategoryRename,
  onDeleteManagedCategory,
  onApplyRecordCategoryRemove,
}: {
  audit: CategoryAuditSummary;
  renamePreviewRecords: {
    videos: VideoRecord[];
    images: Image[];
    performers: Performer[];
  };
  managedCategories: string[];
  managedCategoryInput: string;
  managedCategoryStatus: CategoryStatus;
  onManagedCategoryInputChange: (value: string) => void;
  onAddManagedCategory: () => void;
  onRenameManagedCategory: (currentName: string, nextName: string) => boolean;
  onApplyRecordCategoryRename: (
    currentName: string,
    nextName: string,
  ) => Promise<boolean>;
  onDeleteManagedCategory: (category: string) => boolean;
  onApplyRecordCategoryRemove: (category: string) => Promise<boolean>;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<CategoryListFilter>("all");
  const [sort, setSort] = useState<CategoryListSort>("name");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [managedRenameTarget, setManagedRenameTarget] = useState("");
  const [isConfirmingManagedDelete, setIsConfirmingManagedDelete] =
    useState(false);
  const [recordActionMode, setRecordActionMode] =
    useState<RecordActionMode>("rename");
  const [recordRenameTarget, setRecordRenameTarget] = useState("");
  const [isRecordConfirming, setIsRecordConfirming] = useState(false);

  const categoryRows = useMemo(
    () => buildCategoryRows(audit, managedCategories),
    [audit, managedCategories],
  );
  const filteredRows = useMemo(
    () => filterCategoryRows(categoryRows, searchTerm, filter, sort),
    [categoryRows, filter, searchTerm, sort],
  );
  const selectedRow =
    categoryRows.find((row) => row.name === selectedCategory) ??
    filteredRows[0] ??
    categoryRows[0] ??
    null;
  const selectedUsage = selectedRow?.total ?? 0;
  const selectedCategoryIsManaged = !!selectedRow?.isManaged;
  const canDeleteSelectedManagedCategory =
    selectedCategoryIsManaged && selectedUsage === 0;
  const canUseSelectedForRecordActions =
    selectedCategoryIsManaged && !!selectedRow;
  const selectedCategoryName = selectedRow?.name ?? "";
  const managedRenameValidation = selectedCategoryIsManaged
    ? validateManagedCategoryRename(
        selectedCategoryName,
        managedRenameTarget,
        managedCategories,
      )
    : null;
  const canApplyManagedRename =
    managedRenameValidation?.state === "valid" && selectedCategoryIsManaged;
  const recordRenameValidation = canUseSelectedForRecordActions
    ? validateManagedCategoryRename(
        selectedCategoryName,
        recordRenameTarget,
        managedCategories,
      )
    : null;
  const recordPreview = selectedCategoryName
    ? recordActionMode === "rename"
      ? buildCategoryRenamePreview(selectedCategoryName, renamePreviewRecords)
      : buildCategoryDeletePreview(selectedCategoryName, renamePreviewRecords)
    : null;
  const canApplyRecordOperation =
    canUseSelectedForRecordActions &&
    (recordPreview?.total ?? 0) > 0 &&
    (recordActionMode === "remove" ||
      recordRenameValidation?.state === "valid");

  useEffect(() => {
    if (!selectedCategory && categoryRows.length > 0) {
      setSelectedCategory(categoryRows[0].name);
      return;
    }

    if (
      selectedCategory &&
      !categoryRows.some((row) => row.name === selectedCategory)
    ) {
      setSelectedCategory(categoryRows[0]?.name ?? "");
      setManagedRenameTarget("");
      setIsConfirmingManagedDelete(false);
      setIsRecordConfirming(false);
    }
  }, [categoryRows, selectedCategory]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm shadow-slate-200/40">
        <h2 className="text-base font-semibold tracking-normal text-slate-950">
          Add or Edit Category
        </h2>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
            Category Name <span className="text-sakura-500">*</span>
            <input
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
              placeholder="Enter category name..."
              value={managedCategoryInput}
              onChange={(event) =>
                onManagedCategoryInputChange(event.target.value)
              }
            />
          </label>
          <CategoryStatusMessage status={managedCategoryStatus} />
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
            Parent Category
            <select
              disabled
              className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-400 outline-none"
              value="none"
            >
              <option value="none">None - deferred</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
            Description / Notes
            <textarea
              disabled
              className="min-h-20 resize-none rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-400 outline-none"
              placeholder="Optional notes about this category are deferred."
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-sakura-500 px-5 text-sm font-semibold text-white shadow-sm shadow-sakura-100 transition hover:bg-sakura-600"
              onClick={onAddManagedCategory}
            >
              <Plus size={16} />
              Add Category
            </button>
            <button
              type="button"
              disabled
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-5 text-sm font-semibold text-slate-300"
            >
              <SlidersHorizontal size={15} />
              Save Changes
            </button>
            <button
              type="button"
              className="h-10 rounded-md border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => onManagedCategoryInputChange("")}
            >
              Cancel
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-200/40">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto] lg:items-center">
          <label className="relative block">
            <span className="sr-only">Search categories</span>
            <Search
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["used", "Used"],
              ["unused", "Unused"],
              ["record", "Record-only"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value as CategoryListFilter)}
                className={[
                  "h-9 rounded-md px-4 text-xs font-semibold transition",
                  filter === value
                    ? "bg-sakura-100 text-sakura-600 ring-1 ring-sakura-200"
                    : "bg-slate-50 text-slate-600 ring-1 ring-slate-100 hover:bg-slate-100",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            <span className="sr-only">Sort categories</span>
            <select
              className="h-10 min-w-36 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as CategoryListSort)
              }
            >
              <option value="name">A-Z</option>
              <option value="usage-desc">Usage high</option>
              <option value="usage-asc">Usage low</option>
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
        <div className="px-5 py-4">
          <h2 className="text-base font-semibold tracking-normal text-slate-950">
            Category List
          </h2>
        </div>
        {filteredRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-[820px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-slate-200 bg-white text-xs font-semibold text-slate-500">
                  <th className="w-12 px-5 py-3"></th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Parent</th>
                  <th className="px-3 py-3">Usage</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRows.map((row) => {
                  const isSelected = selectedRow?.name === row.name;
                  return (
                    <tr
                      key={row.name.toLowerCase()}
                      className={
                        isSelected ? "bg-sakura-50/70" : "bg-white"
                      }
                    >
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          aria-label={`Select ${row.name}`}
                          onClick={() => {
                            setSelectedCategory(row.name);
                            setManagedRenameTarget("");
                            setIsConfirmingManagedDelete(false);
                            setIsRecordConfirming(false);
                          }}
                          className={[
                            "size-4 rounded-full border",
                            isSelected
                              ? "border-sakura-500 bg-sakura-500 ring-2 ring-sakura-100"
                              : "border-slate-300 bg-white",
                          ].join(" ")}
                        />
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-800">
                        {row.name}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-500">
                        None
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-700">
                        {row.total}
                      </td>
                      <td className="px-3 py-3">
                        <CategoryStatePill row={row} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-3 text-slate-500">
                          <IconButton
                            label={`View ${row.name}`}
                            onClick={() => setSelectedCategory(row.name)}
                            icon={<Eye size={16} />}
                          />
                          <IconButton
                            label={`Edit ${row.name}`}
                            onClick={() => {
                              setSelectedCategory(row.name);
                              setManagedRenameTarget(row.name);
                            }}
                            icon={<Pencil size={16} />}
                          />
                          <IconButton
                            label={`Delete ${row.name}`}
                            disabled={!row.isManaged || row.total > 0}
                            onClick={() => {
                              setSelectedCategory(row.name);
                              setIsConfirmingManagedDelete(true);
                            }}
                            icon={<Trash2 size={16} />}
                            danger
                          />
                          <IconButton
                            label={`Record actions for ${row.name}`}
                            onClick={() => setSelectedCategory(row.name)}
                            icon={<SlidersHorizontal size={16} />}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs font-medium text-slate-500">
              <span>
                Showing 1 to {filteredRows.length} of {filteredRows.length} categories
              </span>
              <span>{filteredRows.length} items</span>
            </div>
          </div>
        ) : (
          <p className="mx-5 mb-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
            Saved categories will appear here after records use them or Managed
            Categories are added.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm shadow-slate-200/40">
        <h2 className="text-base font-semibold tracking-normal text-slate-950">
          Selected Category Detail
        </h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_190px] lg:items-start">
          <div className="flex min-w-0 gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-sakura-100 text-sakura-600 ring-1 ring-sakura-200">
              <SlidersHorizontal size={28} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="break-words text-2xl font-semibold tracking-normal text-slate-950">
                  {selectedRow?.name ?? "No category selected"}
                </h3>
                {selectedRow && <CategoryStatePill row={selectedRow} />}
                {selectedRow?.isManaged && <SoftPill label="Managed" />}
              </div>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {selectedUsage > 0
                  ? "Used in Videos, Images, and Performers"
                  : "No existing records use this category"}
              </p>
              <div className="mt-6 grid max-w-xl grid-cols-4 gap-4">
                <DetailMetric label="Videos" value={selectedRow?.videos ?? 0} />
                <DetailMetric label="Images" value={selectedRow?.images ?? 0} />
                <DetailMetric
                  label="Performers"
                  value={selectedRow?.performers ?? 0}
                />
                <DetailMetric label="Total" value={selectedUsage} strong />
              </div>
              <p className="mt-5 flex items-center gap-2 text-xs font-medium text-slate-500">
                <Info size={15} />
                Editing the category list does not automatically change existing
                records.
              </p>
            </div>
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              disabled={!selectedCategoryIsManaged}
              onClick={() => setManagedRenameTarget(selectedCategoryName)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sakura-200 bg-white px-4 text-sm font-semibold text-sakura-600 hover:bg-sakura-50 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300"
            >
              <Pencil size={15} />
              Edit Category
            </button>
            <button
              type="button"
              disabled={!canDeleteSelectedManagedCategory}
              onClick={() => setIsConfirmingManagedDelete(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300"
            >
              <Trash2 size={15} />
              Delete if unused
            </button>
            <button
              type="button"
              disabled={!canUseSelectedForRecordActions}
              onClick={() => setIsRecordConfirming(false)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-300"
            >
              <SlidersHorizontal size={15} />
              Modify Records
            </button>
          </div>
        </div>

        {selectedCategoryIsManaged && (
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Rename selected Managed Category
              <input
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                placeholder="New category name"
                value={managedRenameTarget}
                onChange={(event) => {
                  setManagedRenameTarget(event.target.value);
                  setIsConfirmingManagedDelete(false);
                }}
              />
            </label>
            <button
              type="button"
              disabled={!canApplyManagedRename}
              onClick={() => {
                if (
                  selectedRow &&
                  onRenameManagedCategory(selectedRow.name, managedRenameTarget)
                ) {
                  setSelectedCategory(managedRenameTarget.trim());
                  setManagedRenameTarget("");
                }
              }}
              className={[
                "h-10 self-end rounded-md border px-4 text-sm font-semibold",
                canApplyManagedRename
                  ? "border-sakura-200 bg-sakura-50 text-sakura-600 hover:bg-sakura-100"
                  : "border-slate-200 bg-slate-50 text-slate-300",
              ].join(" ")}
            >
              Apply Rename
            </button>
            {managedRenameValidation && (
              <p
                className={[
                  "md:col-span-2 text-xs font-semibold",
                  managedRenameValidation.state === "invalid"
                    ? "text-rose-600"
                    : "text-slate-500",
                ].join(" ")}
              >
                {managedRenameValidation.message}
              </p>
            )}
          </div>
        )}

        {isConfirmingManagedDelete && selectedRow && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">
              Confirm managed category delete
            </p>
            <p className="mt-1 text-sm font-medium text-slate-600">
              This will remove "{selectedRow.name}" from the Managed Categories
              list only. Existing Record Categories are not changed.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmingManagedDelete(false)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canDeleteSelectedManagedCategory}
                onClick={() => {
                  if (onDeleteManagedCategory(selectedRow.name)) {
                    setSelectedCategory("");
                    setIsConfirmingManagedDelete(false);
                  }
                }}
                className="h-9 rounded-md border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:text-slate-300"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-rose-200 bg-white shadow-sm shadow-slate-200/40">
        <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50/60 px-5 py-4">
          <h2 className="text-base font-semibold tracking-normal text-slate-950">
            Modify Records
          </h2>
          <span className="text-slate-600">^</span>
        </div>
        <div className="px-5 py-4">
          {!canUseSelectedForRecordActions || !recordPreview ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
              Select a Managed Category before preparing record category
              operations.
            </p>
          ) : (
            <>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                    <span>Selected Category</span>
                    <span className="rounded-md bg-sakura-100 px-2.5 py-1 text-sakura-600">
                      {selectedCategoryName}
                    </span>
                  </div>
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-700">Action</p>
                    <div className="mt-2 flex flex-wrap gap-5 text-sm font-medium text-slate-600">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          className="accent-sakura-500"
                          checked={recordActionMode === "rename"}
                          onChange={() => {
                            setRecordActionMode("rename");
                            setIsRecordConfirming(false);
                          }}
                        />
                        Rename in Records
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          className="accent-sakura-500"
                          checked={recordActionMode === "remove"}
                          onChange={() => {
                            setRecordActionMode("remove");
                            setIsRecordConfirming(false);
                          }}
                        />
                        Remove from Records
                      </label>
                    </div>
                  </div>
                  {recordActionMode === "rename" && (
                    <label className="mt-4 grid max-w-md gap-1.5 text-xs font-semibold text-slate-700">
                      New Category Name
                      <input
                        className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                        placeholder="New record category name"
                        value={recordRenameTarget}
                        onChange={(event) => {
                          setRecordRenameTarget(event.target.value);
                          setIsRecordConfirming(false);
                        }}
                      />
                    </label>
                  )}
                  {recordActionMode === "rename" && recordRenameValidation && (
                    <p
                      className={[
                        "mt-2 text-xs font-semibold",
                        recordRenameValidation.state === "invalid"
                          ? "text-rose-600"
                          : "text-slate-500",
                      ].join(" ")}
                    >
                      {recordRenameValidation.message}
                    </p>
                  )}
                </div>
                <PreviewSummary preview={recordPreview} />
              </div>

              <CategoryRecordPreview preview={recordPreview} />

              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/40 px-4 py-3">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-1 shrink-0 text-sakura-600" size={18} />
                  <ul className="list-disc space-y-1 pl-4 text-xs font-medium text-slate-600">
                    <li>Existing records are only changed after preview and confirmation.</li>
                    <li>Only category labels are changed.</li>
                    <li>Media files and unrelated fields are not changed.</li>
                  </ul>
                </div>
              </div>

              {isRecordConfirming && (
                <div
                  role="region"
                  aria-label={
                    recordActionMode === "rename"
                      ? "Record rename preview"
                      : "Record delete preview"
                  }
                  className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-slate-800">
                    {recordActionMode === "rename"
                      ? "Confirm record category rename"
                      : "Confirm record category removal"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    This will update categoriesJson for {recordPreview.total} existing
                    record{recordPreview.total === 1 ? "" : "s"}. Managed
                    Categories will not be changed.
                  </p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  disabled={!canApplyRecordOperation}
                  onClick={() => setIsRecordConfirming(true)}
                  className={[
                    "inline-flex h-10 items-center gap-2 rounded-md px-5 text-sm font-semibold",
                    canApplyRecordOperation
                      ? "bg-sakura-500 text-white hover:bg-sakura-600"
                      : "bg-slate-100 text-slate-300",
                  ].join(" ")}
                >
                  <Search size={16} />
                  Preview Changes
                </button>
                <button
                  type="button"
                  disabled={!isRecordConfirming || !canApplyRecordOperation}
                  onClick={async () => {
                    const applied =
                      recordActionMode === "rename"
                        ? await onApplyRecordCategoryRename(
                            selectedCategoryName,
                            recordRenameTarget,
                          )
                        : await onApplyRecordCategoryRemove(selectedCategoryName);
                    if (applied) {
                      setIsRecordConfirming(false);
                    }
                  }}
                  className={[
                    "h-10 rounded-md px-5 text-sm font-semibold",
                    isRecordConfirming && canApplyRecordOperation
                      ? "bg-sakura-500 text-white hover:bg-sakura-600"
                      : "bg-slate-100 text-slate-300",
                  ].join(" ")}
                >
                  {recordActionMode === "rename"
                    ? "Confirm Apply to Records"
                    : "Confirm Remove from Records"}
                </button>
                <button
                  type="button"
                  className="h-10 rounded-md border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setIsRecordConfirming(false);
                    setRecordRenameTarget("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm shadow-slate-200/40">
        <div className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-500 ring-1 ring-slate-200">
            <ShieldCheck size={16} />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-normal text-slate-950">
              Safety Notes
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs font-medium text-slate-600">
              <li>Category list changes do not automatically change existing records.</li>
              <li>Record changes require preview and confirmation.</li>
              <li>Media files and unrelated fields are not changed.</li>
              <li>Parent Category controls are visual-only and deferred.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function buildCategoryRows(
  audit: CategoryAuditSummary,
  managedCategories: string[],
) {
  const rowsByKey = new Map<string, CategoryTableRow>();

  for (const row of audit.rows) {
    rowsByKey.set(row.name.toLowerCase(), {
      ...row,
      isManaged: false,
      isRecordCategory: row.total > 0,
    });
  }

  for (const category of managedCategories) {
    const key = category.toLowerCase();
    const existing = rowsByKey.get(key);
    if (existing) {
      rowsByKey.set(key, { ...existing, isManaged: true });
    } else {
      rowsByKey.set(key, {
        name: category,
        videos: 0,
        images: 0,
        performers: 0,
        total: 0,
        isManaged: true,
        isRecordCategory: false,
      });
    }
  }

  return [...rowsByKey.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function filterCategoryRows(
  rows: CategoryTableRow[],
  searchTerm: string,
  filter: CategoryListFilter,
  sort: CategoryListSort,
) {
  const searchKey = searchTerm.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (searchKey && !row.name.toLowerCase().includes(searchKey)) {
      return false;
    }
    if (filter === "used") {
      return row.total > 0;
    }
    if (filter === "unused") {
      return row.total === 0;
    }
    if (filter === "record") {
      return row.isRecordCategory && !row.isManaged;
    }
    return true;
  });

  return filtered.sort((left, right) => {
    if (sort === "usage-desc") {
      return right.total - left.total || left.name.localeCompare(right.name);
    }
    if (sort === "usage-asc") {
      return left.total - right.total || left.name.localeCompare(right.name);
    }
    return left.name.localeCompare(right.name);
  });
}

function CategoryStatePill({ row }: { row: CategoryTableRow }) {
  if (row.total === 0) {
    return <SoftPill label="Unused" tone="slate" />;
  }
  if (row.isRecordCategory && !row.isManaged) {
    return <SoftPill label="Record-only" tone="violet" />;
  }
  return <SoftPill label="Used" tone="green" />;
}

function SoftPill({
  label,
  tone = "blue",
}: {
  label: string;
  tone?: "blue" | "green" | "slate" | "violet";
}) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "slate"
        ? "bg-slate-100 text-slate-600"
        : tone === "violet"
          ? "bg-violet-100 text-violet-700"
          : "bg-sky-100 text-sky-700";

  return (
    <span className={`inline-flex w-fit rounded-md px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
      {label}
    </span>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex size-8 items-center justify-center rounded-md transition",
        danger
          ? "text-rose-500 hover:bg-rose-50 disabled:text-slate-300"
          : "text-slate-500 hover:bg-slate-50 hover:text-sakura-600 disabled:text-slate-300",
      ].join(" ")}
    >
      {icon}
    </button>
  );
}

function DetailMetric({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className={strong ? "border-l border-slate-200 pl-5" : ""}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function PreviewSummary({ preview }: { preview: CategoryRenamePreview }) {
  return (
    <div className="border-l border-slate-200 pl-5">
      <p className="text-xs font-semibold text-slate-500">Preview Summary</p>
      <div className="mt-4 grid grid-cols-4 gap-4">
        <DetailMetric label="Videos" value={preview.videos} />
        <DetailMetric label="Images" value={preview.images} />
        <DetailMetric label="Performers" value={preview.performers} />
        <DetailMetric label="Total" value={preview.total} strong />
      </div>
    </div>
  );
}

function CategoryRecordPreview({ preview }: { preview: CategoryRenamePreview }) {
  const examplesByKind = {
    Video: preview.examples.filter((example) => example.kind === "Video"),
    Image: preview.examples.filter((example) => example.kind === "Image"),
    Performer: preview.examples.filter((example) => example.kind === "Performer"),
  };

  if (preview.total === 0) {
    return (
      <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500">
        No existing records use this category.
      </p>
    );
  }

  return (
    <div className="mt-5">
      <p className="text-xs font-semibold text-slate-500">
        Affected Examples (showing up to 5 per type)
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <ExampleList title="Videos" examples={examplesByKind.Video} />
        <ExampleList title="Images" examples={examplesByKind.Image} />
        <ExampleList title="Performers" examples={examplesByKind.Performer} />
      </div>
    </div>
  );
}

function ExampleList({
  title,
  examples,
}: {
  title: string;
  examples: CategoryRenamePreview["examples"];
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      {examples.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs font-medium text-slate-700">
          {examples.slice(0, 5).map((example, index) => (
            <li key={`${example.kind}-${example.label}-${index}`}>
              {example.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs font-medium text-slate-400">No examples</p>
      )}
    </div>
  );
}

function CategoryStatusMessage({ status }: { status: CategoryStatus }) {
  if (status.state === "idle") {
    return null;
  }

  const isError = status.state === "error";
  const message =
    status.state === "pending" ? "Updating category data..." : status.message;

  return (
    <p
      role={isError ? "alert" : "status"}
      className={`text-xs font-semibold ${
        isError ? "text-rose-600" : "text-slate-600"
      }`}
    >
      {message}
    </p>
  );
}

export default CategoryManagementPanel;
