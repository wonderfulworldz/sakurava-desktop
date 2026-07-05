import {
  ChevronRight,
  CloudOff,
  Database,
  FileArchive,
  FileInput,
  FileText,
  Folder,
  HardDrive,
  Monitor,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  Video,
  Image as ImageIcon,
  UserRound,
  FilePenLine,
  ImageUp,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type {
  Image,
  ManagedCategory,
  Performer,
  Video as VideoRecord,
} from "../backend/types";
import { buildCategoryAudit, type CategoryAuditSummary } from "../lib/categoryAudit";
import {
  removeCategoryFromCategoriesJson,
  renameCategoryInCategoriesJson,
} from "../lib/categoryRenameApply";
import {
  type AppearanceAccent,
  type AppearanceDensity,
  type AppearanceTheme,
  type AppearanceUiScale,
  getStoredAppearanceAccent,
  getStoredAppearanceDensity,
  getStoredAppearanceTheme,
  getStoredAppearanceUiScale,
  normalizeAppearanceAccent,
  storeAppearanceAccent,
  storeAppearanceDensity,
  storeAppearanceTheme,
  storeAppearanceUiScale,
} from "../lib/appearanceTheme";
import { useLanguage, useTranslation } from "../lib/LanguageContext";
import {
  buildEntityCsv,
  exportEntityLabel,
  type ExportCsvEntity,
} from "../lib/exportCsv";
import { normalizeLanguageCode, type LanguageCode } from "../lib/language";
import {
  buildImportCsvPreview,
  type ImportCsvPreview,
} from "../lib/importCsvPreview";
import {
  applyImportCsvPreview,
  countApplicableImportRows,
  type ImportCsvApplyReport,
} from "../lib/importCsvApply";
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
import { clearAppCache } from "../runtime/cacheCommands";
import { backUpDatabase, restoreDatabase } from "../runtime/databaseCommands";
import {
  selectDatabaseBackupDestination,
  selectDatabaseRestoreSource,
  selectExportCsvDestination,
  selectImportCsvSource,
  selectLanguageCsvExportDestination,
  selectLanguageCsvImportSource,
  selectLocalFolder,
} from "../runtime/dialogCommands";
import { writeExportCsv } from "../runtime/exportCommands";
import { readImportCsv } from "../runtime/importCommands";
import {
  applyCustomLanguageCsvPreview,
  buildLanguageExportCsv,
  buildCustomLanguageCsvPreview,
  type CustomLanguageCsvPreview as CustomLanguageCsvPreviewType,
} from "../lib/languageCsv";
import {
  isCustomLanguageCode,
  removeCustomLanguage,
} from "../lib/customLanguages";
import { resetAllOverridesForLanguage } from "../lib/languageOverrides";
import {
  getCatalogPreferenceToggles,
  resetRememberedCatalogPreferences,
  setCatalogPreferenceToggle,
  type CatalogPreferenceToggles,
} from "../lib/catalogPreferences";
import { clearSessionFilterState } from "../lib/sessionFilterState";
import { createImage, deleteImage, listImages, updateImage } from "../runtime/imageCommands";
import {
  createManagedCategory,
  deleteManagedCategory as deleteManagedCategoryRecord,
  listManagedCategories,
  updateManagedCategory,
} from "../runtime/managedCategoryCommands";
import {
  allowMediaAssetRoot,
  getStoredMediaAssetRoots,
  storeMediaAssetRoots,
} from "../runtime/mediaAssetScope";
import {
  createPerformer,
  deletePerformer,
  listPerformers,
  updatePerformer,
} from "../runtime/performerCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";
import { createVideo, deleteVideo, listVideos, updateVideo } from "../runtime/videoCommands";

type SettingsRow = {
  label: string;
  value: string;
  icon: LucideIcon;
};

type SettingsAction = {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
};

type BackupStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type RestoreStatus =
  | { state: "idle" }
  | { state: "confirming"; sourcePath: string }
  | { state: "pending"; sourcePath: string }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type CacheStatus =
  | { state: "idle" }
  | { state: "confirming" }
  | { state: "pending" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type MediaRootStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type CategoryStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type ExportStatus =
  | { state: "idle" }
  | { state: "pending"; entity: ExportCsvEntity }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type ImportStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "preview"; sourcePath: string; preview: ImportCsvPreview }
  | { state: "error"; message: string };
type ImportApplyStatus =
  | { state: "idle" }
  | { state: "confirming"; preview: ImportCsvPreview }
  | { state: "pending" }
  | { state: "report"; report: ImportCsvApplyReport }
  | { state: "error"; message: string };
type ImportPreviewRow = ImportCsvPreview["rows"][number];
type ImportPreviewRowStatus = "Ready" | "Warning" | "Error" | "Blocked" | "Skipped";

type LanguageCsvStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "exportSuccess"; message: string }
  | { state: "customPreview"; preview: CustomLanguageCsvPreviewType }
  | { state: "removeConfirm"; code: string; label: string }
  | { state: "applySuccess"; message: string }
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

const appOverviewRows: SettingsRow[] = [
  { label: "App Name", value: "Sakurava", icon: Tag },
  { label: "Version", value: "1.0.0 MVP", icon: ShieldCheck },
  { label: "Mode", value: "Local / Offline", icon: CloudOff },
  { label: "Platform Target", value: "Windows Desktop", icon: Monitor },
];

const dataSafetyRows: SettingsRow[] = [
  { label: "Data Privacy", value: "Local device only", icon: ShieldCheck },
  { label: "Internet Required", value: "No", icon: CloudOff },
  { label: "Cloud Sync", value: "Not enabled", icon: CloudOff },
];

const featureStatusRows: SettingsRow[] = [
  { label: "Videos", value: "Runtime CRUD enabled", icon: Video },
  { label: "Images", value: "Runtime CRUD enabled", icon: ImageIcon },
  { label: "Performers", value: "Runtime CRUD enabled", icon: UserRound },
  { label: "Forms", value: "Runtime create/update enabled", icon: FilePenLine },
  { label: "Safe Delete", value: "Single-record confirmation enabled", icon: ShieldCheck },
];

const plannedActionRows: SettingsRow[] = [
  { label: "Catalog Preferences", value: "Current defaults", icon: SlidersHorizontal },
  { label: "Bulk Editor", value: "Deferred", icon: FilePenLine },
  { label: "Optimize / Cleanup", value: "Deferred", icon: ShieldCheck },
  { label: "Analytics", value: "Deferred", icon: FileText },
];

const cacheRows: SettingsRow[] = [
  { label: "Generated cache", value: "Planned / disabled", icon: HardDrive },
  { label: "Source media", value: "Never cleared here", icon: ShieldCheck },
  { label: "Thumbnail cache", value: "Batch 35 planning", icon: ImageUp },
];

const importExportRows: SettingsRow[] = [
  { label: "Import Data", value: "CSV preview available", icon: FileInput },
  { label: "Export Data", value: "CSV available", icon: FileArchive },
  { label: "Record types", value: "Videos, Images, Performers, Categories", icon: Tag },
  { label: "Media files", value: "Not included", icon: ShieldCheck },
];

const appearanceRows: SettingsRow[] = [
  { label: "Theme", value: "Sakurava default", icon: Palette },
  { label: "Light/Dark Mode", value: "Light and Dark available", icon: Monitor },
  { label: "Accent Style", value: "Sakura Pink", icon: Palette },
  { label: "UI Density", value: "Compact", icon: SlidersHorizontal },
];

const languageRows: SettingsRow[] = [
  { label: "App Language", value: "English current", icon: FileText },
  { label: "Language Editor", value: "Planned / disabled", icon: FilePenLine },
  { label: "Editing direction", value: "Per-language CSV planned", icon: FileArchive },
];

const safetyDiagnosticRows: SettingsRow[] = [
  { label: "Local/offline behavior", value: "Enabled", icon: CloudOff },
  { label: "Destructive operations", value: "Confirmation required", icon: ShieldCheck },
  { label: "Source media safety", value: "No file mutation", icon: HardDrive },
  { label: "Diagnostics", value: "Planned / disabled", icon: FileText },
];

