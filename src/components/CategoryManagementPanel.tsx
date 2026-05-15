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

type CategoryListFilter = "all" | "managed" | "record" | "unused";
type CategoryListSort = "name" | "usage-desc" | "usage-asc";

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
  const [recordRenameSource, setRecordRenameSource] = useState("");
  const [recordRenameTarget, setRecordRenameTarget] = useState("");
  const [isConfirmingRecordRename, setIsConfirmingRecordRename] = useState(false);
  const [recordRemoveSource, setRecordRemoveSource] = useState("");
  const [isConfirmingRecordRemove, setIsConfirmingRecordRemove] = useState(false);

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
  const canDeleteSelectedManagedCategory =
    !!selectedRow && selectedRow.isManaged && selectedUsage === 0;
  const managedRenameValidation =
    selectedRow?.isManaged
      ? validateManagedCategoryRename(
          selectedRow.name,
          managedRenameTarget,
          managedCategories,
        )
      : null;
  const canApplyManagedRename =
    managedRenameValidation?.state === "valid" && !!selectedRow?.isManaged;

  const recordSourceCategories = managedCategories;
  const selectedRecordRenameSource =
    recordRenameSource && recordSourceCategories.includes(recordRenameSource)
      ? recordRenameSource
      : recordSourceCategories[0] ?? "";
  const selectedRecordRemoveSource =
    recordRemoveSource && recordSourceCategories.includes(recordRemoveSource)
      ? recordRemoveSource
      : recordSourceCategories[0] ?? "";
  const recordRenameValidation = selectedRecordRenameSource
    ? validateManagedCategoryRename(
        selectedRecordRenameSource,
        recordRenameTarget,
        managedCategories,
      )
    : null;
  const recordRenamePreview = selectedRecordRenameSource
    ? buildCategoryRenamePreview(selectedRecordRenameSource, renamePreviewRecords)
    : null;
  const canApplyRecordRename =
    recordRenameValidation?.state === "valid" &&
    (recordRenamePreview?.total ?? 0) > 0;
  const recordRemovePreview = selectedRecordRemoveSource
    ? buildCategoryDeletePreview(selectedRecordRemoveSource, renamePreviewRecords)
    : null;
  const canApplyRecordRemove = (recordRemovePreview?.total ?? 0) > 0;

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
    }
  }, [categoryRows, selectedCategory]);

  useEffect(() => {
    if (
      recordSourceCategories.length > 0 &&
      (!recordRenameSource || !recordSourceCategories.includes(recordRenameSource))
    ) {
      setRecordRenameSource(recordSourceCategories[0]);
    }
  }, [recordRenameSource, recordSourceCategories]);

  useEffect(() => {
    if (
      recordSourceCategories.length > 0 &&
      (!recordRemoveSource || !recordSourceCategories.includes(recordRemoveSource))
    ) {
      setRecordRemoveSource(recordSourceCategories[0]);
    }
  }, [recordRemoveSource, recordSourceCategories]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Catalog Settings
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-normal text-slate-950">
            Add / Edit Managed Category
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Managed Category changes update only the local managed list. Existing
            Videos, Images, and Performers are not changed here.
          </p>
        </div>
        <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-sm font-semibold text-slate-800">
              Add Category
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Category name</span>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                  placeholder="Category name"
                  value={managedCategoryInput}
                  onChange={(event) =>
                    onManagedCategoryInputChange(event.target.value)
                  }
                />
              </label>
              <button
                type="button"
                className="h-10 rounded-lg bg-sakura-500 px-4 text-sm font-semibold text-white shadow-sm shadow-sakura-100 transition hover:bg-sakura-600"
                onClick={onAddManagedCategory}
              >
                Add Category
              </button>
            </div>
            <CategoryStatusMessage status={managedCategoryStatus} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Edit Selected Managed Category
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Rename keeps Record Categories unchanged.
                </p>
              </div>
              <span className="w-fit rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                {selectedRow?.isManaged ? "Managed" : "Select managed row"}
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Proposed name
                <input
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100 disabled:bg-slate-100 disabled:text-slate-400"
                  disabled={!selectedRow?.isManaged}
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
                disabled={!canApplyManagedRename || !selectedRow}
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
                  "h-10 self-end rounded-lg border px-4 text-sm font-semibold",
                  canApplyManagedRename
                    ? "border-sakura-200 bg-sakura-50 text-sakura-600 hover:border-sakura-300 hover:bg-sakura-100"
                    : "border-slate-200 bg-slate-100 text-slate-400",
                ].join(" ")}
              >
                Apply Rename
              </button>
            </div>
            {managedRenameValidation && (
              <p
                className={[
                  "mt-2 text-xs font-semibold",
                  managedRenameValidation.state === "invalid"
                    ? "text-rose-600"
                    : "text-slate-500",
                ].join(" ")}
              >
                {managedRenameValidation.message}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-xl font-semibold tracking-normal text-slate-950">
            Categories Audit
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Search, filter, and review the combined Managed Category list and
            Record Category usage counts.
          </p>
        </div>
        <div className="grid gap-3 border-b border-slate-200 px-5 py-4 md:grid-cols-[minmax(0,1fr)_180px_180px]">
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Search categories
            <input
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
              placeholder="Search by category name"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Filter
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as CategoryListFilter)
              }
            >
              <option value="all">All categories</option>
              <option value="managed">Managed only</option>
              <option value="record">Record usage only</option>
              <option value="unused">Unused managed</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Sort
            <select
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as CategoryListSort)
              }
            >
              <option value="name">Name A-Z</option>
              <option value="usage-desc">Usage high to low</option>
              <option value="usage-asc">Usage low to high</option>
            </select>
          </label>
        </div>
        <div className="grid gap-2 border-b border-slate-200 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <CategoryAuditMetric label="Total unique categories" value={audit.totalUnique} />
          <CategoryAuditMetric label="Managed Categories" value={managedCategories.length} />
          <CategoryAuditMetric label="Categories used by Videos" value={audit.videoCategories} />
          <CategoryAuditMetric
            label="Categories used by Performers"
            value={audit.performerCategories}
          />
        </div>
        {filteredRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-5 py-3">Category</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Videos</th>
                  <th className="px-3 py-3">Images</th>
                  <th className="px-3 py-3">Performers</th>
                  <th className="px-3 py-3">Total</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRows.map((row) => (
                  <tr
                    key={row.name.toLowerCase()}
                    className={
                      selectedRow?.name === row.name
                        ? "bg-sakura-50/60"
                        : "bg-white"
                    }
                  >
                    <td className="px-5 py-3">
                      <span className="break-words font-semibold text-slate-800">
                        {row.name}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.isManaged && <CategoryBadge label="Managed" />}
                        {row.isRecordCategory && <CategoryBadge label="Record" />}
                        {!row.isRecordCategory && <CategoryBadge label="Unused" />}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-500">
                      {row.videos}
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-500">
                      {row.images}
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-500">
                      {row.performers}
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-800">
                      {row.total}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory(row.name);
                          setManagedRenameTarget("");
                          setIsConfirmingManagedDelete(false);
                        }}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:border-sakura-200 hover:text-sakura-600"
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mx-5 my-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
            Saved categories will appear here after records use them or managed
            categories are added.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Selected Category Detail
            </p>
            <h2 className="mt-1 break-words text-xl font-semibold tracking-normal text-slate-950">
              {selectedRow?.name ?? "No category selected"}
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              This card summarizes the selected label. It does not create
              parent categories or change record data by itself.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedRow?.isManaged && <CategoryBadge label="Managed Category" />}
            {selectedRow?.isRecordCategory && <CategoryBadge label="Record Category" />}
            {selectedRow && selectedUsage === 0 && <CategoryBadge label="Unused" />}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CategoryAuditMetric label="Videos" value={selectedRow?.videos ?? 0} />
          <CategoryAuditMetric label="Images" value={selectedRow?.images ?? 0} />
          <CategoryAuditMetric label="Performers" value={selectedRow?.performers ?? 0} />
          <CategoryAuditMetric label="Total usage" value={selectedUsage} />
        </div>
        {selectedRow?.isManaged && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/40 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Delete unused Managed Category
                </p>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Delete removes only the managed entry and is available only
                  when total usage is 0.
                </p>
              </div>
              <button
                type="button"
                disabled={!canDeleteSelectedManagedCategory}
                onClick={() => setIsConfirmingManagedDelete(true)}
                className={[
                  "h-10 rounded-lg border px-4 text-sm font-semibold",
                  canDeleteSelectedManagedCategory
                    ? "border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                    : "border-slate-200 bg-slate-100 text-slate-400",
                ].join(" ")}
              >
                Apply Delete
              </button>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              {canDeleteSelectedManagedCategory
                ? `${selectedRow.name} / 0 usage: eligible for deletion.`
                : `${selectedUsage} usage: cannot be deleted until usage is removed.`}
            </p>
            {isConfirmingManagedDelete && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-3">
                <p className="text-sm font-semibold text-slate-800">
                  Confirm managed category delete
                </p>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  This will remove "{selectedRow.name}" from the managed
                  category list only.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingManagedDelete(false)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (onDeleteManagedCategory(selectedRow.name)) {
                        setSelectedCategory("");
                        setIsConfirmingManagedDelete(false);
                      }
                    }}
                    className="h-9 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-xl font-semibold tracking-normal text-slate-950">
            Modify Records
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Record Category changes require preview and confirmation. These
            actions patch only `categoriesJson`.
          </p>
        </div>
        {managedCategories.length === 0 ? (
          <p className="mx-5 my-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
            Add a Managed Category before preparing record category operations.
          </p>
        ) : (
          <div className="grid gap-4 px-5 py-4 xl:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <h3 className="text-base font-semibold text-slate-800">
                Rename Category Across Records
              </h3>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Managed Categories are not automatically changed by this record
                operation.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Record category to rename
                  <select
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                    value={selectedRecordRenameSource}
                    onChange={(event) => {
                      setRecordRenameSource(event.target.value);
                      setRecordRenameTarget("");
                      setIsConfirmingRecordRename(false);
                    }}
                  >
                    {managedCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Proposed record category name
                  <input
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                    placeholder="New record category name"
                    value={recordRenameTarget}
                    onChange={(event) => {
                      setRecordRenameTarget(event.target.value);
                      setIsConfirmingRecordRename(false);
                    }}
                  />
                </label>
              </div>
              {recordRenameValidation && (
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
              {recordRenamePreview && (
                <CategoryRecordPreview
                  label="Record rename preview"
                  title="Record Rename Preview"
                  description="Applying rename to records updates only categoriesJson after confirmation."
                  preview={recordRenamePreview}
                  canApply={canApplyRecordRename}
                  isConfirming={isConfirmingRecordRename}
                  actionLabel="Apply to Records"
                  confirmTitle="Confirm record category rename"
                  confirmLabel="Confirm Apply to Records"
                  confirmDescription={`This will update categoriesJson for ${recordRenamePreview.total} existing record${
                    recordRenamePreview.total === 1 ? "" : "s"
                  }. Only category labels will change.`}
                  onStartApply={() => setIsConfirmingRecordRename(true)}
                  onCancelApply={() => setIsConfirmingRecordRename(false)}
                  onConfirmApply={async () => {
                    const applied = await onApplyRecordCategoryRename(
                      selectedRecordRenameSource,
                      recordRenameTarget,
                    );
                    if (applied) {
                      setIsConfirmingRecordRename(false);
                    }
                  }}
                />
              )}
            </div>

            <div className="rounded-lg border border-rose-200 bg-rose-50/30 p-4">
              <h3 className="text-base font-semibold text-slate-800">
                Remove Category From Records
              </h3>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Removal affects Record Categories only after confirmation.
              </p>
              <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-500">
                Record category to remove
                <select
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                  value={selectedRecordRemoveSource}
                  onChange={(event) => {
                    setRecordRemoveSource(event.target.value);
                    setIsConfirmingRecordRemove(false);
                  }}
                >
                  {managedCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              {recordRemovePreview && (
                <CategoryRecordPreview
                  label="Record delete preview"
                  title="Record Delete Preview"
                  description="Removing category from records updates only categoriesJson after confirmation."
                  preview={recordRemovePreview}
                  canApply={canApplyRecordRemove}
                  isConfirming={isConfirmingRecordRemove}
                  actionLabel="Remove from Records"
                  confirmTitle="Confirm record category removal"
                  confirmLabel="Confirm Remove from Records"
                  confirmDescription={`This will update categoriesJson for ${recordRemovePreview.total} existing record${
                    recordRemovePreview.total === 1 ? "" : "s"
                  }. Managed categories will not be changed.`}
                  onStartApply={() => setIsConfirmingRecordRemove(true)}
                  onCancelApply={() => setIsConfirmingRecordRemove(false)}
                  onConfirmApply={async () => {
                    const applied = await onApplyRecordCategoryRemove(
                      selectedRecordRemoveSource,
                    );
                    if (applied) {
                      setIsConfirmingRecordRemove(false);
                    }
                  }}
                />
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white px-5 py-4">
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">
          Safety Notes
        </h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {[
            "Managed Categories and Record Categories remain separate.",
            "Managed-only add, rename, and delete do not mutate records.",
            "Record operations require preview and confirmation.",
            "Record operations patch only `categoriesJson`.",
            "Videos, Images, Performers, media files, and unrelated fields are unchanged.",
            "No parent/child category behavior is implemented in this batch.",
          ].map((note) => (
            <p
              key={note}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600"
            >
              {note}
            </p>
          ))}
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

    if (filter === "managed") {
      return row.isManaged;
    }
    if (filter === "record") {
      return row.isRecordCategory;
    }
    if (filter === "unused") {
      return row.isManaged && row.total === 0;
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

function CategoryBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex w-fit rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
      {label}
    </span>
  );
}

function CategoryAuditMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function CategoryRecordPreview({
  label,
  title,
  description,
  preview,
  canApply,
  isConfirming,
  actionLabel,
  confirmTitle,
  confirmLabel,
  confirmDescription,
  onStartApply,
  onCancelApply,
  onConfirmApply,
}: {
  label: string;
  title: string;
  description: string;
  preview: CategoryRenamePreview;
  canApply: boolean;
  isConfirming: boolean;
  actionLabel: string;
  confirmTitle: string;
  confirmLabel: string;
  confirmDescription: string;
  onStartApply: () => void;
  onCancelApply: () => void;
  onConfirmApply: () => void;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      className="mt-4 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">
            {title}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {description}
          </p>
        </div>
        <button
          type="button"
          disabled={!canApply}
          onClick={onStartApply}
          className={[
            "h-9 rounded-lg border px-3 text-xs font-semibold",
            canApply
              ? "border-sakura-200 bg-sakura-50 text-sakura-600 hover:border-sakura-300 hover:bg-sakura-100"
              : "border-slate-200 bg-slate-100 text-slate-400",
          ].join(" ")}
        >
          {actionLabel}
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <CategoryAuditMetric label="Affected Videos" value={preview.videos} />
        <CategoryAuditMetric label="Affected Images" value={preview.images} />
        <CategoryAuditMetric
          label="Affected Performers"
          value={preview.performers}
        />
        <CategoryAuditMetric label="Total affected records" value={preview.total} />
      </div>
      {preview.total === 0 ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500">
          No existing records use this category.
        </p>
      ) : (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Affected examples
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {preview.examples.map((example, index) => (
              <span
                key={`${example.kind}-${example.label}-${index}`}
                className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
              >
                <span className="text-sakura-600">{example.kind}</span>
                <span className="break-words">{example.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {isConfirming && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-3">
          <p className="text-sm font-semibold text-slate-800">{confirmTitle}</p>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {confirmDescription}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCancelApply}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmApply}
              className="h-9 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-100"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
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
      className={`mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold ${
        isError ? "text-rose-600" : "text-slate-600"
      }`}
    >
      {message}
    </p>
  );
}

export default CategoryManagementPanel;
