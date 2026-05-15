import { useEffect, useState } from "react";
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
    <CatalogSettingsCard
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

function CatalogSettingsCard({
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
  const hasCategories = audit.rows.length > 0;
  const [renameSourceCategory, setRenameSourceCategory] = useState("");
  const [renameTargetCategory, setRenameTargetCategory] = useState("");
  const [isConfirmingRecordRename, setIsConfirmingRecordRename] = useState(false);
  const [deleteSourceCategory, setDeleteSourceCategory] = useState("");
  const [isConfirmingDeleteCategory, setIsConfirmingDeleteCategory] =
    useState(false);
  const [isConfirmingRecordDelete, setIsConfirmingRecordDelete] = useState(false);
  const managedCategoryRows = managedCategories.map((category) => {
    const usage =
      audit.rows.find((row) => row.name.toLowerCase() === category.toLowerCase())
        ?.total ?? 0;
    return { category, usage };
  });
  const selectedRenameCategory =
    renameSourceCategory && managedCategories.includes(renameSourceCategory)
      ? renameSourceCategory
      : managedCategories[0] ?? "";
  const renameValidation = selectedRenameCategory
    ? validateManagedCategoryRename(
        selectedRenameCategory,
        renameTargetCategory,
        managedCategories,
      )
    : null;
  const canApplyRename = renameValidation?.state === "valid";
  const renamePreview = selectedRenameCategory
    ? buildCategoryRenamePreview(selectedRenameCategory, renamePreviewRecords)
    : null;
  const canApplyRecordRename =
    canApplyRename && (renamePreview?.total ?? 0) > 0;
  const selectedDeleteCategory =
    deleteSourceCategory && managedCategories.includes(deleteSourceCategory)
      ? deleteSourceCategory
      : managedCategories[0] ?? "";
  const selectedDeleteRow =
    managedCategoryRows.find((row) => row.category === selectedDeleteCategory) ??
    null;
  const canApplyDelete = !!selectedDeleteRow && selectedDeleteRow.usage === 0;
  const deletePreview = selectedDeleteCategory
    ? buildCategoryDeletePreview(selectedDeleteCategory, renamePreviewRecords)
    : null;
  const canRemoveFromRecords =
    !!selectedDeleteCategory && (deletePreview?.total ?? 0) > 0;

  useEffect(() => {
    if (
      managedCategories.length > 0 &&
      (!renameSourceCategory || !managedCategories.includes(renameSourceCategory))
    ) {
      setRenameSourceCategory(managedCategories[0]);
    }
  }, [managedCategories, renameSourceCategory]);

  useEffect(() => {
    if (
      managedCategories.length > 0 &&
      (!deleteSourceCategory || !managedCategories.includes(deleteSourceCategory))
    ) {
      setDeleteSourceCategory(managedCategories[0]);
    }
  }, [managedCategories, deleteSourceCategory]);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">
          Catalog Settings
        </h2>
      </div>
      <div className="space-y-4 px-6 py-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              Categories Audit
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Audit lists Record Categories. Managed Category rename only updates the local managed list.
            </p>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <CategoryAuditMetric label="Total unique categories" value={audit.totalUnique} />
            <CategoryAuditMetric label="Categories used by Videos" value={audit.videoCategories} />
            <CategoryAuditMetric label="Categories used by Images" value={audit.imageCategories} />
            <CategoryAuditMetric
              label="Categories used by Performers"
              value={audit.performerCategories}
            />
          </div>

          {hasCategories ? (
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-[minmax(160px,1.5fr)_repeat(4,minmax(80px,0.7fr))] gap-2 bg-white px-3 py-2 text-xs font-semibold uppercase text-slate-500">
                  <span>Category</span>
                  <span>Videos</span>
                  <span>Images</span>
                  <span>Performers</span>
                  <span>Total</span>
                </div>
                <div className="divide-y divide-slate-200">
                  {audit.rows.map((row) => (
                    <div
                      key={row.name.toLowerCase()}
                      className="grid grid-cols-[minmax(160px,1.5fr)_repeat(4,minmax(80px,0.7fr))] gap-2 px-3 py-2 text-sm"
                    >
                      <span className="break-words font-semibold text-slate-700">
                        {row.name}
                      </span>
                      <span className="font-medium text-slate-500">{row.videos}</span>
                      <span className="font-medium text-slate-500">{row.images}</span>
                      <span className="font-medium text-slate-500">{row.performers}</span>
                      <span className="font-semibold text-slate-700">{row.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-500">
              Saved categories will appear here after records use them.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              Category Management
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Managed Categories and Record Categories stay separate. Record operations require preview and confirmation.
            </p>
          </div>
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Add Category
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
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

          {managedCategoryRows.length > 0 && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Managed Categories
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {managedCategoryRows.map((row) => (
                  <span
                    key={row.category.toLowerCase()}
                    className="inline-flex max-w-full items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
                  >
                    <span className="break-words">{row.category}</span>
                    <span className="text-slate-400">
                      {row.usage === 0
                        ? "Unused / 0 usage"
                        : `${row.usage} usage`}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {managedCategories.length > 0 && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Rename Category
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Rename applies only to Managed Categories. Existing Record Categories are not changed.
                </p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Existing category
                  <select
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                    value={selectedRenameCategory}
                    onChange={(event) => {
                      setRenameSourceCategory(event.target.value);
                      setRenameTargetCategory("");
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
                  Proposed name
                  <input
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                    placeholder="New category name"
                    value={renameTargetCategory}
                    onChange={(event) => {
                      setRenameTargetCategory(event.target.value);
                      setIsConfirmingRecordRename(false);
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={!canApplyRename}
                  onClick={() => {
                    if (
                      onRenameManagedCategory(
                        selectedRenameCategory,
                        renameTargetCategory,
                      )
                    ) {
                      setRenameTargetCategory("");
                    }
                  }}
                  className={[
                    "h-10 self-end rounded-lg border px-4 text-sm font-semibold md:w-auto",
                    canApplyRename
                      ? "border-sakura-200 bg-sakura-50 text-sakura-600 hover:border-sakura-300 hover:bg-sakura-100"
                      : "border-slate-200 bg-slate-100 text-slate-400",
                  ].join(" ")}
                >
                  Apply Rename
                </button>
              </div>
              {renameValidation && (
                <p
                  className={[
                    "mt-2 text-xs font-semibold",
                    renameValidation.state === "invalid"
                      ? "text-rose-600"
                      : "text-slate-500",
                  ].join(" ")}
                >
                  {renameValidation.message}
                </p>
              )}
              {renamePreview && (
                <CategoryRecordRenamePreview
                  preview={renamePreview}
                  canApply={canApplyRecordRename}
                  isConfirming={isConfirmingRecordRename}
                  onStartApply={() => setIsConfirmingRecordRename(true)}
                  onCancelApply={() => setIsConfirmingRecordRename(false)}
                  onConfirmApply={async () => {
                    const applied = await onApplyRecordCategoryRename(
                      selectedRenameCategory,
                      renameTargetCategory,
                    );
                    if (applied) {
                      setIsConfirmingRecordRename(false);
                    }
                  }}
                />
              )}
            </div>
          )}

          {managedCategories.length > 0 && selectedDeleteRow && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Delete Unused Category
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Delete removes only an unused Managed Category entry. Existing Record Categories are not changed.
                </p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Category to delete
                  <select
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                    value={selectedDeleteCategory}
                    onChange={(event) => {
                      setDeleteSourceCategory(event.target.value);
                      setIsConfirmingDeleteCategory(false);
                      setIsConfirmingRecordDelete(false);
                    }}
                  >
                    {managedCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-1 text-xs font-semibold text-slate-500">
                  Usage status
                  <p className="flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                    {selectedDeleteRow.usage === 0
                      ? "Unused / 0 usage: eligible for deletion."
                      : `${selectedDeleteRow.usage} usage: cannot be deleted until usage is removed.`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canApplyDelete}
                  onClick={() => setIsConfirmingDeleteCategory(true)}
                  className={[
                    "h-10 self-end rounded-lg border px-4 text-sm font-semibold md:w-auto",
                    canApplyDelete
                      ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                      : "border-slate-200 bg-slate-100 text-slate-400",
                  ].join(" ")}
                >
                  Apply Delete
                </button>
              </div>
              <p className="mt-2 text-xs font-medium text-slate-500">
                Delete removes only the managed category entry. Existing record categories are not changed.
              </p>
              {isConfirmingDeleteCategory && (
                <div className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-3">
                  <p className="text-sm font-semibold text-slate-800">
                    Confirm managed category delete
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    This will remove "{selectedDeleteCategory}" from the managed category list only.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDeleteCategory(false)}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onDeleteManagedCategory(selectedDeleteCategory)) {
                          setIsConfirmingDeleteCategory(false);
                        }
                      }}
                      className="h-9 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              )}
              {deletePreview && (
                <CategoryRecordDeletePreview
                  preview={deletePreview}
                  canApply={canRemoveFromRecords}
                  isConfirming={isConfirmingRecordDelete}
                  onStartApply={() => setIsConfirmingRecordDelete(true)}
                  onCancelApply={() => setIsConfirmingRecordDelete(false)}
                  onConfirmApply={async () => {
                    const applied = await onApplyRecordCategoryRemove(
                      selectedDeleteCategory,
                    );
                    if (applied) {
                      setIsConfirmingRecordDelete(false);
                    }
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </section>
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

function CategoryRecordRenamePreview({
  preview,
  canApply,
  isConfirming,
  onStartApply,
  onCancelApply,
  onConfirmApply,
}: {
  preview: CategoryRenamePreview;
  canApply: boolean;
  isConfirming: boolean;
  onStartApply: () => void;
  onCancelApply: () => void;
  onConfirmApply: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="Record rename preview"
      className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">
            Record Rename Preview
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Applying rename to records updates only categoriesJson after confirmation.
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
          Apply to Records
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
          <p className="text-sm font-semibold text-slate-800">
            Confirm record category rename
          </p>
          <p className="mt-1 text-sm font-medium text-slate-500">
            This will update categoriesJson for {preview.total} existing record
            {preview.total === 1 ? "" : "s"}. Only category labels will change.
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
              Confirm Apply to Records
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryRecordDeletePreview({
  preview,
  canApply,
  isConfirming,
  onStartApply,
  onCancelApply,
  onConfirmApply,
}: {
  preview: CategoryRenamePreview;
  canApply: boolean;
  isConfirming: boolean;
  onStartApply: () => void;
  onCancelApply: () => void;
  onConfirmApply: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="Record delete preview"
      className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">
            Record Delete Preview
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Removing category from records updates only categoriesJson after confirmation.
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
          Remove from Records
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
          <p className="text-sm font-semibold text-slate-800">
            Confirm record category removal
          </p>
          <p className="mt-1 text-sm font-medium text-slate-500">
            This will update categoriesJson for {preview.total} existing record
            {preview.total === 1 ? "" : "s"}. Managed categories will not be changed.
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
              Confirm Remove from Records
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
      className={`mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold ${
        isError ? "text-rose-600" : "text-slate-600"
      }`}
    >
      {message}
    </p>
  );
}

export default CategoryManagementPanel;