function SettingsPage() {
  const isDesktopRuntime = isTauriRuntimeAvailable();
  const { languageCode, setLanguageCode, t, refreshOverrides, refreshLanguages, languages } = useLanguage();
  const [appearanceTheme, setAppearanceTheme] = useState<AppearanceTheme>(
    () => getStoredAppearanceTheme(),
  );
  const [appearanceAccent, setAppearanceAccent] = useState<AppearanceAccent>(
    () => getStoredAppearanceAccent(),
  );
  const [appearanceDensity, setAppearanceDensity] =
    useState<AppearanceDensity>(() => getStoredAppearanceDensity());
  const [appearanceUiScale, setAppearanceUiScale] =
    useState<AppearanceUiScale>(() => getStoredAppearanceUiScale());
  const [catalogPreferenceToggles, setCatalogPreferenceToggles] =
    useState<CatalogPreferenceToggles>(() => getCatalogPreferenceToggles());
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({
    state: "idle",
  });
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>({
    state: "idle",
  });
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>({
    state: "idle",
  });
  const [mediaRoots, setMediaRoots] = useState<string[]>([]);
  const [selectedMediaRoot, setSelectedMediaRoot] = useState<string | null>(null);
  const [mediaRootStatus, setMediaRootStatus] = useState<MediaRootStatus>({
    state: "idle",
  });
  const [exportStatus, setExportStatus] = useState<ExportStatus>({
    state: "idle",
  });
  const [isExportPanelOpen, setIsExportPanelOpen] = useState(false);
  const [languageCsvStatus, setLanguageCsvStatus] = useState<LanguageCsvStatus>({
    state: "idle",
  });
  const [isLanguageManagerOpen, setIsLanguageManagerOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    state: "idle",
  });
  const [importApplyStatus, setImportApplyStatus] = useState<ImportApplyStatus>({
    state: "idle",
  });
  const [categoryAudit, setCategoryAudit] =
    useState<CategoryAuditSummary>(emptyCategoryAudit);
  const [categoryRenamePreviewRecords, setCategoryRenamePreviewRecords] =
    useState(emptyCategoryRenamePreviewRecords);
  const [managedCategories, setManagedCategories] = useState<string[]>([]);
  const [managedCategoryInput, setManagedCategoryInput] = useState("");
  const [managedCategoryStatus, setManagedCategoryStatus] =
    useState<CategoryStatus>({ state: "idle" });
  const isBackupPending = backupStatus.state === "pending";
  const isRestorePending = restoreStatus.state === "pending";
  const isCachePending = cacheStatus.state === "pending";
  const isMediaRootPending = mediaRootStatus.state === "pending";
  const isExportPending = exportStatus.state === "pending";
  const isImportPending = importStatus.state === "pending";
  const isImportApplyPending = importApplyStatus.state === "pending";
  const canBackUpDatabase = isDesktopRuntime && !isBackupPending && !isRestorePending;
  const canRestoreDatabase =
    isDesktopRuntime && !isBackupPending && !isRestorePending;
  const canClearCache =
    isDesktopRuntime && !isCachePending && !isBackupPending && !isRestorePending;
  const canExportCsv =
    isDesktopRuntime && !isExportPending && !isBackupPending && !isRestorePending;
  const canImportCsv =
    isDesktopRuntime &&
    !isImportPending &&
    !isImportApplyPending &&
    !isBackupPending &&
    !isRestorePending;
  const canAddMediaRoot = isDesktopRuntime && !isMediaRootPending;
  const isLanguageCsvBusy = languageCsvStatus.state === "pending";

  function handleCatalogPreferenceToggle(
    key: keyof CatalogPreferenceToggles,
    enabled: boolean,
  ) {
    setCatalogPreferenceToggle(key, enabled);
    setCatalogPreferenceToggles(getCatalogPreferenceToggles());
  }

  function handleResetCatalogPreferences() {
    resetRememberedCatalogPreferences();
    for (const key of [
      "catalog:videos",
      "catalog:images",
      "catalog:performers",
      "category-management",
      "glossary-library",
    ]) {
      clearSessionFilterState(key);
    }
  }
  const thumbnailRows: SettingsRow[] = [
    {
      label: "Manual thumbnail rendering",
      value: "Enabled",
      icon: ImageUp,
    },
    {
      label: "Asset access scope",
      value:
        mediaRoots.length > 0
          ? "Pictures, Videos, Documents, Downloads, and configured media roots"
          : "Pictures, Videos, Documents, and Downloads",
      icon: Folder,
    },
    {
      label: "Configured media roots",
      value: mediaRoots.length > 0 ? `${mediaRoots.length} configured` : "None",
      icon: Folder,
    },
    {
      label: "Browser preview thumbnails",
      value: "Placeholders only",
      icon: CloudOff,
    },
  ];
  const runtimeRows: SettingsRow[] = [
    {
      label: "App mode",
      value: isDesktopRuntime ? "Desktop runtime" : "Browser preview",
      icon: isDesktopRuntime ? Monitor : CloudOff,
    },
    {
      label: "Database status",
      value: isDesktopRuntime ? "Available" : "Unavailable",
      icon: Database,
    },
    {
      label: "Database file",
      value: "Local SQLite database",
      icon: Database,
    },
    {
      label: "Data storage",
      value: "Stored locally on this device",
      icon: Folder,
    },
    { label: "Storage mode", value: "Local only", icon: HardDrive },
  ];

  useEffect(() => {
    setMediaRoots(getStoredMediaAssetRoots());
    setManagedCategories(getStoredManagedCategories());
  }, []);

  useEffect(() => {
    setSelectedMediaRoot((current) => {
      if (current && hasMediaRoot(mediaRoots, current)) {
        return mediaRoots.find(
          (root) => mediaRootKey(root) === mediaRootKey(current),
        ) ?? mediaRoots[0] ?? null;
      }
      return mediaRoots[0] ?? null;
    });
  }, [mediaRoots]);

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

  async function handleBackupData() {
    if (!canBackUpDatabase) {
      return;
    }

    setBackupStatus({ state: "pending" });

    try {
      const destinationPath = await selectDatabaseBackupDestination();

      if (!destinationPath) {
        setBackupStatus({ state: "idle" });
        return;
      }

      const result = await backUpDatabase(destinationPath);
      if (!result.success) {
        setBackupStatus({
          state: "error",
          message: "Backup did not complete. No database backup was created.",
        });
        return;
      }

      setBackupStatus({
        state: "success",
        message: `Backup created at ${result.destinationPath}`,
      });
    } catch (error) {
      setBackupStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
            : "Backup failed. The database was not backed up.",
      });
    }
  }

  async function handleRestoreData() {
    if (!canRestoreDatabase) {
      return;
    }

    try {
      const sourcePath = await selectDatabaseRestoreSource();

      if (!sourcePath) {
        setRestoreStatus({ state: "idle" });
        return;
      }

      setRestoreStatus({ state: "confirming", sourcePath });
    } catch (error) {
      setRestoreStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Restore failed before a source file was selected.",
      });
    }
  }

  async function handleConfirmRestore() {
    if (restoreStatus.state !== "confirming") {
      return;
    }

    const { sourcePath } = restoreStatus;
    setRestoreStatus({ state: "pending", sourcePath });

    try {
      const result = await restoreDatabase(sourcePath);
      if (!result.success) {
        setRestoreStatus({
          state: "error",
          message: "Restore did not complete. The current database was not replaced.",
        });
        return;
      }

      const restartMessage = result.restartRequired
        ? " Restart Sakurava to use the restored database."
        : "";
      setRestoreStatus({
        state: "success",
        message: `Restored database from ${result.sourcePath}. Safety backup: ${result.safetyBackupPath}.${restartMessage}`,
      });
    } catch (error) {
      setRestoreStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Restore failed. The current database was not replaced.",
      });
    }
  }

  function handleThemeChange(theme: AppearanceTheme) {
    setAppearanceTheme(theme);
    storeAppearanceTheme(theme);
  }

  function handleAccentChange(accent: AppearanceAccent) {
    const normalized = normalizeAppearanceAccent(accent);
    setAppearanceAccent(normalized);
    storeAppearanceAccent(normalized);
  }

  function handleDensityChange(density: AppearanceDensity) {
    setAppearanceDensity(density);
    storeAppearanceDensity(density);
  }

  function handleUiScaleChange(scale: AppearanceUiScale) {
    setAppearanceUiScale(scale);
    storeAppearanceUiScale(scale);
  }

  function handleResetAppearance() {
    handleThemeChange("light");
    handleAccentChange({ type: "sakura" });
    handleDensityChange("comfortable");
    handleUiScaleChange("100");
  }

  function handleLanguageChange(value: string) {
    setLanguageCode(normalizeLanguageCode(value));
  }

  async function handleExportLanguageTemplate() {
    if (isLanguageCsvBusy) {
      return;
    }

    setLanguageCsvStatus({ state: "pending" });

    try {
      const destinationPath = await selectLanguageCsvExportDestination(languageCode);
      if (!destinationPath) {
        setLanguageCsvStatus({ state: "idle" });
        return;
      }

      const csvContent = buildLanguageExportCsv(languageCode);
      await writeExportCsv(destinationPath, csvContent);
      setLanguageCsvStatus({
        state: "exportSuccess",
        message: `Language CSV exported to ${destinationPath}`,
      });
    } catch (error) {
      setLanguageCsvStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Language CSV export failed.",
      });
    }
  }

  async function handleAddLanguageFromCsv() {
    if (isLanguageCsvBusy) {
      return;
    }

    setLanguageCsvStatus({ state: "pending" });

    try {
      const sourcePath = await selectLanguageCsvImportSource();
      if (!sourcePath) {
        setLanguageCsvStatus({ state: "idle" });
        return;
      }

      const result = await readImportCsv(sourcePath);
      const preview = buildCustomLanguageCsvPreview(result.csvContent);
      if (preview.headerError) {
        setLanguageCsvStatus({ state: "error", message: preview.headerError });
        return;
      }
      setLanguageCsvStatus({ state: "customPreview", preview });
    } catch (error) {
      setLanguageCsvStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Custom language CSV import failed.",
      });
    }
  }

  function handleApplyCustomLanguageCsv(preview: CustomLanguageCsvPreviewType) {
    const report = applyCustomLanguageCsvPreview(preview);
    if (report.applied === 0 && report.errors > 0) {
      setLanguageCsvStatus({
        state: "error",
        message: "Language CSV was not applied. Existing languages were not changed.",
      });
      return;
    }
    refreshLanguages();
    refreshOverrides();
    setLanguageCsvStatus({
      state: "applySuccess",
      message: `${preview.isNew ? "Added" : "Updated"} language "${preview.languageName}" (${preview.languageCode}). ${report.applied} translation${report.applied === 1 ? "" : "s"} applied. ${report.skipped} skipped.`,
    });
  }

  function handleRemoveCustomLanguage(code: string, label: string) {
    if (!isCustomLanguageCode(code)) return;
    setLanguageCsvStatus({
      state: "removeConfirm",
      code,
      label,
    });
  }

  function handleConfirmRemoveLanguage(code: string) {
    const result = removeCustomLanguage(code);
    if (!result.ok) {
      setLanguageCsvStatus({
        state: "error",
        message: result.error ?? "Language could not be removed.",
      });
      return;
    }
    resetAllOverridesForLanguage(code);
    refreshLanguages();
    // If the removed language was active, switch to English
    if (languageCode === code) {
      setLanguageCode("en");
    }
    setLanguageCsvStatus({
      state: "applySuccess",
      message: `Removed language "${code}". Switched to English if it was active.`,
    });
  }

  async function handleConfirmClearCache() {
    if (cacheStatus.state !== "confirming") {
      return;
    }

    setCacheStatus({ state: "pending" });

    try {
      const result = await clearAppCache();
      if (!result.success) {
        setCacheStatus({
          state: "error",
          message:
            "Cache cleanup did not complete. Source media and catalog records were not changed.",
        });
        return;
      }

      setCacheStatus({
        state: "success",
        message: result.message,
      });
    } catch (error) {
      setCacheStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Cache cleanup failed. Source media and catalog records were not changed.",
      });
    }
  }

  async function handleExportCsv(entity: ExportCsvEntity) {
    if (!canExportCsv) {
      return;
    }

    setExportStatus({ state: "pending", entity });

    try {
      const destinationPath = await selectExportCsvDestination(entity);
      if (!destinationPath) {
        setExportStatus({ state: "idle" });
        return;
      }

      const records =
        entity === "videos"
          ? await listVideos()
          : entity === "images"
            ? await listImages()
            : entity === "performers"
              ? await listPerformers()
              : await listManagedCategories();
      const csvContent = buildEntityCsv(entity, records);
      const result = await writeExportCsv(destinationPath, csvContent);

      setExportStatus({
        state: "success",
        message: `${exportEntityLabel(entity)} CSV exported to ${result.destinationPath}. ${records.length} record${
          records.length === 1 ? "" : "s"
        } exported. Media files were not copied.`,
      });
    } catch (error) {
      setExportStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "CSV export failed. Database records and media files were not changed.",
      });
    }
  }

  async function handleImportCsvPreview() {
    if (!canImportCsv) {
      return;
    }

    setImportStatus({ state: "pending" });
    setImportApplyStatus({ state: "idle" });

    try {
      const sourcePath = await selectImportCsvSource();
      if (!sourcePath) {
        setImportStatus({ state: "idle" });
        return;
      }

      const [csvResult, videos, images, performers, categories] =
        await Promise.all([
          readImportCsv(sourcePath),
          listVideos(),
          listImages(),
          listPerformers(),
          listManagedCategories(),
        ]);

      setImportStatus({
        state: "preview",
        sourcePath: csvResult.sourcePath,
        preview: buildImportCsvPreview(csvResult.csvContent, {
          videos,
          images,
          performers,
          categories,
        }),
      });
    } catch (error) {
      setImportStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "CSV import preview failed. Database records and media files were not changed.",
      });
    }
  }

  function handleRequestImportApply(preview: ImportCsvPreview) {
    if (countApplicableImportRows(preview) === 0) {
      return;
    }
    setImportApplyStatus({ state: "confirming", preview });
  }

  async function handleConfirmImportApply(preview: ImportCsvPreview) {
    setImportApplyStatus({ state: "pending" });

    try {
      const [videos, images, performers, categories] = await Promise.all([
        listVideos(),
        listImages(),
        listPerformers(),
        listManagedCategories(),
      ]);
      const report = await applyImportCsvPreview({
        preview,
        context: { videos, images, performers, categories },
        confirmed: true,
        mutations: {
          createVideo,
          updateVideo,
          deleteVideo,
          createImage,
          updateImage,
          deleteImage,
          createPerformer,
          updatePerformer,
          deletePerformer,
          createManagedCategory,
          updateManagedCategory,
          deleteManagedCategory: deleteManagedCategoryRecord,
        },
      });

      setImportApplyStatus({ state: "report", report });
      await loadCategoryData();
    } catch (error) {
      setImportApplyStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "CSV import apply failed. Source media files were not changed.",
      });
    }
  }

  async function handleAddMediaRoot() {
    if (!canAddMediaRoot) {
      return;
    }

    setMediaRootStatus({ state: "pending" });

    try {
      const selectedPath = await selectLocalFolder();
      if (!selectedPath) {
        setMediaRootStatus({ state: "idle" });
        return;
      }

      const result = await allowMediaAssetRoot(selectedPath);
      if (hasMediaRoot(mediaRoots, result.rootPath)) {
        setSelectedMediaRoot(
          mediaRoots.find(
            (root) => mediaRootKey(root) === mediaRootKey(result.rootPath),
          ) ?? null,
        );
        setMediaRootStatus({
          state: "success",
          message: t("settings.libraryMedia.duplicateRoot", {
            path: displayMediaRootPath(result.rootPath),
          }),
        });
        return;
      }

      const nextRoots = [...mediaRoots, result.rootPath];
      storeMediaAssetRoots(nextRoots);
      setMediaRoots(nextRoots);
      setSelectedMediaRoot(result.rootPath);
      setMediaRootStatus({
        state: "success",
        message: t("settings.libraryMedia.addSuccess", {
          path: displayMediaRootPath(result.rootPath),
        }),
      });
    } catch (error) {
      setMediaRootStatus({
        state: "error",
        message: mediaRootErrorMessage(error, t),
      });
    }
  }

  function handleRemoveMediaRoot(rootPath: string) {
    const selectedIndex = mediaRoots.findIndex(
      (root) => mediaRootKey(root) === mediaRootKey(rootPath),
    );
    const nextRoots = mediaRoots.filter(
      (root) => mediaRootKey(root) !== mediaRootKey(rootPath),
    );
    storeMediaAssetRoots(nextRoots);
    setMediaRoots(nextRoots);
    setSelectedMediaRoot(
      nextRoots[Math.min(Math.max(selectedIndex, 0), nextRoots.length - 1)] ?? null,
    );
    setMediaRootStatus({
      state: "success",
      message: t("settings.libraryMedia.removeSuccess"),
    });
  }

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
    <div className="space-y-6">
      <SettingsSection
        number="1"
        sectionId="overview"
        title={t("settings.overview")}
        description="Review and open the Settings areas available in Sakurava."
        icon={SlidersHorizontal}
        shell={{
          t,
          appearanceTheme,
          appearanceAccent,
          appearanceDensity,
          appearanceUiScale,
          catalogPreferenceToggles,
          languageCode,
          languages,
          mediaRoots,
          selectedMediaRoot,
          isDesktopRuntime,
          isLanguageCsvBusy,
          isLanguageManagerOpen,
          languageCsvStatus,
          mediaRootStatus,
          backupStatus,
          restoreStatus,
          importStatus,
          importApplyStatus,
          exportStatus,
          cacheStatus,
          isMediaRootPending,
          isBackupPending,
          isRestorePending,
          isImportPending,
          isExportPending,
          isCachePending,
          canAddMediaRoot,
          canBackUpDatabase,
          canRestoreDatabase,
          canImportCsv,
          canExportCsv,
          canClearCache,
          isExportPanelOpen,
          handleThemeChange,
          handleAccentChange,
          handleDensityChange,
          handleUiScaleChange,
          handleResetAppearance,
          handleCatalogPreferenceToggle,
          handleResetCatalogPreferences,
          handleLanguageChange,
          handleRemoveCustomLanguage,
          setIsLanguageManagerOpen,
          handleAddLanguageFromCsv,
          handleExportLanguageTemplate,
          handleApplyCustomLanguageCsv,
          handleConfirmRemoveLanguage,
          setLanguageCsvStatus,
          handleAddMediaRoot,
          handleRemoveMediaRoot,
          setSelectedMediaRoot,
          handleBackupData,
          handleRestoreData,
          setRestoreStatus,
          handleConfirmRestore,
          handleImportCsvPreview,
          setIsExportPanelOpen,
          handleExportCsv,
          handleRequestImportApply,
          setImportApplyStatus,
          handleConfirmImportApply,
          setCacheStatus,
          handleConfirmClearCache,
        }}
      />


    </div>
  );
}

function SettingsPanelCard({
  title,
  icon,
  children,
  onReset,
  showReset = true,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  onReset?: () => void;
  showReset?: boolean;
}) {
  const Icon = icon;

  return (
    <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex h-12 items-center gap-3 border-b border-slate-200 px-4">
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500">
          <Icon size={18} />
        </span>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="px-4 pb-10 pt-3">{children}</div>
      {showReset ? (
        <button
          type="button"
          disabled={!onReset}
          onClick={onReset}
          aria-label={`Reset ${title}`}
          className="absolute bottom-3 right-3 inline-flex size-7 items-center justify-center rounded-lg text-sakura-500 transition hover:bg-sakura-50 disabled:opacity-70"
        >
          <RotateCcw size={18} />
        </button>
      ) : null}
    </section>
  );
}

function ControlRow({
  label,
  children,
  alignStart = false,
}: {
  label: string;
  children: ReactNode;
  alignStart?: boolean;
}) {
  return (
    <div
      className={`grid gap-2 py-1.5 sm:grid-cols-[160px_minmax(0,1fr)] ${
        alignStart ? "sm:items-start" : "sm:items-center"
      }`}
    >
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function OverviewRow({
  label,
  value,
  available = false,
}: {
  label: string;
  value: string;
  available?: boolean;
}) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-3 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <span className="inline-flex items-center gap-2 font-medium text-slate-500">
        {available && <span className="size-2 rounded-full bg-emerald-500" />}
        {value}
      </span>
    </div>
  );
}

function CompactChoice({
  label,
  selected = false,
  disabled = false,
  onClick,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={`h-8 border-r border-slate-200 px-3 text-sm font-medium last:border-r-0 ${
        selected
          ? "border-transparent bg-sakura-50 text-sakura-600"
          : disabled
            ? "bg-slate-50 text-slate-400"
            : "bg-white text-slate-600 hover:bg-sakura-50"
      }`}
    >
      {label}
    </button>
  );
}

function ShellButton({
  label,
  ariaLabel,
  disabled = false,
  onClick,
}: {
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 min-w-32 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-600 disabled:bg-slate-50 disabled:text-slate-400"
    >
      {label}
    </button>
  );
}

function ShellSelect({ label, value }: { label: string; value: string }) {
  return (
    <select
      aria-label={label}
      disabled
      value={value}
      onChange={() => undefined}
      className="h-9 w-full max-w-md rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-500"
    >
      <option value={value}>{value}</option>
    </select>
  );
}

function ShellToggle({
  label,
  checked = false,
}: {
  label: string;
  checked?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled
      className={`relative h-6 w-11 rounded-full ${
        checked ? "bg-sakura-400" : "bg-slate-200"
      } disabled:opacity-70`}
    >
      <span
        className={`absolute top-1 size-4 rounded-full bg-white shadow-sm ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function CatalogPreferenceToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${
        checked ? "bg-sakura-400" : "bg-slate-200"
      }`}
    >
      <span
        className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function LanguageStatusContent({
  status,
  onApply,
  onConfirmRemove,
  onClose,
}: {
  status: LanguageCsvStatus;
  onApply: (preview: CustomLanguageCsvPreviewType) => void;
  onConfirmRemove: (code: string) => void;
  onClose: () => void;
}) {
  const t = useTranslation();
  if (status.state === "idle" || status.state === "pending") {
    return null;
  }

  if (status.state === "exportSuccess" || status.state === "applySuccess" || status.state === "error") {
    return (
      <div
        role="alert"
        className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
          status.state === "error"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}
      >
        {status.message}
      </div>
    );
  }

  if (status.state === "removeConfirm") {
    return (
      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
        <p className="text-sm font-semibold text-rose-800">
          Remove "{status.label}"?
        </p>
        <div className="mt-2 flex gap-2">
          <ShellButton label={t("settings.language.removeLanguage")} onClick={() => onConfirmRemove(status.code)} />
          <ShellButton label={t("common.cancel")} onClick={onClose} />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-800">
        {status.preview.isNew ? "Add" : "Update"} {status.preview.languageName}
      </p>
      <p className="mt-1 text-xs font-medium text-slate-500">
        {status.preview.validRows} valid row(s), {status.preview.errorRows} error(s)
      </p>
      <div className="mt-2 flex gap-2">
        <ShellButton
          label={status.preview.isNew ? "Add Language" : "Update Language"}
          disabled={status.preview.validRows === 0}
          onClick={() => onApply(status.preview)}
        />
        <ShellButton label={t("common.cancel")} onClick={onClose} />
      </div>
    </div>
  );
}

function SettingsSection({
  number,
  sectionId,
  title,
  description,
  icon,
  shell,
}: {
  number: string;
  sectionId: string;
  title: string;
  description: string;
  icon: LucideIcon;
  children?: ReactNode;
  shell?: Record<string, any>;
}) {
  if (!shell) {
    return null;
  }
  const {
    t,
    appearanceTheme,
    appearanceAccent,
    appearanceDensity,
    appearanceUiScale,
    catalogPreferenceToggles,
    languageCode,
    languages,
    mediaRoots,
    selectedMediaRoot,
    isDesktopRuntime,
    isLanguageCsvBusy,
    isLanguageManagerOpen,
    languageCsvStatus,
    mediaRootStatus,
    backupStatus,
    restoreStatus,
    importStatus,
    importApplyStatus,
    exportStatus,
    cacheStatus,
    isMediaRootPending,
    isBackupPending,
    isRestorePending,
    isImportPending,
    isExportPending,
    isCachePending,
    canAddMediaRoot,
    canBackUpDatabase,
    canRestoreDatabase,
    canImportCsv,
    canExportCsv,
    canClearCache,
    isExportPanelOpen,
    handleThemeChange,
    handleAccentChange,
    handleDensityChange,
    handleUiScaleChange,
    handleResetAppearance,
    handleCatalogPreferenceToggle,
    handleResetCatalogPreferences,
    handleLanguageChange,
    handleRemoveCustomLanguage,
    setIsLanguageManagerOpen,
    handleAddLanguageFromCsv,
    handleExportLanguageTemplate,
    handleApplyCustomLanguageCsv,
    handleConfirmRemoveLanguage,
    setLanguageCsvStatus,
    handleAddMediaRoot,
    handleRemoveMediaRoot,
    setSelectedMediaRoot,
    handleBackupData,
    handleRestoreData,
    setRestoreStatus,
    handleConfirmRestore,
    handleImportCsvPreview,
    setIsExportPanelOpen,
    handleExportCsv,
    handleRequestImportApply,
    setImportApplyStatus,
    handleConfirmImportApply,
    setCacheStatus,
    handleConfirmClearCache,
  } = shell;

  return (
    <div className="space-y-3">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          {t("settings.title")}
        </h1>
        <label className="relative block w-full sm:w-72">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={17}
          />
          <input
            type="search"
            aria-label={t("settings.search")}
            placeholder={t("settings.search")}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-700 outline-none transition focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
          />
        </label>
      </header>

      <SettingsPanelCard title={t("settings.overview")} icon={SlidersHorizontal}>
        <div className="grid gap-4 md:grid-cols-2 md:gap-0">
          <div className="space-y-2 md:pr-6">
            <OverviewRow
              label={t("settings.overview.theme")}
              value={
                appearanceTheme === "system"
                  ? "System"
                  : appearanceTheme === "dark"
                    ? "Dark"
                    : "Light"
              }
            />
            <OverviewRow
              label={t("settings.overview.language")}
              value={languages.find((language: { code: string; label: string }) => language.code === languageCode)?.label ?? languageCode}
            />
            <OverviewRow label={t("settings.overview.mediaLibrary")} value={`${mediaRoots.length} folder${mediaRoots.length === 1 ? "" : "s"} configured`} />
            <OverviewRow
              label={t("settings.overview.database")}
              value={isDesktopRuntime ? "Available" : "Not available"}
              available={isDesktopRuntime}
            />
          </div>
          <div className="space-y-2 border-slate-200 md:border-l md:pl-6">
            <OverviewRow label={t("settings.overview.lastBackup")} value={t("common.notAvailable")} />
            <OverviewRow label={t("settings.overview.cache")} value={t("common.notAvailable")} />
            <OverviewRow label={t("settings.overview.storage")} value={t("settings.overview.localOffline")} />
          </div>
        </div>
      </SettingsPanelCard>

      <SettingsPanelCard
        title={t("settings.appearance.title")}
        icon={Palette}
        onReset={handleResetAppearance}
      >
        <ControlRow label={t("settings.appearance.theme")}>
          <div className="grid max-w-md grid-cols-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <CompactChoice
              label={t("settings.appearance.light")}
              selected={appearanceTheme === "light"}
              onClick={() => handleThemeChange("light")}
            />
            <CompactChoice
              label={t("settings.appearance.dark")}
              selected={appearanceTheme === "dark"}
              onClick={() => handleThemeChange("dark")}
            />
            <CompactChoice
              label={t("settings.appearance.system")}
              selected={appearanceTheme === "system"}
              onClick={() => handleThemeChange("system")}
            />
          </div>
        </ControlRow>
        <ControlRow label={t("settings.appearance.accentColor")}>
          <div className="flex max-w-md items-center gap-3">
            {([
              ["sakura", "Sakura Pink", "#f16f9b"],
              ["blue", "Blue", "#3b82f6"],
              ["purple", "Purple", "#8b5cf6"],
            ] as const).map(([type, label, color]) => (
              <button
                key={type}
                type="button"
                aria-label={`${label} accent`}
                aria-pressed={appearanceAccent.type === type}
                onClick={() => handleAccentChange({ type })}
                className={`size-6 rounded-full ${
                  appearanceAccent.type === type
                    ? "ring-2 ring-sakura-300 ring-offset-2"
                    : ""
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
            <label
              aria-label={t("settings.appearance.customAccent")}
              className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border bg-slate-50 ${
                appearanceAccent.type === "custom"
                  ? "border-transparent bg-sakura-50 text-sakura-600 ring-2 ring-sakura-100"
                  : "border-slate-200 text-slate-500"
              }`}
            >
              <Palette size={15} />
              <input
                type="color"
                aria-label={t("settings.appearance.customAccentPicker")}
                className="sr-only"
                value={
                  appearanceAccent.type === "custom"
                    ? appearanceAccent.color
                    : "#f16f9b"
                }
                onChange={(event) =>
                  handleAccentChange({ type: "custom", color: event.target.value })
                }
              />
            </label>
          </div>
        </ControlRow>
        <ControlRow label={t("settings.appearance.density")}>
          <div className="grid max-w-md grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <CompactChoice
              label={t("settings.appearance.comfortable")}
              selected={appearanceDensity === "comfortable"}
              onClick={() => handleDensityChange("comfortable")}
            />
            <CompactChoice
              label={t("settings.appearance.compact")}
              selected={appearanceDensity === "compact"}
              onClick={() => handleDensityChange("compact")}
            />
          </div>
        </ControlRow>
        <ControlRow label={t("settings.appearance.uiScale")}>
          <select
            aria-label={t("settings.appearance.uiScale")}
            className="h-9 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
            value={appearanceUiScale}
            onChange={(event) =>
              handleUiScaleChange(event.target.value as AppearanceUiScale)
            }
          >
            <option value="90">90%</option>
            <option value="100">100% (Default)</option>
            <option value="110">110%</option>
          </select>
        </ControlRow>
      </SettingsPanelCard>

      <SettingsPanelCard title={t("settings.language.title")} icon={FileText} showReset={false}>
        <ControlRow label={t("settings.language.appLanguage")}>
          <select
            aria-label={t("settings.language.appLanguage")}
            className="h-9 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
            value={languageCode}
            onChange={(event) => handleLanguageChange(event.target.value)}
          >
            {languages.map((language: { code: string; label: string }) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </ControlRow>
        <ControlRow label={t("settings.language.installedLanguages")}>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm font-medium text-slate-600">
                {languages
                  .map((language: { label: string }) => language.label)
                  .join(", ")}
              </span>
              <ShellButton
                label={isLanguageManagerOpen
                  ? t("settings.language.closeManage")
                  : t("settings.language.manage")}
                disabled={isLanguageCsvBusy}
                onClick={() =>
                  setIsLanguageManagerOpen(!isLanguageManagerOpen)
                }
              />
            </div>
            {isLanguageManagerOpen ? (
              <div
                aria-label={t("settings.language.management")}
                className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                {languages.map(
                  (language: { code: string; label: string }) => {
                    const isCustom = isCustomLanguageCode(language.code);
                    return (
                      <div
                        key={language.code}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-700">
                            {language.label}
                          </p>
                          <p className="text-xs font-medium text-slate-400">
                            {language.code === "en"
                              ? t("settings.language.defaultProtected")
                              : t("settings.language.installedCustom", {
                                  code: language.code,
                                })}
                          </p>
                        </div>
                        {isCustom ? (
                          <button
                            type="button"
                            aria-label={t("settings.language.removeLabel", {
                              name: language.label,
                            })}
                            disabled={isLanguageCsvBusy}
                            onClick={() =>
                              handleRemoveCustomLanguage(
                                language.code,
                                language.label,
                              )
                            }
                            className="h-8 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
                          >
                            {t("settings.language.remove")}
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">
                            {t("settings.language.protected")}
                          </span>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            ) : null}
          </div>
        </ControlRow>
        <ControlRow label={t("settings.language.custom")}>
          <div className="flex flex-wrap gap-2">
              <ShellButton
                label={t("settings.language.importCsv")}
                disabled={!isDesktopRuntime || isLanguageCsvBusy}
                onClick={handleAddLanguageFromCsv}
              />
              <ShellButton
                label={t("settings.language.exportCsv")}
                disabled={!isDesktopRuntime || isLanguageCsvBusy}
                onClick={handleExportLanguageTemplate}
              />
          </div>
        </ControlRow>
        <LanguageStatusContent
          status={languageCsvStatus}
          onApply={handleApplyCustomLanguageCsv}
          onConfirmRemove={handleConfirmRemoveLanguage}
          onClose={() => setLanguageCsvStatus({ state: "idle" })}
        />
        <p className="mt-2 text-xs font-medium text-slate-500">
          {t("settings.language.catalogDataHelper")}
        </p>
      </SettingsPanelCard>

      <SettingsPanelCard
        title={t("settings.catalogPreferences.title")}
        icon={SlidersHorizontal}
        onReset={handleResetCatalogPreferences}
      >
        <ControlRow label={t("settings.catalogPreferences.rememberView")}>
          <CatalogPreferenceToggle
            label={t("settings.catalogPreferences.rememberView")}
            checked={catalogPreferenceToggles.rememberView}
            onChange={(checked) => handleCatalogPreferenceToggle("rememberView", checked)}
          />
        </ControlRow>
        <ControlRow label={t("settings.catalogPreferences.rememberSort")}>
          <CatalogPreferenceToggle
            label={t("settings.catalogPreferences.rememberSort")}
            checked={catalogPreferenceToggles.rememberSort}
            onChange={(checked) => handleCatalogPreferenceToggle("rememberSort", checked)}
          />
        </ControlRow>
        <ControlRow label={t("settings.catalogPreferences.rememberFilters")}>
          <CatalogPreferenceToggle
            label={t("settings.catalogPreferences.rememberFilters")}
            checked={catalogPreferenceToggles.rememberFilters}
            onChange={(checked) => handleCatalogPreferenceToggle("rememberFilters", checked)}
          />
        </ControlRow>
        <p className="mt-2 text-xs font-medium text-slate-500">
          {t("settings.catalogPreferences.helper")}
        </p>
      </SettingsPanelCard>

      <SettingsPanelCard
        title={t("settings.library.title")}
        icon={Folder}
        showReset={false}
      >
        <ControlRow label={t("settings.library.mediaRoot")} alignStart>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div
              role="listbox"
              aria-label={t("settings.library.configuredRoots")}
              className="min-h-24 rounded-lg border border-slate-200 bg-white p-2"
            >
              {mediaRoots.length === 0 ? (
                <p className="px-2 py-1 text-sm font-medium text-slate-400">{t("settings.library.noFolders")}</p>
              ) : (
                mediaRoots.map((root: string) => (
                  <button
                    key={root}
                    type="button"
                    role="option"
                    aria-selected={
                      selectedMediaRoot !== null &&
                      mediaRootKey(root) === mediaRootKey(selectedMediaRoot)
                    }
                    onClick={() => setSelectedMediaRoot(root)}
                    className={`block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium transition ${
                      selectedMediaRoot !== null &&
                      mediaRootKey(root) === mediaRootKey(selectedMediaRoot)
                        ? "bg-sakura-50 text-slate-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {displayMediaRootPath(root)}
                  </button>
                ))
              )}
            </div>
            <div className="flex gap-2 sm:flex-col">
              <ShellButton
                label={
                  isMediaRootPending
                    ? t("settings.libraryMedia.adding")
                    : t("settings.libraryMedia.addFolder")
                }
                ariaLabel={t("settings.libraryMedia.addRootAria")}
                disabled={!canAddMediaRoot}
                onClick={handleAddMediaRoot}
              />
              <ShellButton
                label={t("settings.library.remove")}
                ariaLabel={t("settings.libraryMedia.removeRootAria")}
                disabled={!selectedMediaRoot}
                onClick={() =>
                  selectedMediaRoot && handleRemoveMediaRoot(selectedMediaRoot)
                }
              />
            </div>
          </div>
          <SettingsStatusMessage status={mediaRootStatus} kind="mediaRoot" />
          <p className="mt-2 text-xs font-medium text-slate-500">
            {t("settings.libraryMedia.removeHelp")}
          </p>
        </ControlRow>
      </SettingsPanelCard>

      <SettingsPanelCard title={t("settings.backup.title")} icon={ShieldCheck}>
        <ControlRow label={t("settings.backup.lastBackup")}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-500">{t("common.notAvailable")}</span>
            <ShellButton
              label={isBackupPending ? "Backing up..." : "Backup Now"}
              ariaLabel={isBackupPending ? "Backing Up..." : "Backup Database"}
              disabled={!canBackUpDatabase}
              onClick={handleBackupData}
            />
          </div>
        </ControlRow>
        <ControlRow label={t("settings.backup.location")}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-500">{t("settings.overview.notConfigured")}</span>
            <ShellButton
              label={isRestorePending ? "Restoring..." : "Restore Backup..."}
              ariaLabel={isRestorePending ? "Restoring..." : "Restore Database"}
              disabled={!canRestoreDatabase}
              onClick={handleRestoreData}
            />
          </div>
        </ControlRow>
        <p className="mt-2 text-xs font-medium text-slate-500">
          Database backups do not include original media files.
        </p>
        <SettingsStatusMessage status={backupStatus} kind="backup" />
        {restoreStatus.state === "confirming" && (
          <RestoreConfirmPanel
            restoreStatus={restoreStatus}
            onCancelRestore={() => setRestoreStatus({ state: "idle" })}
            onConfirmRestore={handleConfirmRestore}
          />
        )}
        <SettingsStatusMessage status={restoreStatus} kind="restore" />
      </SettingsPanelCard>

      <SettingsPanelCard title={t("settings.importExport.title")} icon={FileArchive}>
        <ControlRow label={t("settings.importExport.importCatalog")}>
          <div className="flex justify-end">
            <ShellButton
              label={isImportPending ? "Reading CSV..." : "Import CSV..."}
              ariaLabel="Import Data"
              disabled={!canImportCsv}
              onClick={handleImportCsvPreview}
            />
          </div>
        </ControlRow>
        <ControlRow label={t("settings.importExport.exportCatalog")}>
          <div className="flex justify-end">
            <ShellButton
              label={isExportPending ? "Exporting CSV..." : "Export CSV..."}
              ariaLabel="Export Data"
              disabled={!canExportCsv}
              onClick={() => setIsExportPanelOpen((open: boolean) => !open)}
            />
          </div>
        </ControlRow>
        <ControlRow label={t("settings.importExport.preview")}>
          <ShellToggle label={t("settings.importExport.preview")} checked />
        </ControlRow>
        {isExportPanelOpen && (
          <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-4">
            {(["videos", "images", "performers", "categories"] as ExportCsvEntity[]).map((entity) => (
              <button
                key={entity}
                type="button"
                disabled={!canExportCsv}
                onClick={() => handleExportCsv(entity)}
                className={exportButtonClassName(canExportCsv)}
              >
                Export {exportEntityLabel(entity)} CSV
              </button>
            ))}
          </div>
        )}
        <ImportPreviewPanel
          importStatus={importStatus}
          importApplyStatus={importApplyStatus}
          onRequestApply={handleRequestImportApply}
          onCancelApply={() => setImportApplyStatus({ state: "idle" })}
          onConfirmApply={handleConfirmImportApply}
        />
        <SettingsStatusMessage status={exportStatus} kind="export" />
      </SettingsPanelCard>

      <SettingsPanelCard title={t("settings.performance.title")} icon={HardDrive}>
        <ControlRow label={t("settings.performance.cacheSize")}>
          <span className="text-sm font-medium text-slate-500">{t("common.notAvailable")}</span>
        </ControlRow>
        <ControlRow label={t("settings.performance.temporaryFiles")}>
          <span className="text-sm font-medium text-slate-500">{t("common.notAvailable")}</span>
        </ControlRow>
        <ControlRow label={t("common.status")}>
          <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
            <span className={`size-2 rounded-full ${isDesktopRuntime ? "bg-emerald-500" : "bg-slate-300"}`} />
            {isDesktopRuntime ? "Available" : "Not available"}
          </span>
        </ControlRow>
        <ControlRow label={t("common.action")}>
          <div className="flex justify-end">
            <ShellButton
              label={isCachePending ? "Clearing Cache..." : "Clear Cache..."}
              ariaLabel="Clear Cache"
              disabled={!canClearCache}
              onClick={() => setCacheStatus({ state: "confirming" })}
            />
          </div>
        </ControlRow>
        {cacheStatus.state === "confirming" && (
          <ClearCacheConfirmPanel
            onCancelClearCache={() => setCacheStatus({ state: "idle" })}
            onConfirmClearCache={handleConfirmClearCache}
          />
        )}
        <SettingsStatusMessage status={cacheStatus} kind="cache" />
      </SettingsPanelCard>
    </div>
  );

}

function SettingsPanel({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-slate-100">{children}</div>;
}

function SettingsControlRow({
  title,
  helper,
  children,
}: {
  title: string;
  helper: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-4 py-3 md:grid-cols-[minmax(220px,0.85fr)_minmax(0,1.45fr)] md:items-center">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
          {helper}
        </p>
      </div>
      <div>{children}</div>
    </div>
  );
}

function OptionButton({
  label,
  status,
  selected = false,
  disabled = false,
  onClick,
}: {
  label: string;
  status: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "h-9 rounded-lg border px-3 text-sm font-semibold",
        disabled
          ? "border-slate-200 bg-slate-50 text-slate-400"
          : selected
            ? "border-sakura-300 bg-sakura-50 text-sakura-600"
            : "border-slate-200 bg-white text-slate-600 hover:border-sakura-200 hover:text-sakura-600",
      ].join(" ")}
    >
      <span>{label}</span>
      {status ? (
        <span className="ml-2 text-xs font-semibold text-slate-400">
          {status}
        </span>
      ) : null}
    </button>
  );
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "neutral" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "info"
        ? "bg-blue-50 text-blue-700"
        : "bg-slate-100 text-slate-600";

  return (
    <span
      className={[
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold",
        toneClass,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function exportButtonClassName(enabled: boolean) {
  return [
    "h-10 rounded-lg border px-3 text-sm font-semibold",
    enabled
      ? "border-sakura-200 bg-sakura-50 text-sakura-600 hover:border-sakura-300 hover:bg-sakura-100"
      : "border-slate-200 bg-slate-50 text-slate-400",
  ].join(" ");
}

function LanguageActionCard({
  label,
  detail,
  planned = false,
  disabled = false,
  onClick,
}: {
  label: string;
  detail: string;
  planned?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const isInactive = planned || disabled;

  return (
    <button
      type="button"
      disabled={isInactive}
      onClick={isInactive ? undefined : onClick}
      className={[
        "rounded-lg border px-3 py-2.5 text-left",
        isInactive
          ? "border-slate-200 bg-slate-50"
          : "border-sakura-200 bg-white transition hover:border-sakura-300 hover:bg-sakura-50",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            "text-sm font-semibold",
            isInactive ? "text-slate-400" : "text-slate-700",
          ].join(" ")}
        >
          {label}
        </span>
        {planned && (
          <span className="inline-flex h-5 items-center rounded-full bg-slate-100 px-2 text-[10px] font-semibold text-slate-500">
            Planned
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs font-medium text-slate-500">{detail}</p>
    </button>
  );
}

function OptimizationBlock({
  icon,
  title,
  helper,
  children,
}: {
  icon: LucideIcon;
  title: string;
  helper: string;
  children: ReactNode;
}) {
  const Icon = icon;

  return (
    <div className="grid gap-4 py-3 md:grid-cols-[minmax(220px,0.85fr)_minmax(0,1.45fr)]">
      <div className="flex gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500">
          <Icon size={18} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
            {helper}
          </p>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function MiniSettingRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="divide-y divide-slate-100">
      {rows.map(([label, value]) => (
        <div
          key={label}
            className="grid gap-2 py-2 text-sm md:grid-cols-[minmax(140px,0.8fr)_minmax(0,1.2fr)] md:items-center"
        >
          <span className="font-semibold text-slate-700">{label}</span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-600">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function InfoNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs font-semibold leading-5 text-sky-700">
      {children}
    </p>
  );
}

function DataOperationCard({
  title,
  helper,
  children,
}: {
  title: string;
  helper: string;
  children: ReactNode;
}) {
  return (
    <section className="p-0">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
        {helper}
      </p>
      <div className="mt-3 grid gap-2">{children}</div>
    </section>
  );
}

function ActionTile({
  icon,
  title,
  helper,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  helper: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const Icon = icon;

  return (
    <button
      type="button"
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2.5 text-left",
        disabled
          ? "border-slate-200 bg-slate-50 text-slate-400"
          : "border-sakura-200 bg-white text-slate-800 hover:border-sakura-300 hover:bg-sakura-50",
      ].join(" ")}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">
          {helper}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        size={18}
        className={disabled ? "shrink-0 text-slate-300" : "shrink-0 text-slate-500"}
      />
    </button>
  );
}

function ImportPreviewPanel({
  importStatus,
  importApplyStatus,
  onRequestApply,
  onCancelApply,
  onConfirmApply,
}: {
  importStatus: ImportStatus;
  importApplyStatus: ImportApplyStatus;
  onRequestApply: (preview: ImportCsvPreview) => void;
  onCancelApply: () => void;
  onConfirmApply: (preview: ImportCsvPreview) => void;
}) {
  const t = useTranslation();
  if (importStatus.state === "idle") {
    return null;
  }

  if (importStatus.state === "pending") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600">
        Reading CSV and building preview...
      </div>
    );
  }

  if (importStatus.state === "error") {
    return (
      <div
        role="alert"
        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-700"
      >
        {importStatus.message}
      </div>
    );
  }

  const { preview } = importStatus;
  const entityLabel =
    preview.summary.entity === "unknown"
      ? "Unknown"
      : exportEntityLabel(preview.summary.entity);
  const sourceFileName = importStatus.sourcePath.split(/[\\/]/).pop() ?? importStatus.sourcePath;
  const applicableRows = countApplicableImportRows(preview);
  const canApply = applicableRows > 0 && importApplyStatus.state !== "pending";

  return (
    <div
      role="region"
      aria-label={t("settings.import.preview")}
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <div className="border-b border-slate-200 px-3 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Import Preview
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {sourceFileName}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {entityLabel} CSV - {preview.summary.totalRows} row
              {preview.summary.totalRows === 1 ? "" : "s"}
            </p>
          </div>
          <span
            className={[
              "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
              preview.summary.blocked
                ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
            ].join(" ")}
          >
            {preview.summary.blocked ? "Blocked" : "Preview mode"}
          </span>
        </div>
        <div className="mt-3 grid gap-2 text-xs font-semibold leading-5 text-sky-700">
          <p className="rounded-lg bg-sky-50 px-3 py-2">
            Preview only. No data has been changed.
          </p>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">
            Apply changes database records only after confirmation.
          </p>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
            Delete affects catalog records only. Original media files are not deleted.
          </p>
        </div>
      </div>

      {(preview.headerErrors.length > 0 || preview.headerWarnings.length > 0) && (
        <div className="grid gap-2 border-b border-slate-200 px-3 py-3">
          {preview.headerErrors.map((message) => (
            <p key={message} className="text-xs font-semibold text-rose-700">
              {message}
            </p>
          ))}
          {preview.headerWarnings.map((message) => (
            <p key={message} className="text-xs font-semibold text-amber-700">
              {message}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 border-b border-slate-200 px-3 py-3 sm:grid-cols-4 lg:grid-cols-7">
        <ImportMetric label={t("import.added")} value={preview.summary.added} />
        <ImportMetric label={t("import.modified")} value={preview.summary.modified} />
        <ImportMetric label={t("import.deleted")} value={preview.summary.deleted} />
        <ImportMetric label={t("import.unchanged")} value={preview.summary.unchanged} />
        <ImportMetric label={t("import.skipped")} value={preview.summary.skipped} />
        <ImportMetric label={t("import.warnings")} value={preview.summary.warnings} />
        <ImportMetric label={t("import.errors")} value={preview.summary.errors} />
      </div>

      <div className="px-3 py-3">
        <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-[760px] table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
            <tr className="border-b border-slate-200">
              {[
                "settings.import.preview.table.header.row",
                "settings.import.preview.table.header.action",
                "settings.import.preview.table.header.result",
                "settings.import.preview.table.header.target",
                "settings.import.preview.table.header.changes",
                "settings.import.preview.table.header.status",
              ].map(
                (header) => (
                  <th key={header} className="whitespace-nowrap px-2 py-2 font-semibold">
                    {t(header)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {preview.rows.map((row) => (
              <tr key={row.rowNumber} className="align-top">
                <td className="w-14 px-2 py-2 font-semibold">{row.rowNumber}</td>
                <td className="w-20 px-2 py-2">{row.action}</td>
                <td className="w-24 px-2 py-2 font-semibold">{row.detectedResult}</td>
                <td className="w-60 px-2 py-2">
                  <span className="block truncate font-medium" title={row.target}>
                    {row.target || "New record"}
                  </span>
                </td>
                <td className="w-56 px-2 py-2">
                  <span
                    className="block truncate"
                    title={getImportRowChangeTitle(row)}
                  >
                    {getImportRowChangeSummary(row)}
                  </span>
                  <ImportRowDetail row={row} />
                </td>
                <td className="w-28 px-2 py-2">
                  <ImportStatusBadge status={getImportRowStatus(row)} />
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-slate-200 px-3 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canApply}
            onClick={() => onRequestApply(preview)}
            className={[
              "h-9 rounded-lg border px-3 text-xs font-semibold",
              canApply
                ? "border-sakura-200 bg-sakura-50 text-sakura-600 hover:border-sakura-300 hover:bg-sakura-100"
                : "border-slate-200 bg-slate-100 text-slate-400",
            ].join(" ")}
          >
            Apply Valid Rows
          </button>
          <p className="text-xs font-semibold text-slate-500">
            {applicableRows} valid applicable row{applicableRows === 1 ? "" : "s"} available.
          </p>
        </div>
        {importApplyStatus.state === "confirming" && (
          <ImportApplyConfirmPanel
            preview={importApplyStatus.preview}
            onCancelApply={onCancelApply}
            onConfirmApply={() => onConfirmApply(importApplyStatus.preview)}
          />
        )}
        {importApplyStatus.state === "pending" && (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            Applying valid CSV rows...
          </p>
        )}
        {importApplyStatus.state === "error" && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
          >
            {importApplyStatus.message}
          </p>
        )}
        {importApplyStatus.state === "report" && (
          <ImportApplyReportPanel report={importApplyStatus.report} />
        )}
      </div>
    </div>
  );
}

function ImportApplyConfirmPanel({
  preview,
  onCancelApply,
  onConfirmApply,
}: {
  preview: ImportCsvPreview;
  onCancelApply: () => void;
  onConfirmApply: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
      <p className="text-sm font-semibold text-slate-900">{t("settings.import.confirmApply")}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
        Database records will be changed. Create a Backup Database before applying imports.
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
        Delete removes catalog records only. Original media files are not deleted.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <ImportMetric label={t("import.added")} value={preview.summary.added} />
        <ImportMetric label={t("import.modified")} value={preview.summary.modified} />
        <ImportMetric label={t("import.deleted")} value={preview.summary.deleted} />
        <ImportMetric label={t("import.skipped")} value={preview.summary.skipped} />
        <ImportMetric label={t("import.errors")} value={preview.summary.errors} />
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-600">
        Valid rows will be applied. Error, blocked, ambiguous, unknown category, and unresolved related rows will be skipped and reported.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCancelApply}
          className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirmApply}
          className="h-9 rounded-lg border border-sakura-200 bg-white px-4 text-sm font-semibold text-sakura-600 hover:bg-sakura-50"
        >
          Apply Valid Rows
        </button>
      </div>
    </div>
  );
}

function ImportApplyReportPanel({ report }: { report: ImportCsvApplyReport }) {
  const t = useTranslation();
  const completedMessage =
    report.failed > 0 || report.errors > 0
      ? "Import apply completed with warnings/errors."
      : "Import apply completed.";

  return (
    <div
      role="region"
      aria-label={t("settings.import.applyReport")}
      className="mt-3 rounded-lg border border-slate-200 bg-white"
    >
      <div className="border-b border-slate-200 px-3 py-3">
        <p className="text-sm font-semibold text-slate-900">{completedMessage}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Original media files were not modified or deleted.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-slate-200 px-3 py-3 sm:grid-cols-4 lg:grid-cols-8">
        <ImportMetric label={t("import.added")} value={report.appliedAdded} />
        <ImportMetric label={t("import.modified")} value={report.appliedModified} />
        <ImportMetric label={t("import.deleted")} value={report.appliedDeleted} />
        <ImportMetric label={t("import.unchanged")} value={report.unchanged} />
        <ImportMetric label={t("import.skipped")} value={report.skipped} />
        <ImportMetric label={t("import.failed")} value={report.failed} />
        <ImportMetric label={t("import.warnings")} value={report.warnings} />
        <ImportMetric label={t("import.errors")} value={report.errors} />
      </div>
      <div className="max-h-72 overflow-auto px-3 py-3">
        <table className="min-w-[720px] table-fixed text-left text-xs">
          <thead className="text-slate-500">
            <tr className="border-b border-slate-200">
              {[
                "settings.import.preview.table.header.row",
                "settings.import.preview.table.header.status",
                "settings.import.preview.table.header.result",
                "settings.import.preview.table.header.target",
                "settings.import.report.table.header.message",
              ].map((header) => (
                <th key={header} className="px-2 py-2 font-semibold">
                  {t(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {report.rows.map((row) => (
              <tr key={`${row.rowNumber}-${row.message}`}>
                <td className="w-14 px-2 py-2 font-semibold">{row.rowNumber || "-"}</td>
                <td className="w-24 px-2 py-2 font-semibold">{row.status}</td>
                <td className="w-24 px-2 py-2">{row.result}</td>
                <td className="w-52 px-2 py-2">
                  <span className="block truncate" title={row.target}>
                    {row.target || "-"}
                  </span>
                </td>
                <td className="w-80 px-2 py-2">
                  <span className="block truncate" title={row.message}>
                    {row.message}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getImportRowChangeSummary(row: ImportPreviewRow) {
  if (row.detectedResult === "Deleted" || row.action === "Delete") {
    return "Will delete catalog record only";
  }
  if (row.detectedResult === "Added") {
    return "Will create record";
  }
  if (row.detectedResult === "Modified") {
    return `${row.changes.length} field${row.changes.length === 1 ? "" : "s"} changed`;
  }
  if (row.detectedResult === "Unchanged") {
    return "No change";
  }
  if (row.detectedResult === "Skipped") {
    return "Skipped";
  }
  if (row.errors.length > 0) {
    return row.errors[0];
  }
  if (row.warnings.length > 0) {
    return row.warnings[0];
  }
  return "Review required";
}

function getImportRowChangeTitle(row: ImportPreviewRow) {
  if (row.detectedResult === "Deleted" || row.action === "Delete") {
    return "Will delete catalog record only. Original media files are not deleted.";
  }
  if (row.changes.length > 0) {
    return row.changes.join(", ");
  }
  return getImportRowChangeSummary(row);
}

function getImportRowStatus(row: ImportPreviewRow): ImportPreviewRowStatus {
  if (row.detectedResult === "Skipped") {
    return "Skipped";
  }
  if (row.errors.length > 0) {
    return row.errors.some((error) => error.toLowerCase().includes("ambiguous"))
      ? "Blocked"
      : "Error";
  }
  if (row.warnings.length > 0) {
    return "Warning";
  }
  return "Ready";
}

function ImportRowDetail({ row }: { row: ImportPreviewRow }) {
  const messages = [...row.errors, ...row.warnings].slice(0, 2);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {messages.map((message) => (
        <span
          key={message}
          title={message}
          className={[
            "max-w-44 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold",
            row.errors.includes(message)
              ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
              : "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
          ].join(" ")}
        >
          {message}
        </span>
      ))}
    </div>
  );
}

function ImportStatusBadge({ status }: { status: ImportPreviewRowStatus }) {
  const toneClass =
    status === "Ready"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "Warning"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : status === "Skipped"
          ? "bg-slate-100 text-slate-600 ring-slate-200"
          : "bg-rose-50 text-rose-700 ring-rose-200";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${toneClass}`}
    >
      {status}
    </span>
  );
}

function ImportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function RestoreConfirmPanel({
  restoreStatus,
  onCancelRestore,
  onConfirmRestore,
}: {
  restoreStatus: Extract<RestoreStatus, { state: "confirming" }>;
  onCancelRestore: () => void;
  onConfirmRestore: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="rounded-lg bg-rose-50 px-3 py-3">
      <div className="space-y-2 text-sm leading-6 text-slate-600">
        <p className="font-semibold text-slate-800">{t("settings.restore.confirm")}</p>
        <p>{t("settings.restore.replaceDatabase")}</p>
        <p>{t("settings.restore.recordsOnly")}</p>
        <p>{t("settings.restore.mediaUnaffected")}</p>
        <p>A safety backup will be created first.</p>
        <p className="break-all font-medium text-slate-500">
          Source: {restoreStatus.sourcePath}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCancelRestore}
          className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirmRestore}
          className="h-9 rounded-lg border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-600 hover:bg-rose-100"
        >
          Restore database
        </button>
      </div>
    </div>
  );
}

function ClearCacheConfirmPanel({
  onCancelClearCache,
  onConfirmClearCache,
}: {
  onCancelClearCache: () => void;
  onConfirmClearCache: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="mt-3 rounded-lg bg-amber-50 px-3 py-3">
      <div className="space-y-2 text-sm leading-6 text-slate-600">
        <p className="font-semibold text-slate-800">{t("settings.cache.confirm")}</p>
        <p>{t("settings.cache.scopedOnly")}</p>
        <p>{t("settings.cache.mediaUnaffected")}</p>
        <p>{t("settings.cache.catalogUnaffected")}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCancelClearCache}
          className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirmClearCache}
          className="h-9 rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-700 hover:bg-amber-100"
        >
          Clear app cache
        </button>
      </div>
    </div>
  );
}

function WarningBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-800">{title}</p>
      <p className="mt-1 text-sm font-medium leading-6 text-amber-700">{text}</p>
    </div>
  );
}

function InfoPanel({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <section className="p-0">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="divide-y divide-slate-100">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid gap-2 py-3 text-sm sm:grid-cols-[minmax(130px,0.55fr)_minmax(0,1.45fr)]"
          >
            <span className="font-semibold text-slate-700">{label}</span>
            <span className="font-medium text-slate-500">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsCard({
  title,
  rows,
  badges,
  actions,
  disabledActions,
  backupStatus,
  restoreStatus,
  mediaRootStatus,
  mediaRoots,
  onRemoveMediaRoot,
  onCancelRestore,
  onConfirmRestore,
  note,
}: {
  title: string;
  rows: SettingsRow[];
  badges?: string[];
  actions?: SettingsAction[];
  disabledActions?: string[];
  backupStatus?: BackupStatus;
  restoreStatus?: RestoreStatus;
  mediaRootStatus?: MediaRootStatus;
  mediaRoots?: string[];
  onRemoveMediaRoot?: (rootPath: string) => void;
  onCancelRestore?: () => void;
  onConfirmRestore?: () => void;
  note?: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold tracking-normal text-slate-950">
          {title}
        </h3>
        {badges && (
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded-md bg-sakura-50 px-3 py-1 text-xs font-semibold text-sakura-600"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="divide-y divide-slate-100 px-4">
        {rows.map((row) => (
          <SettingsInfoRow key={row.label} row={row} />
        ))}
      </div>
      {mediaRoots && onRemoveMediaRoot && (
        <MediaRootList roots={mediaRoots} onRemove={onRemoveMediaRoot} />
      )}
      <SettingsStatusMessage status={backupStatus} kind="backup" />
      <SettingsStatusMessage status={mediaRootStatus} kind="mediaRoot" />
      {restoreStatus?.state === "confirming" && (
        <div className="space-y-4 border-t border-slate-200 px-4 py-4">
          <div className="space-y-2 text-sm leading-6 text-slate-600">
            <p>A safety backup will be created first.</p>
            <p className="break-all font-medium text-slate-500">
              Source: {restoreStatus.sourcePath}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onCancelRestore}
              className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmRestore}
              className="h-10 rounded-lg border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-600 hover:bg-rose-100"
            >
              Restore database
            </button>
          </div>
        </div>
      )}
      <SettingsStatusMessage status={restoreStatus} kind="restore" />
      {actions && (
        <div className="space-y-3 border-t border-slate-200 px-4 py-3">
          {mediaRoots && (
            <p className="text-sm font-medium leading-6 text-slate-500">
              Choose a folder, not a drive root. Example: D:\Sakurava Media.
              Files inside that folder and its subfolders can be used for thumbnails.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                disabled={action.disabled}
                onClick={action.onClick}
                className={`h-10 rounded-lg border px-4 text-sm font-semibold ${
                  action.disabled
                    ? "border-slate-200 bg-slate-100 text-slate-400"
                    : "border-sakura-200 bg-sakura-50 text-sakura-600 hover:border-sakura-300 hover:bg-sakura-100"
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {disabledActions && (
        <div className="flex flex-wrap gap-3 border-t border-slate-200 px-4 py-3">
          {disabledActions.map((action) => (
            <button
              key={action}
              type="button"
              disabled
              className="h-10 rounded-lg border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-slate-400"
            >
              {action}
            </button>
          ))}
        </div>
      )}
      {note && (
        <p className="border-t border-slate-200 px-4 py-3 text-sm font-medium text-slate-500">
          {note}
        </p>
      )}
    </section>
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
  const t = useTranslation();
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
              Audit lists record categories. Managed category rename only updates the local managed list.
            </p>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <CategoryAuditMetric label={t("settings.categories.totalUnique")} value={audit.totalUnique} />
            <CategoryAuditMetric label={t("settings.categories.usedVideos")} value={audit.videoCategories} />
            <CategoryAuditMetric label={t("settings.categories.usedImages")} value={audit.imageCategories} />
            <CategoryAuditMetric
              label={t("settings.categories.usedPerformers")}
              value={audit.performerCategories}
            />
          </div>

          {hasCategories ? (
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-[minmax(160px,1.5fr)_repeat(4,minmax(80px,0.7fr))] gap-2 bg-white px-3 py-2 text-xs font-semibold uppercase text-slate-500">
                  <span>{t("common.categories")}</span>
                  <span>{t("common.videos")}</span>
                  <span>{t("common.images")}</span>
                  <span>{t("common.performers")}</span>
                  <span>{t("settings.categories.total")}</span>
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
              Add and Rename are active locally. Delete category management is planned and not active in this batch.
            </p>
          </div>
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Add Category
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t("settings.categories.name")}</span>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                  placeholder={t("settings.categories.name")}
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
            <SettingsStatusMessage status={managedCategoryStatus} kind="category" />
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
                  Rename applies only to managed categories. Existing record categories are not changed.
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
                    placeholder={t("settings.categories.newName")}
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
                  Delete application is planned and not active in this batch.
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
                      ? "Unused / 0 usage: eligible for future deletion."
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
  const t = useTranslation();
  return (
    <div
      role="region"
      aria-label={t("settings.categories.renamePreview")}
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
        <CategoryAuditMetric label={t("settings.categories.affectedVideos")} value={preview.videos} />
        <CategoryAuditMetric label={t("settings.categories.affectedImages")} value={preview.images} />
        <CategoryAuditMetric
          label={t("settings.categories.affectedPerformers")}
          value={preview.performers}
        />
        <CategoryAuditMetric label={t("settings.categories.totalAffected")} value={preview.total} />
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
  const t = useTranslation();
  return (
    <div
      role="region"
      aria-label={t("settings.categories.deletePreview")}
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
        <CategoryAuditMetric label={t("settings.categories.affectedVideos")} value={preview.videos} />
        <CategoryAuditMetric label={t("settings.categories.affectedImages")} value={preview.images} />
        <CategoryAuditMetric
          label={t("settings.categories.affectedPerformers")}
          value={preview.performers}
        />
        <CategoryAuditMetric label={t("settings.categories.totalAffected")} value={preview.total} />
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

function CategoryManagementAction({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm font-semibold text-slate-400"
    >
      <span className="block text-slate-600">{label}</span>
      <span className="mt-1 block text-xs font-semibold uppercase text-slate-400">
        Planned / disabled
      </span>
    </button>
  );
}

function SettingsStatusMessage({
  status,
  kind,
}: {
  status?:
    | BackupStatus
    | RestoreStatus
    | CacheStatus
    | MediaRootStatus
    | CategoryStatus
    | ExportStatus;
  kind: "backup" | "restore" | "cache" | "mediaRoot" | "category" | "export";
}) {
  const t = useTranslation();
  if (!status || status.state === "idle" || status.state === "confirming") {
    return null;
  }

  const isError = status.state === "error";
  const pendingMessage =
    kind === "backup"
      ? "Creating database backup..."
      : kind === "restore"
        ? "Restoring database..."
        : kind === "cache"
          ? "Clearing app-generated cache..."
          : kind === "mediaRoot"
            ? t("settings.libraryMedia.pending")
            : kind === "export"
              ? `Exporting ${
                  "entity" in status ? exportEntityLabel(status.entity) : "data"
                } CSV...`
              : "Updating category data...";
  const messageClassName =
    kind === "category"
      ? `mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold ${
          isError ? "text-rose-600" : "text-slate-600"
        }`
      : `border-t border-slate-200 px-4 py-3 text-sm font-semibold ${
          isError ? "text-rose-600" : "text-slate-600"
        }`;

  return (
    <p
      role={isError ? "alert" : "status"}
      className={messageClassName}
    >
      {status.state === "pending" ? pendingMessage : status.message}
    </p>
  );
}

function SettingsInfoRow({ row }: { row: SettingsRow }) {
  const Icon = row.icon;

  return (
    <div className="grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500">
          <Icon size={18} />
        </span>
        <p className="text-sm font-semibold text-slate-700">{row.label}</p>
      </div>
      <p className="text-sm font-semibold text-slate-500 sm:text-right">
        {row.value}
      </p>
    </div>
  );
}

function MediaRootList({
  roots,
  onRemove,
}: {
  roots: string[];
  onRemove: (rootPath: string) => void;
}) {
  return (
    <div className="border-t border-slate-200 px-6 py-4">
      {roots.length === 0 ? (
        <p className="text-sm font-medium text-slate-500">
          No additional media roots configured.
        </p>
      ) : (
        <div className="space-y-2">
          {roots.map((root) => (
            <div
              key={root}
              className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="min-w-0 break-all text-sm font-semibold text-slate-600">
                {displayMediaRootPath(root)}
              </p>
              <button
                type="button"
                onClick={() => onRemove(root)}
                className="h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:border-rose-200 hover:text-rose-600"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function hasMediaRoot(currentRoots: string[], nextRoot: string) {
  const nextKey = mediaRootKey(nextRoot);
  return currentRoots.some((root) => mediaRootKey(root) === nextKey);
}

function mediaRootErrorMessage(
  error: unknown,
  t: (key: string, replacements?: Record<string, string>) => string,
) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const knownErrors: Record<string, string> = {
    "Media asset root path is required": "settings.libraryMedia.error.required",
    "Media asset root folder does not exist": "settings.libraryMedia.error.missing",
    "Media asset root must be a folder": "settings.libraryMedia.error.notFolder",
    "Media asset root cannot be a drive or filesystem root":
      "settings.libraryMedia.error.filesystemRoot",
  };
  return t(knownErrors[message] ?? "settings.libraryMedia.error.generic");
}

function mediaRootKey(rootPath: string) {
  return displayMediaRootPath(rootPath).replace(/\//g, "\\").toLocaleLowerCase();
}

function displayMediaRootPath(rootPath: string) {
  return rootPath.trim().replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
}

export default SettingsPage;
