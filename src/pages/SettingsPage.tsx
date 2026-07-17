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
  Download,
  Trash2,
  RefreshCw,
  CalendarDays,
  Package,
  FolderOpen,
  Check,
  CheckCircle2,
  RotateCcw,
  Search,
  Eye,
  MoreHorizontal,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ConfirmDialog from "../components/ConfirmDialog";
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
  exportEntityLabel,
  type ExportCsvEntity,
  type ExportFormat,
} from "../lib/exportCsv";
import { exportSelectionSummary, prepareSelectionsWithPublicRefs } from "../lib/exportArtifacts";
import type { ExportDataSelection } from "../lib/exportWorkbook";
import { normalizeLanguageCode, type LanguageCode } from "../lib/language";
import {
  type ImportCsvPreview,
} from "../lib/importCsvPreview";
import {
  buildCsvCatalogPreview,
  buildXlsxCatalogPreview,
  type ImportCatalogPreview,
  type ImportCatalogRow,
} from "../lib/importCatalog";
import {
  countApplicableImportRows,
  type ImportCsvApplyReport,
} from "../lib/importCsvApply";
import {
  buildImportOperationPlan,
  ImportPlanContractError,
  type ImportOperationPlan,
} from "../lib/importOperationPlan";
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
import { listCredits } from "../runtime/creditCommands";
import {
  createBackupPackage,
  deleteBackupPackage,
  exportBackupPackage,
  importSelectedBackupPackage,
  listBackupPackages,
  openBackupFolder,
  previewBackupPackage,
  restoreBackupPackage,
  type BackupPackageInfo,
  type BackupPackagePreview,
  type BackupPackageRestoreResult,
} from "../runtime/databaseCommands";
import {
  selectBackupPackageExportDestination,
  selectExportCsvDestination,
  selectImportCatalogSource,
  selectLanguageCsvExportDestination,
  selectLanguageCsvImportSource,
  selectLocalFolder,
} from "../runtime/dialogCommands";
import {
  writeExportCsv,
} from "../runtime/exportCommands";
import { isTemplateExport, runCatalogExport } from "../runtime/catalogExport";
import {
  applyImportCatalogPlan,
  readImportCatalogFile,
  readImportCsv,
} from "../runtime/importCommands";
import {
  getSakuravaRefMigrationStatus,
  requireMigratedSakuravaRefs,
  type SakuravaRefMigrationStatus,
} from "../runtime/sakuravaRefCommands";
import { listGlossaryEntries } from "../runtime/glossaryCommands";
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
import {
  AUTOMATIC_BACKUP_RESULT_EVENT,
  AUTOMATIC_BACKUP_SETTINGS_EVENT,
  loadBackupRecoverySettings,
  setBackupUiOperationPending,
  updateAutomaticBackupSettings,
  type AutomaticBackupFrequency,
  type AutomaticBackupResultDetail,
} from "../lib/automaticBackup";
import { listImages, updateImage } from "../runtime/imageCommands";
import {
  listManagedCategories,
} from "../runtime/managedCategoryCommands";
import {
  allowMediaAssetRoot,
  getStoredMediaAssetRoots,
  storeMediaAssetRoots,
} from "../runtime/mediaAssetScope";
import { listPerformers, updatePerformer } from "../runtime/performerCommands";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";
import { listVideos, updateVideo } from "../runtime/videoCommands";

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

type AutomaticBackupStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type BackupPackageManagementStatus =
  | { state: "idle" }
  | { state: "downloadPending"; packageName: string }
  | { state: "deleteConfirm"; backupPackage: BackupPackageInfo }
  | { state: "deletePending"; backupPackage: BackupPackageInfo }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type BackupToast = {
  id: number;
  tone: "success" | "error";
  title: string;
  detail?: string;
};

type RestoreStatus =
  | { state: "idle" }
  | { state: "importPending" }
  | { state: "previewPending"; packageName: string }
  | { state: "confirming"; preview: BackupPackagePreview }
  | { state: "pending"; preview: BackupPackagePreview }
  | { state: "success"; result: BackupPackageRestoreResult; preview: BackupPackagePreview }
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
  | { state: "pending"; label: string; format: ExportFormat }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type ImportStatus =
  | { state: "idle" }
  | { state: "pending" }
  | {
      state: "preview";
      sourcePath: string;
      displayName: string;
      format: "csv" | "xlsx";
      preview: ImportCatalogPreview;
      plan: ImportOperationPlan | null;
    }
  | { state: "error"; message: string };
type ImportApplyStatus =
  | { state: "idle" }
  | { state: "confirming"; preview: ImportCatalogPreview; plan: ImportOperationPlan }
  | { state: "pending" }
  | { state: "error"; message: string; failureStage?: string };
type ImportPreviewRow = ImportCatalogRow;

function combineImportApplyReports(reports: ImportCsvApplyReport[]): ImportCsvApplyReport {
  if (reports.length === 1) return reports[0];
  return {
    entity: "unknown",
    totalRows: reports.reduce((total, report) => total + report.totalRows, 0),
    appliedAdded: reports.reduce((total, report) => total + report.appliedAdded, 0),
    appliedModified: reports.reduce((total, report) => total + report.appliedModified, 0),
    appliedDeleted: reports.reduce((total, report) => total + report.appliedDeleted, 0),
    unchanged: reports.reduce((total, report) => total + report.unchanged, 0),
    skipped: reports.reduce((total, report) => total + report.skipped, 0),
    failed: reports.reduce((total, report) => total + report.failed, 0),
    warnings: reports.reduce((total, report) => total + report.warnings, 0),
    errors: reports.reduce((total, report) => total + report.errors, 0),
    rows: reports.flatMap((report) => report.rows),
  };
}

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
  const [backupNote, setBackupNote] = useState("");
  const [backupPackages, setBackupPackages] = useState<BackupPackageInfo[]>([]);
  const [backupListError, setBackupListError] = useState("");
  const [selectedBackupPackage, setSelectedBackupPackage] = useState<string | null>(null);
  const [restoreConfirmationOpen, setRestoreConfirmationOpen] = useState(false);
  const [backupHistoryPage, setBackupHistoryPage] = useState(1);
  const [backupHistoryPageSize, setBackupHistoryPageSize] = useState(32);
  const [backupRecoverySettings, setBackupRecoverySettings] = useState(
    () => loadBackupRecoverySettings(),
  );
  const [automaticBackupStatus, setAutomaticBackupStatus] =
    useState<AutomaticBackupStatus>({ state: "idle" });
  const [backupPackageManagementStatus, setBackupPackageManagementStatus] =
    useState<BackupPackageManagementStatus>({ state: "idle" });
  const [backupToasts, setBackupToasts] = useState<BackupToast[]>([]);
  const backupToastTimersRef = useRef(new Map<number, number>());
  const backupToastIdRef = useRef(0);
  const selectedBackupPackageRef = useRef<string | null>(null);
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
  const [catalogRefStatus, setCatalogRefStatus] = useState<SakuravaRefMigrationStatus | null>(null);
  const [catalogRefValidationFailed, setCatalogRefValidationFailed] = useState(false);
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
  const isPreviewPending = restoreStatus.state === "previewPending";
  const isSelectedImportPending = restoreStatus.state === "importPending";
  const isBackupOperationPending =
    isBackupPending ||
    isSelectedImportPending ||
    isPreviewPending ||
    isRestorePending;
  const isBackupPackageManagementPending =
    backupPackageManagementStatus.state === "downloadPending" ||
    backupPackageManagementStatus.state === "deletePending";
  const isCachePending = cacheStatus.state === "pending";
  const isMediaRootPending = mediaRootStatus.state === "pending";
  const isExportPending = exportStatus.state === "pending";
  const isImportPending = importStatus.state === "pending";
  const isImportApplyPending = importApplyStatus.state === "pending";
  const catalogRefsReady = !isDesktopRuntime || catalogRefStatus?.state === "migrated";
  const canBackUpDatabase =
    isDesktopRuntime &&
    !isBackupOperationPending &&
    !isBackupPackageManagementPending;
  const canClearCache =
    isDesktopRuntime && !isCachePending && !isBackupPending && !isRestorePending;
  const canExportCsv =
    isDesktopRuntime && catalogRefsReady && !isExportPending && !isImportApplyPending && !isBackupPending && !isRestorePending;
  const canImportCsv =
    isDesktopRuntime &&
    catalogRefsReady &&
    !isImportPending &&
    !isImportApplyPending &&
    !isBackupPending &&
    !isRestorePending;
  const canAddMediaRoot = isDesktopRuntime && !isMediaRootPending;
  const isLanguageCsvBusy = languageCsvStatus.state === "pending";

  async function refreshCatalogRefStatus() {
    if (!isDesktopRuntime) return;
    setCatalogRefValidationFailed(false);
    try {
      const status = await getSakuravaRefMigrationStatus();
      setCatalogRefStatus({
        ...status,
        state: status.state ?? (status.required ? "legacy" : "migrated"),
      });
    } catch {
      setCatalogRefStatus(null);
      setCatalogRefValidationFailed(true);
    }
  }

  useEffect(() => {
    void refreshCatalogRefStatus();
    const handleIdentityChange = () => void refreshCatalogRefStatus();
    window.addEventListener("sakurava-ref-state-changed", handleIdentityChange);
    return () => window.removeEventListener("sakurava-ref-state-changed", handleIdentityChange);
  }, [isDesktopRuntime]);

  function dismissBackupToast(id: number) {
    const timer = backupToastTimersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    backupToastTimersRef.current.delete(id);
    setBackupToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showBackupToast(
    tone: BackupToast["tone"],
    title: string,
    detail?: string,
  ) {
    const id = ++backupToastIdRef.current;
    setBackupToasts((current) => [...current, { id, tone, title, detail }].slice(-3));
    const timer = window.setTimeout(
      () => dismissBackupToast(id),
      tone === "success" ? 4500 : 9000,
    );
    backupToastTimersRef.current.set(id, timer);
  }

  useEffect(() => () => {
    backupToastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    backupToastTimersRef.current.clear();
  }, []);

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
    selectedBackupPackageRef.current = selectedBackupPackage;
  }, [selectedBackupPackage]);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(backupPackages.length / backupHistoryPageSize));
    setBackupHistoryPage((current) => Math.min(current, pageCount));
  }, [backupPackages.length, backupHistoryPageSize]);

  useEffect(() => {
    if (!isDesktopRuntime) {
      setBackupPackages([]);
      return;
    }
    void refreshBackupPackages();
  }, [isDesktopRuntime]);

  useEffect(() => {
    setBackupUiOperationPending(isBackupOperationPending);
    return () => {
      setBackupUiOperationPending(false);
    };
  }, [isBackupOperationPending]);

  useEffect(() => {
    const handleSettingsChange = () => {
      setBackupRecoverySettings(loadBackupRecoverySettings());
    };
    const handleAutomaticBackupResult = (event: Event) => {
      const detail = (event as CustomEvent<AutomaticBackupResultDetail>).detail;
      if (detail.state === "pending") {
        setAutomaticBackupStatus({ state: "pending" });
        return;
      }
      if (detail.state === "success") {
        setBackupRecoverySettings(loadBackupRecoverySettings());
        setAutomaticBackupStatus({
          state: "success",
          message: t("settings.backup.automatic.success"),
        });
        void refreshBackupPackages();
        return;
      }
      setAutomaticBackupStatus({
        state: "error",
        message: t("settings.backup.automatic.retry"),
      });
    };

    window.addEventListener(
      AUTOMATIC_BACKUP_SETTINGS_EVENT,
      handleSettingsChange,
    );
    window.addEventListener(
      AUTOMATIC_BACKUP_RESULT_EVENT,
      handleAutomaticBackupResult,
    );
    return () => {
      window.removeEventListener(
        AUTOMATIC_BACKUP_SETTINGS_EVENT,
        handleSettingsChange,
      );
      window.removeEventListener(
        AUTOMATIC_BACKUP_RESULT_EVENT,
        handleAutomaticBackupResult,
      );
    };
  }, [t]);

  function handleAutomaticBackupEnabled(enabled: boolean) {
    const next = updateAutomaticBackupSettings({ enabled });
    setBackupRecoverySettings(next);
    if (!enabled) {
      setAutomaticBackupStatus({ state: "idle" });
    }
  }

  function handleAutomaticBackupFrequency(
    frequency: AutomaticBackupFrequency,
  ) {
    setBackupRecoverySettings(
      updateAutomaticBackupSettings({ frequency }),
    );
  }

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

  async function refreshBackupPackages() {
    try {
      const packages = await listBackupPackages();
      const restorePackages = packages.filter(
        (backupPackage) => backupPackage.manifest.backupType !== "safety",
      );
      setBackupPackages(restorePackages);
      setBackupListError("");
      setSelectedBackupPackage((current) =>
        current &&
        restorePackages.some((backupPackage) => backupPackage.packageName === current)
          ? current
          : null,
      );
      return restorePackages;
    } catch (error) {
      setBackupListError(t("settings.backup.error.list"));
      return [];
    }
  }

  async function handleBackupData() {
    if (!canBackUpDatabase) {
      return;
    }

    setBackupStatus({ state: "pending" });

    try {
      const note = backupNote.trim();
      await createBackupPackage("manual", note || undefined);
      setBackupNote("");
      setBackupStatus({
        state: "success",
        message: t("settings.backup.status.created"),
      });
      showBackupToast("success", t("settings.backup.toast.created"));
      await refreshBackupPackages();
    } catch (error) {
      const message = runtimeErrorMessage(error, t("settings.backup.error.generic"));
      setBackupStatus({
        state: "error",
        message: /already exists for this second|already exists.*second/i.test(message)
          ? t("settings.backup.error.tooSoon")
          : t("settings.backup.error.generic"),
      });
      showBackupToast("error", t("settings.backup.toast.createError"));
    }
  }

  async function handleOpenBackupFolder() {
    if (!isDesktopRuntime || isBackupOperationPending) {
      return;
    }
    try {
      await openBackupFolder();
    } catch (error) {
      setBackupStatus({
        state: "error",
        message: t("settings.backup.error.openFolder"),
      });
    }
  }

  async function handleDownloadBackupPackage(backupPackage: BackupPackageInfo) {
    if (
      !isDesktopRuntime ||
      isBackupOperationPending ||
      isBackupPackageManagementPending
    ) {
      return;
    }
    setBackupPackageManagementStatus({
      state: "downloadPending",
      packageName: backupPackage.packageName,
    });
    const destinationRoot = await selectBackupPackageExportDestination();
    if (!destinationRoot) {
      setBackupPackageManagementStatus({ state: "idle" });
      return;
    }
    try {
      await exportBackupPackage(backupPackage.packageName, destinationRoot);
      setBackupPackageManagementStatus({
        state: "success",
        message: t("settings.backup.management.downloadSuccess"),
      });
      showBackupToast("success", t("settings.backup.toast.downloaded"));
    } catch {
      setBackupPackageManagementStatus({
        state: "error",
        message: t("settings.backup.management.downloadError"),
      });
      showBackupToast("error", t("settings.backup.toast.downloadError"));
    }
  }

  function handleRequestDeleteBackupPackage(backupPackage: BackupPackageInfo) {
    if (isBackupOperationPending || isBackupPackageManagementPending) {
      return;
    }
    setBackupPackageManagementStatus({
      state: "deleteConfirm",
      backupPackage,
    });
  }

  async function handleConfirmDeleteBackupPackage() {
    if (backupPackageManagementStatus.state !== "deleteConfirm") {
      return;
    }
    const backupPackage = backupPackageManagementStatus.backupPackage;
    setBackupPackageManagementStatus({
      state: "deletePending",
      backupPackage,
    });
    try {
      await deleteBackupPackage(backupPackage.packageName);
      if (selectedBackupPackageRef.current === backupPackage.packageName) {
        selectedBackupPackageRef.current = null;
        setSelectedBackupPackage(null);
        setRestoreStatus({ state: "idle" });
        setRestoreConfirmationOpen(false);
      }
      await refreshBackupPackages();
      setBackupPackageManagementStatus({
        state: "success",
        message: t("settings.backup.management.deleteSuccess"),
      });
      showBackupToast("success", t("settings.backup.toast.deleted"));
    } catch {
      setBackupPackageManagementStatus({
        state: "error",
        message: t("settings.backup.management.deleteError"),
      });
      showBackupToast("error", t("settings.backup.toast.deleteError"));
    }
  }

  async function startRestorePreview(packageName: string) {
    setRestoreConfirmationOpen(false);
    selectedBackupPackageRef.current = packageName;
    setSelectedBackupPackage(packageName);
    setRestoreStatus({ state: "previewPending", packageName });
    try {
      const preview = await previewBackupPackage(packageName);
      setRestoreStatus(
        selectedBackupPackageRef.current === packageName
          ? { state: "confirming", preview }
          : { state: "idle" },
      );
    } catch (error) {
      if (selectedBackupPackageRef.current === packageName) {
        setRestoreStatus({
          state: "error",
          message: t("settings.backup.error.preview"),
        });
      }
    }
  }

  async function handleRestoreHistoryPackage(packageName: string) {
    if (!isDesktopRuntime || isBackupOperationPending) {
      return;
    }
    await startRestorePreview(packageName);
  }

  async function handleRequestRestoreHistoryPackage(packageName: string) {
    if (!isDesktopRuntime || isBackupOperationPending) return;
    if (
      restoreStatus.state === "confirming" &&
      restoreStatus.preview.packageName === packageName
    ) {
      setRestoreConfirmationOpen(true);
      return;
    }
    selectedBackupPackageRef.current = packageName;
    setSelectedBackupPackage(packageName);
    setRestoreStatus({ state: "previewPending", packageName });
    try {
      const preview = await previewBackupPackage(packageName);
      if (selectedBackupPackageRef.current === packageName) {
        setRestoreStatus({ state: "confirming", preview });
        setRestoreConfirmationOpen(true);
      }
    } catch {
      if (selectedBackupPackageRef.current === packageName) {
        setRestoreStatus({ state: "error", message: t("settings.backup.error.preview") });
      }
    }
  }

  async function handleImportSelectedBackupPackage() {
    if (!isDesktopRuntime || isBackupOperationPending) {
      return;
    }
    setRestoreStatus({ state: "importPending" });
    try {
      const result = await importSelectedBackupPackage();
      if (result.cancelled) {
        setRestoreStatus({ state: "idle" });
        return;
      }
      if (!result.imported || !result.packageName) {
        setRestoreStatus({
          state: "error",
          message: t("settings.backup.importSelected.error.generic"),
        });
        showBackupToast("error", t("settings.backup.toast.importError"));
        return;
      }
      showBackupToast("success", t("settings.backup.toast.imported"));
      await refreshBackupPackages();
      await startRestorePreview(result.packageName);
    } catch (error) {
      setRestoreStatus({
        state: "error",
        message:
          runtimeErrorCode(error) === "invalid_selected_package"
            ? t("settings.backup.importSelected.error.invalid")
            : t("settings.backup.importSelected.error.generic"),
      });
      showBackupToast("error", t("settings.backup.toast.importError"));
    }
  }

  async function handleConfirmRestore() {
    if (restoreStatus.state !== "confirming") {
      return;
    }

    const { preview } = restoreStatus;
    if (preview.packageName !== selectedBackupPackageRef.current) {
      setRestoreStatus({ state: "idle" });
      return;
    }
    setRestoreStatus({ state: "pending", preview });

    try {
      const result = await restoreBackupPackage(preview.packageName);
      if (!result.databaseRestored) {
        throw new Error("Restore did not activate the selected database.");
      }
      setRestoreStatus({ state: "success", result, preview });
      setRestoreConfirmationOpen(false);
      await refreshBackupPackages();
      // The database is now a different catalog. App owns the controlled
      // route/provider reset so this Settings tree cannot render stale data.
      window.dispatchEvent(new Event("sakurava-database-restored"));
    } catch (error) {
      setRestoreStatus({
        state: "error",
        message:
          runtimeErrorCode(error) === "restore_rollback_failed"
            ? t("settings.backup.error.restoreRollback")
            : t("settings.backup.error.restore"),
      });
    }
  }

  function handleDismissRestoreResult() {
    selectedBackupPackageRef.current = null;
    setSelectedBackupPackage(null);
    setRestoreStatus({ state: "idle" });
    setRestoreConfirmationOpen(false);
    void refreshBackupPackages();
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

  async function loadExportSelection(entity: ExportCsvEntity): Promise<ExportDataSelection> {
    const records =
      entity === "videos"
        ? await listVideos()
        : entity === "images"
          ? await listImages()
          : entity === "performers"
          ? await listPerformers()
            : entity === "categories"
              ? await listManagedCategories()
              : await listGlossaryEntries();
    return { dataType: entity, records };
  }

  async function loadExportCounts(): Promise<Partial<Record<ExportCsvEntity, number>>> {
    const entities: ExportCsvEntity[] = ["videos", "images", "performers", "categories", "glossary"];
    const selections = await Promise.all(entities.map(loadExportSelection));
    return Object.fromEntries(
      selections.map((selection) => [selection.dataType, selection.records.length]),
    );
  }

  async function handleCatalogExport(
    format: ExportFormat,
    entities: ExportCsvEntity[],
    template = false,
  ) {
    if (!canExportCsv) {
      return;
    }

    const label = entities.length === 1 ? exportEntityLabel(entities[0]) : "selected data types";
    setExportStatus({ state: "pending", label, format });

    try {
      await requireMigratedSakuravaRefs();
      const operationDate = new Date();
      const selections = template
        ? entities.map((dataType) => ({ dataType, records: [] }))
        : prepareSelectionsWithPublicRefs(
            await Promise.all(
              (["videos", "images", "performers", "categories", "glossary"] as ExportCsvEntity[])
                .map(loadExportSelection),
            ),
          ).filter((selection) => entities.includes(selection.dataType));
      const emptySelections = template
        ? []
        : selections.filter((selection) => selection.records.length === 0);
      if (emptySelections.length > 0) {
        showBackupToast(
          "error",
          "No records to export",
          `${emptySelections.map((selection) => exportEntityLabel(selection.dataType)).join(", ")} has no catalog records. Turn on Export as template to create an empty template.`,
        );
        setExportStatus({ state: "idle" });
        return;
      }
      const locale = navigator.language || "en-US";
      const result = await runCatalogExport({ format, selections, locale, date: operationDate, template });
      if (result.cancelled) {
        setExportStatus({ state: "idle" });
        return;
      }
      if (result.errors.length > 0) {
        showBackupToast("error", "Export could not be completed", result.errors.join(" "));
        setExportStatus({ state: "idle" });
        return;
      }
      const message = result.exportedFileCount === 1
        ? `${result.displayNames[0]}. ${exportSelectionSummary(selections)}.`
        : `${result.exportedFileCount} ${format.toUpperCase()} files. ${exportSelectionSummary(selections)}.`;
      showBackupToast(
        "success",
        template || isTemplateExport(selections) ? "Template downloaded" : "Export completed",
        message,
      );
      setExportStatus({ state: "idle" });
    } catch (error) {
      showBackupToast(
        "error",
        "Export could not be completed",
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Database records and media files were not changed.",
      );
      setExportStatus({ state: "idle" });
    }
  }

  async function handleImportCatalogPreview(): Promise<boolean> {
    if (!canImportCsv) {
      return false;
    }

    try {
      await requireMigratedSakuravaRefs();
      const sourcePath = await selectImportCatalogSource();
      if (!sourcePath) {
        return false;
      }
      await previewCatalogImportSource(sourcePath);
      return true;
    } catch (error) {
      setImportStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Catalog import preview failed. Database records and media files were not changed.",
      });
      return true;
    }
  }

  async function previewCatalogImportSource(sourcePath: string) {
    setImportStatus({ state: "pending" });
    setImportApplyStatus({ state: "idle" });
    const [fileResult, videos, images, performers, categories, glossary, credits] =
      await Promise.all([
        readImportCatalogFile(sourcePath),
        listVideos(),
        listImages(),
        listPerformers(),
        listManagedCategories(),
        listGlossaryEntries(),
        listCredits(),
      ]);
    const context = { videos, images, performers, categories, glossary, credits };
    const bytes = new Uint8Array(fileResult.bytes);
    const locale = navigator.language || "en-US";
    const messages = {
      invalidDate: (field: string, format: string) =>
        t("settings.importExport.invalidDate", { field, format }),
      invalidWorkbook: t("settings.importExport.invalidWorkbook"),
      invalidSheet: t("settings.importExport.invalidSheet"),
    };
    const basePreview = fileResult.format === "xlsx"
      ? await buildXlsxCatalogPreview(bytes, context, locale, messages)
      : buildCsvCatalogPreview(new TextDecoder().decode(bytes), context, locale, messages);
    const preview = basePreview;
    const plan = preview.summary.blocked
      ? null
      : buildImportOperationPlan(preview, context, bytes);
    setImportStatus({
      state: "preview",
      sourcePath: fileResult.sourcePath,
      displayName: fileResult.displayName,
      format: fileResult.format,
      preview,
      plan,
    });
  }

  async function handleRefreshImportCatalogPreview() {
    if (importStatus.state !== "preview" || isImportApplyPending) return;
    const sourcePath = importStatus.sourcePath;
    try {
      await previewCatalogImportSource(sourcePath);
    } catch (error) {
      setImportStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Catalog import Preview could not be rebuilt.",
      });
    }
  }


  function handleRequestImportApply(preview: ImportCatalogPreview) {
    const applicableRows = preview.sections.reduce(
      (total, section) => total + countApplicableImportRows(section.preview),
      0,
    );
    if (
      preview.summary.blocked ||
      applicableRows === 0 ||
      importStatus.state !== "preview" ||
      !importStatus.plan
    ) {
      return;
    }
    setImportApplyStatus({ state: "confirming", preview, plan: importStatus.plan });
  }

  async function handleConfirmImportApply(preview: ImportCatalogPreview) {
    if (preview.summary.blocked || importApplyStatus.state !== "confirming") return;
    const plan = importApplyStatus.plan;
    setImportApplyStatus({ state: "pending" });

    try {
      await requireMigratedSakuravaRefs();
      const result = await applyImportCatalogPlan(plan);
      if (result.transactionStatus !== "committed") {
        setImportApplyStatus({
          state: "error",
          message: result.message,
          failureStage: ["stalePreview", "validation", "apply"].includes(result.failureStage ?? "")
            ? "stalePreview"
            : result.failureStage ?? undefined,
        });
        showBackupToast("error", "Import was not applied", result.message);
        return;
      }
      showBackupToast(
        "success",
        "Import completed",
        `${result.createdCount + result.updatedCount + result.deletedCount} catalog changes applied.`,
      );
      setImportApplyStatus({ state: "idle" });
      setImportStatus({ state: "idle" });
      await Promise.all([loadCategoryData(), refreshCatalogRefStatus()]);
    } catch (error) {
      if (error instanceof ImportPlanContractError) {
        setImportApplyStatus({
          state: "error",
          message: "The import plan could not be processed. No catalog changes were saved. Preview the file again before retrying.",
          failureStage: "stalePreview",
        });
        showBackupToast(
          "error",
          "Import was not applied",
          "The import plan could not be processed. Preview the file again before retrying.",
        );
        return;
      }
      setImportApplyStatus({
        state: "error",
        message:
          error instanceof Error
            ? `${error.message} No catalog changes were saved.`
            : typeof error === "string"
              ? `${error} No catalog changes were saved.`
              : "Import could not be applied. No catalog changes were saved.",
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
          selectedBackupPackage,
          restoreConfirmationOpen,
          backupNote,
          backupPackages,
          backupListError,
          backupHistoryPage,
          backupHistoryPageSize,
          backupRecoverySettings,
          automaticBackupStatus,
          backupPackageManagementStatus,
          backupToasts,
          importStatus,
          importApplyStatus,
          exportStatus,
          cacheStatus,
          isMediaRootPending,
          isBackupPending,
          isSelectedImportPending,
          isRestorePending,
          isBackupOperationPending,
          isImportPending,
          isExportPending,
          isCachePending,
          canAddMediaRoot,
          canBackUpDatabase,
          canImportCsv,
          canExportCsv,
          catalogRefsReady,
          catalogRefStatus,
          catalogRefValidationFailed,
          refreshCatalogRefStatus,
          canClearCache,
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
          handleImportSelectedBackupPackage,
          setBackupNote,
          handleOpenBackupFolder,
          handleAutomaticBackupEnabled,
          handleAutomaticBackupFrequency,
          handleDownloadBackupPackage,
          handleRequestDeleteBackupPackage,
          handleConfirmDeleteBackupPackage,
          setBackupPackageManagementStatus,
          refreshBackupPackages,
          setBackupHistoryPage,
          setBackupHistoryPageSize,
          handleRestoreHistoryPackage,
          handleRequestRestoreHistoryPackage,
          setRestoreStatus,
          setRestoreConfirmationOpen,
          handleConfirmRestore,
          handleDismissRestoreResult,
          dismissBackupToast,
          handleImportCatalogPreview,
          handleRefreshImportCatalogPreview,
          setImportStatus,
          loadExportCounts,
          handleCatalogExport,
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
  id,
  title,
  icon,
  children,
  onReset,
  showReset = true,
  headerAction,
}: {
  id?: string;
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  onReset?: () => void;
  showReset?: boolean;
  headerAction?: ReactNode;
}) {
  const Icon = icon;

  return (
    <section id={id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex h-12 items-center gap-3 border-b border-slate-200 px-4">
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500">
          <Icon size={18} />
        </span>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {headerAction ? <div className="ml-auto">{headerAction}</div> : null}
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
    selectedBackupPackage,
    restoreConfirmationOpen,
    backupNote,
    backupPackages,
    backupListError,
    backupHistoryPage,
    backupHistoryPageSize,
    backupRecoverySettings,
    automaticBackupStatus,
    backupPackageManagementStatus,
    backupToasts,
    importStatus,
    importApplyStatus,
    exportStatus,
    cacheStatus,
    isMediaRootPending,
    isBackupPending,
    isSelectedImportPending,
    isRestorePending,
    isBackupOperationPending,
    isImportPending,
    isExportPending,
    isCachePending,
    canAddMediaRoot,
    canBackUpDatabase,
    canImportCsv,
    canExportCsv,
    catalogRefsReady,
    catalogRefStatus,
    catalogRefValidationFailed,
    refreshCatalogRefStatus,
    canClearCache,
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
    handleImportSelectedBackupPackage,
    setBackupNote,
    handleOpenBackupFolder,
    handleAutomaticBackupEnabled,
    handleAutomaticBackupFrequency,
    handleDownloadBackupPackage,
    handleRequestDeleteBackupPackage,
    handleConfirmDeleteBackupPackage,
    setBackupPackageManagementStatus,
    refreshBackupPackages,
    setBackupHistoryPage,
    setBackupHistoryPageSize,
    handleRestoreHistoryPackage,
    handleRequestRestoreHistoryPackage,
    setRestoreStatus,
    setRestoreConfirmationOpen,
    handleConfirmRestore,
    handleDismissRestoreResult,
    dismissBackupToast,
    handleImportCatalogPreview,
    handleRefreshImportCatalogPreview,
    setImportStatus,
    loadExportCounts,
    handleCatalogExport,
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

      <SettingsPanelCard
        id="backup-recovery"
        title={t("settings.backup.title")}
        icon={ShieldCheck}
        showReset={false}
      >
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <span className="inline-flex size-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={25} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-500">{t("settings.backup.status.title")}</p>
                <p className="mt-1 text-base font-semibold text-slate-900">
                  {backupPackages[0]
                    ? t("settings.backup.lastBackupValue", { createdAt: formatBackupCreatedAt(backupPackages[0].manifest.createdAt) })
                    : t("settings.backup.lastBackupValue", { createdAt: t("common.notAvailable") })}
                </p>
                {backupPackages[0] ? <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={12} aria-hidden="true" />{t("settings.backup.status.success")}</span> : null}
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 md:w-60">
              <button type="button" disabled={!canBackUpDatabase} onClick={handleBackupData} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sakura-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sakura-600 disabled:bg-slate-300">
                <Plus size={16} aria-hidden="true" />{isBackupPending ? t("settings.backup.backingUp") : t("settings.backup.backupNow")}
              </button>
              <button type="button" disabled={!isDesktopRuntime || isBackupOperationPending} onClick={handleImportSelectedBackupPackage} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-sakura-200 hover:text-sakura-600 disabled:text-slate-300">
                <RotateCcw size={15} aria-hidden="true" />{isSelectedImportPending ? t("settings.backup.importSelected.importing") : t("settings.backup.importSelected.action")}
              </button>
            </div>
          </div>
          <label className="mt-3 flex h-10 items-center gap-3 border-t border-slate-100 pt-3">
            <span className="sr-only">{t("settings.backup.note.label")}</span><FilePenLine size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
            <input value={backupNote} maxLength={255} onChange={(event) => setBackupNote(event.target.value)} aria-label={t("settings.backup.note.label")} placeholder={t("settings.backup.note.placeholderFinal")} disabled={isBackupOperationPending} className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400" />
            <span className="text-xs font-medium text-slate-400">{backupNote.length}/255</span>
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3"><span className="inline-flex size-10 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500"><FolderOpen size={20} aria-hidden="true" /></span><div><p className="text-xs font-semibold text-slate-500">{t("settings.backup.location.title")}</p><p className="mt-1 text-sm font-semibold text-slate-900">{t("settings.backup.location.default")}</p><button type="button" disabled={!isDesktopRuntime || isBackupOperationPending} onClick={handleOpenBackupFolder} className="mt-1 text-xs font-semibold text-sakura-600 disabled:text-slate-400">{t("settings.backup.openFolderShort")}</button></div></div>
          <button type="button" disabled className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-300">{t("settings.backup.location.change")}</button>
        </div>
        <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] md:items-center">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-label={t("settings.backup.automatic.title")}
              aria-checked={backupRecoverySettings.automaticBackup.enabled}
              onClick={() =>
                handleAutomaticBackupEnabled(
                  !backupRecoverySettings.automaticBackup.enabled,
                )
              }
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                backupRecoverySettings.automaticBackup.enabled
                  ? "bg-sakura-500"
                  : "bg-slate-200"
              }`}
            >
              <span
                className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition ${
                  backupRecoverySettings.automaticBackup.enabled
                    ? "left-6"
                    : "left-1"
                }`}
              />
            </button>
            <div>
              <p className="text-sm font-semibold text-slate-700">
                {t("settings.backup.automatic.title")}
              </p>
              <p className="text-xs font-medium text-slate-500">
                {automaticBackupStatus.state === "pending"
                  ? t("settings.backup.automatic.running")
                  : automaticBackupStatus.state === "error"
                    ? automaticBackupStatus.message
                    : backupRecoverySettings.automaticBackup
                          .lastSuccessfulAutomaticBackupAt
                      ? t("settings.backup.automatic.lastSuccess", {
                          createdAt: formatBackupCreatedAt(
                            backupRecoverySettings.automaticBackup
                              .lastSuccessfulAutomaticBackupAt,
                          ),
                        })
                      : backupRecoverySettings.automaticBackup.enabled
                        ? t("settings.backup.automatic.enabled")
                        : t("settings.backup.automatic.disabled")}
              </p>
            </div>
          </div>
          <label className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-xs font-semibold text-slate-500">
            {t("settings.backup.automatic.frequency")}
            <select
              aria-label={t("settings.backup.automatic.frequency")}
              disabled={!backupRecoverySettings.automaticBackup.enabled}
              value={backupRecoverySettings.automaticBackup.frequency}
              onChange={(event) =>
                handleAutomaticBackupFrequency(
                  event.target.value as AutomaticBackupFrequency,
                )
              }
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600"
            >
              <option value="daily">{t("settings.backup.automatic.daily")}</option>
              <option value="weekly">{t("settings.backup.automatic.weekly")}</option>
              <option value="monthly">{t("settings.backup.automatic.monthly")}</option>
            </select>
          </label>
        </div>
        {backupStatus.state === "error" ? <SettingsStatusMessage status={backupStatus} kind="backup" /> : null}
        {backupListError ? (
          <p role="alert" className="text-sm font-semibold text-rose-600">
            {backupListError}
          </p>
        ) : null}
        <BackupHistoryPanel
          packages={backupPackages}
          page={backupHistoryPage}
          pageSize={backupHistoryPageSize}
          busy={
            isBackupOperationPending ||
            backupPackageManagementStatus.state === "downloadPending" ||
            backupPackageManagementStatus.state === "deletePending"
          }
          restoreStatus={restoreStatus}
          selectedPackageName={selectedBackupPackage}
          restoreConfirmationOpen={restoreConfirmationOpen}
          managementStatus={backupPackageManagementStatus}
          toasts={backupToasts}
          onRefresh={() => void refreshBackupPackages()}
          onPageChange={setBackupHistoryPage}
          onPageSizeChange={setBackupHistoryPageSize}
          onSelect={handleRestoreHistoryPackage}
          onRestore={handleRequestRestoreHistoryPackage}
          onDownload={handleDownloadBackupPackage}
          onDelete={handleRequestDeleteBackupPackage}
          onCancelDelete={() =>
            setBackupPackageManagementStatus({ state: "idle" })
          }
          onConfirmDelete={handleConfirmDeleteBackupPackage}
          onCancelRestore={() => setRestoreConfirmationOpen(false)}
          onConfirmRestore={handleConfirmRestore}
          onDone={handleDismissRestoreResult}
          onDismissToast={dismissBackupToast}
        />
      </SettingsPanelCard>

      <SettingsPanelCard title={t("settings.importExport.title")} icon={FileArchive} showReset={false}>
        {catalogRefsReady ? <ImportExportPanel
          importStatus={importStatus}
          importApplyStatus={importApplyStatus}
          isImportPending={isImportPending}
          isExportPending={isExportPending}
          canImport={canImportCsv}
          canExport={canExportCsv}
          onChooseImport={handleImportCatalogPreview}
          onRefreshImport={handleRefreshImportCatalogPreview}
          onResetImport={() => {
            setImportStatus({ state: "idle" });
            setImportApplyStatus({ state: "idle" });
          }}
          onLoadExportCounts={loadExportCounts}
          onExport={handleCatalogExport}
          onRequestApply={handleRequestImportApply}
          onCancelApply={() => setImportApplyStatus({ state: "idle" })}
          onConfirmApply={handleConfirmImportApply}
        /> : <CatalogReferenceBoundary
          status={catalogRefStatus}
          validationFailed={catalogRefValidationFailed}
          onRetry={() => void refreshCatalogRefStatus()}
          onOpenRecovery={() => document.getElementById("backup-recovery")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />}
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

function ImportExportPanel({
  importStatus,
  importApplyStatus,
  isImportPending,
  isExportPending,
  canImport,
  canExport,
  onChooseImport,
  onRefreshImport,
  onResetImport,
  onLoadExportCounts,
  onExport,
  onRequestApply,
  onCancelApply,
  onConfirmApply,
}: {
  importStatus: ImportStatus;
  importApplyStatus: ImportApplyStatus;
  isImportPending: boolean;
  isExportPending: boolean;
  canImport: boolean;
  canExport: boolean;
  onChooseImport: () => Promise<boolean>;
  onRefreshImport: () => void;
  onResetImport: () => void;
  onLoadExportCounts: () => Promise<Partial<Record<ExportCsvEntity, number>>>;
  onExport: (
    format: ExportFormat,
    dataTypes: ExportCsvEntity[],
    template?: boolean,
  ) => void;
  onRequestApply: (preview: ImportCatalogPreview) => void;
  onCancelApply: () => void;
  onConfirmApply: (preview: ImportCatalogPreview) => void;
}) {
  const t = useTranslation();
  const [mode, setMode] = useState<"idle" | "import" | "export">("idle");
  const importRequestId = useRef(0);
  const [selectedDataTypes, setSelectedDataTypes] = useState<ExportCsvEntity[]>([
    "videos", "images", "performers", "categories", "glossary",
  ]);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [exportTemplate, setExportTemplate] = useState(false);
  const [exportCounts, setExportCounts] = useState<Partial<Record<ExportCsvEntity, number>> | null>(null);

  async function activateImport() {
    const requestId = ++importRequestId.current;
    const preserveCurrentPreview = mode === "import" && importStatus.state === "preview";
    setMode("import");
    const selected = await onChooseImport();
    if (!selected && importRequestId.current === requestId) {
      setMode((current) => current === "import" && !preserveCurrentPreview ? "idle" : current);
    }
  }

  function activateExport() {
    importRequestId.current += 1;
    setMode("export");
    onResetImport();
    void onLoadExportCounts()
      .then(setExportCounts)
      .catch(() => setExportCounts(null));
  }

  function cancelCurrentMode() {
    importRequestId.current += 1;
    if (mode === "import") {
      onResetImport();
    }
    setMode("idle");
  }

  function toggleDataType(dataType: ExportCsvEntity) {
    setSelectedDataTypes((current) =>
      current.includes(dataType)
        ? current.filter((candidate) => candidate !== dataType)
        : [...current, dataType],
    );
  }

  const selectedRecordCount = exportCounts
    ? selectedDataTypes.reduce((total, dataType) => total + (exportCounts[dataType] ?? 0), 0)
    : null;
  const emptySelectedDataTypes = exportCounts
    ? selectedDataTypes.filter((dataType) => exportCounts[dataType] === 0)
    : [];

  return (
    <div data-testid="import-export-panel">
      <div className="space-y-1 pb-3">
        <ImportExportActionRow
          label={t("settings.importExport.importCatalog")}
          buttonLabel={isImportPending ? t("settings.importExport.reading") : t("settings.importExport.importCatalog")}
          active={mode === "import"}
          disabled={!canImport}
          icon={FileInput}
          onClick={activateImport}
        />
        <ImportExportActionRow
          label={t("settings.importExport.exportCatalog")}
          buttonLabel={isExportPending ? t("settings.importExport.exporting") : t("settings.importExport.exportCatalog")}
          active={mode === "export"}
          disabled={!canExport}
          icon={Download}
          onClick={activateExport}
        />
      </div>

      {mode === "import" ? (
        <CompactImportPreviewPanel
          importStatus={importStatus}
          importApplyStatus={importApplyStatus}
          onChangeFile={() => void activateImport()}
          onPreviewAgain={onRefreshImport}
          onCancel={cancelCurrentMode}
          onRequestApply={onRequestApply}
          onCancelApply={onCancelApply}
          onConfirmApply={onConfirmApply}
        />
      ) : mode === "export" ? (
        <div aria-label={t("settings.importExport.exportMode")} className="pt-5">
          <h3 className="text-sm font-semibold text-slate-900">{t("settings.importExport.selectSections")}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(["videos", "images", "performers", "categories", "glossary"] as ExportCsvEntity[]).map((dataType) => (
              <ExportSelectionCard key={dataType} dataType={dataType} selected={selectedDataTypes.includes(dataType)} onToggle={() => toggleDataType(dataType)} />
            ))}
          </div>

          <h3 className="mt-6 text-sm font-semibold text-slate-900">{t("settings.importExport.chooseFormat")}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ExportFormatCard format="xlsx" selected={format === "xlsx"} badge={t("settings.importExport.recommended")} onSelect={() => setFormat("xlsx")} />
            <ExportFormatCard format="csv" selected={format === "csv"} badge={t("settings.importExport.compatibility")} onSelect={() => setFormat("csv")} />
          </div>

          <div className="mt-4">
            <SakuravaCheckbox
              label={t("settings.importExport.exportAsTemplate")}
              checked={exportTemplate}
              onChange={setExportTemplate}
              icon={FileText}
              variant="row"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-sakura-100 bg-sakura-50/40 px-4 py-3 text-sm text-slate-600">
            <FileText className="text-sakura-500" size={19} />
            <span className="font-semibold text-slate-900">{t("settings.importExport.summary")}</span>
            <span>{t("settings.importExport.sectionsSelected", { count: String(selectedDataTypes.length) })}</span>
            <span aria-hidden="true" className="size-1 rounded-full bg-slate-300" />
            <span>{t("settings.importExport.formatSummary", { format: format.toUpperCase() })}</span>
            {exportTemplate ? <><span aria-hidden="true" className="size-1 rounded-full bg-slate-300" /><span>{t("settings.importExport.templateLabel")}</span></> : selectedRecordCount !== null ? <><span aria-hidden="true" className="size-1 rounded-full bg-slate-300" /><span>{t("settings.importExport.recordsSelected", { count: String(selectedRecordCount) })}</span></> : null}
          </div>

          {!exportTemplate && emptySelectedDataTypes.length > 0 ? <p role="status" className="mt-2 text-xs font-semibold text-amber-700">{t("settings.importExport.emptySections", { sections: emptySelectedDataTypes.map((dataType) => t(`settings.importExport.section.${dataType}`)).join(", ") })}</p> : null}

          <div className="mt-4 flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button type="button" onClick={cancelCurrentMode} className="h-10 min-w-28 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">{t("common.cancel")}</button>
            <button type="button" disabled={selectedDataTypes.length === 0 || (!exportTemplate && emptySelectedDataTypes.length > 0) || !canExport} onClick={() => onExport(format, selectedDataTypes, exportTemplate)} className="h-10 min-w-36 rounded-lg bg-sakura-500 px-4 text-sm font-semibold text-white hover:bg-sakura-600 disabled:bg-slate-200 disabled:text-slate-400">
              {t("settings.importExport.exportSelected")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ImportExportActionRow({ label, buttonLabel, active, disabled, icon: Icon, onClick }: { label: string; buttonLabel: string; active: boolean; disabled: boolean; icon: LucideIcon; onClick: () => void }) {
  return <div className="flex min-h-16 items-center justify-between gap-4 py-2"><span className="text-sm font-semibold text-slate-800">{label}</span><button type="button" aria-pressed={active} disabled={disabled} onClick={onClick} className={`inline-flex h-10 w-56 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition ${active ? "border-sakura-500 bg-sakura-500 text-white shadow-sm hover:bg-sakura-600" : "border-slate-200 bg-white text-slate-600 hover:border-sakura-200 hover:bg-sakura-50"} disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}><Icon size={17} />{buttonLabel}</button></div>;
}

function CatalogReferenceBoundary({
  status,
  validationFailed,
  onRetry,
  onOpenRecovery,
}: {
  status: SakuravaRefMigrationStatus | null;
  validationFailed: boolean;
  onRetry: () => void;
  onOpenRecovery: () => void;
}) {
  const t = useTranslation();
  const state = validationFailed ? "invalid" : status?.state ?? "checking";
  if (state === "legacy") {
    const count = Object.values(status?.counts ?? {}).reduce((sum, value) => sum + value, 0);
    return <div role="status" className="rounded-xl border border-sakura-100 bg-sakura-50/50 px-4 py-3"><p className="text-sm font-semibold text-slate-700">{t("migration.ref.body", { count: String(count) })}</p><button type="button" onClick={() => window.dispatchEvent(new Event("sakurava-ref-upgrade-requested"))} className="mt-3 h-9 rounded-lg bg-sakura-500 px-4 text-xs font-semibold text-white hover:bg-sakura-600">{t("migration.ref.confirm")}</button></div>;
  }
  if (state === "checking") {
    return <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">{t("migration.ref.validatingBody")}</p>;
  }
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"><p className="text-sm font-semibold text-rose-800">{t("migration.ref.recoveryTitle")}</p><p className="mt-1 text-xs text-rose-700">{t("migration.ref.recoveryBody")}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={onRetry} className="h-9 rounded-lg bg-sakura-500 px-4 text-xs font-semibold text-white">{t("migration.ref.retryValidation")}</button><button type="button" onClick={onOpenRecovery} className="h-9 rounded-lg border border-rose-200 bg-white px-4 text-xs font-semibold text-rose-700">{t("migration.ref.openRecovery")}</button></div></div>;
}

function ExportSelectionCard({ dataType, selected, onToggle }: { dataType: ExportCsvEntity; selected: boolean; onToggle: () => void }) {
  const t = useTranslation();
  const Icon = dataType === "videos" ? Video : dataType === "images" ? ImageIcon : dataType === "performers" ? UserRound : dataType === "glossary" ? FileText : Tag;
  const label = t(`settings.importExport.section.${dataType}`);
  return <SakuravaCheckbox label={label} checked={selected} onChange={onToggle} icon={Icon} variant="card" />;
}

function SakuravaCheckbox({
  label,
  checked,
  onChange,
  icon: Icon,
  variant,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: LucideIcon;
  variant: "card" | "row";
}) {
  return (
    <label data-sakurava-checkbox="true" className={`group flex cursor-pointer items-center gap-3 rounded-xl border text-left transition hover:border-sakura-300 ${variant === "card" ? "min-h-16 px-3" : "h-11 px-4"} ${checked ? "border-sakura-300 bg-sakura-50/60 text-sakura-600" : "border-slate-200 bg-white text-slate-600"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-lg ${variant === "card" ? "size-9 bg-white" : "size-7 bg-slate-50"}`}><Icon size={variant === "card" ? 19 : 17} /></span>
      <span className="text-sm font-semibold text-slate-900">{label}</span>
      <span aria-hidden="true" className={`ml-auto flex size-4 shrink-0 items-center justify-center rounded border transition peer-focus-visible:ring-2 peer-focus-visible:ring-sakura-300 peer-focus-visible:ring-offset-2 ${checked ? "border-sakura-500 bg-sakura-500 text-white" : "border-slate-300 bg-white group-hover:border-sakura-400"}`}>{checked ? <Check size={12} strokeWidth={3} /> : null}</span>
    </label>
  );
}

function ExportFormatCard({ format, selected, badge, onSelect }: { format: ExportFormat; selected: boolean; badge: string; onSelect: () => void }) {
  return <label className={`group flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border px-4 text-left transition hover:border-sakura-300 ${selected ? "border-sakura-300 bg-sakura-50/50" : "border-slate-200 bg-white"}`}><input type="radio" name="catalog-export-format" value={format} checked={selected} onChange={onSelect} className="peer sr-only" /><span aria-hidden="true" className={`flex size-5 items-center justify-center rounded-full border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-sakura-300 peer-focus-visible:ring-offset-2 ${selected ? "border-sakura-500" : "border-slate-300"}`}>{selected ? <span className="size-2.5 rounded-full bg-sakura-500" /> : null}</span><span className="font-semibold text-slate-900">{format.toUpperCase()}</span><span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${format === "xlsx" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-sky-50 text-sky-700 ring-1 ring-sky-200"}`}>{badge}</span></label>;
}

function CompactImportPreviewPanel({
  importStatus,
  importApplyStatus,
  onChangeFile,
  onPreviewAgain,
  onCancel,
  onRequestApply,
  onCancelApply,
  onConfirmApply,
}: {
  importStatus: ImportStatus;
  importApplyStatus: ImportApplyStatus;
  onChangeFile: () => void;
  onPreviewAgain: () => void;
  onCancel: () => void;
  onRequestApply: (preview: ImportCatalogPreview) => void;
  onCancelApply: () => void;
  onConfirmApply: (preview: ImportCatalogPreview) => void;
}) {
  const t = useTranslation();
  const [filter, setFilter] = useState<"all" | "add" | "update" | "delete" | "warning">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(32);
  const [selectedRowKey, setSelectedRowKey] = useState("");

  useEffect(() => setPage(1), [filter, search, importStatus, pageSize]);
  useEffect(() => {
    if (importStatus.state !== "preview") return;
    setFilter("all");
    setSelectedRowKey("");
  }, [importStatus]);
  if (importStatus.state === "idle") return null;
  if (importStatus.state === "pending") return <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">{t("settings.importExport.reading")}</p>;
  if (importStatus.state === "error") return <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{importStatus.message}</p>;

  const { preview } = importStatus;
  const lowerSearch = search.trim().toLowerCase();
  const filteredRows = preview.rows.filter((row) => {
    const filterMatch = filter === "all"
      || (filter === "add" && row.detectedResult === "Added")
      || (filter === "update" && row.detectedResult === "Modified")
      || (filter === "delete" && row.detectedResult === "Deleted")
      || (filter === "warning" && (row.errors.length > 0 || row.warnings.length > 0 || Boolean(row.dependencyPlan?.requiresDecision)));
    const searchMatch = !lowerSearch || `${row.dataType} ${row.target} ${row.action} ${row.errors.join(" ")} ${row.warnings.join(" ")}`.toLowerCase().includes(lowerSearch);
    return filterMatch && searchMatch;
  });
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const applicableRows = preview.sections.reduce((total, section) => total + countApplicableImportRows(section.preview), 0);
  const isApplyPending = importApplyStatus.state === "pending";
  const canApply = !preview.summary.blocked && applicableRows > 0 && !isApplyPending;
  const counts = { all: preview.summary.totalRows, add: preview.summary.create, update: preview.summary.update, delete: preview.summary.delete, warning: preview.summary.needsAttention };
  const selectedRow = preview.rows.find(
    (row) => `${row.sheetName}-${row.rowNumber}` === selectedRowKey,
  );

  return <div aria-label={t("settings.import.preview")} className="pt-5">
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <span className="flex size-11 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500"><FileText size={21} /></span>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{importStatus.displayName}</p><p className="mt-1 text-xs font-medium text-slate-500">{importStatus.format.toUpperCase()} <span className="px-1.5">•</span> {preview.summary.totalRows} {t("settings.importExport.rows")}</p></div>
      <span className="h-9 w-px bg-slate-200" /><button type="button" disabled={isApplyPending} onClick={onChangeFile} className="text-sm font-semibold text-sakura-600 hover:text-sakura-700 disabled:text-slate-300">{t("settings.importExport.changeFile")}</button>
    </div>

    {(preview.headerErrors.length > 0 || preview.headerWarnings.length > 0) ? <div className="mt-3 grid gap-1 text-xs font-semibold">{preview.headerErrors.map((message) => <p key={message} className="text-rose-700">{message}</p>)}{preview.headerWarnings.map((message) => <p key={message} className="text-amber-700">{message}</p>)}</div> : null}

    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div role="tablist" aria-label={t("settings.importExport.filters")} className="flex flex-wrap overflow-hidden rounded-lg border border-slate-200 bg-white">{(["all", "add", "update", "delete", "warning"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={`px-3 py-2 text-xs font-semibold ${filter === value ? "bg-sakura-50 text-sakura-600" : "text-slate-600 hover:bg-slate-50"}`}>{t(`settings.importExport.filter.${value}`)} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{counts[value]}</span></button>)}</div>
      <label className="relative block lg:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("settings.importExport.searchRows")} aria-label={t("settings.importExport.searchRows")} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-sakura-300" /></label>
    </div>

    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
      <div className="max-h-[23rem] overflow-auto">
        <table className="w-full table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
            <tr>{["row", "section", "ref", "record", "action", "details"].map((key) => <th key={key} className={`px-3 py-3 font-semibold ${key === "row" ? "w-14" : key === "section" ? "w-28" : key === "ref" ? "w-32" : key === "action" ? "w-24" : key === "record" ? "w-48" : ""}`}>{t(`settings.importExport.table.${key}`)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{pageRows.map((row) => {
            const rowKey = `${row.sheetName}-${row.rowNumber}`;
            const warning = row.errors.length > 0 || row.warnings.length > 0 || Boolean(row.dependencyPlan?.requiresDecision);
            return <tr key={rowKey} className={warning ? "bg-amber-50/60" : selectedRowKey === rowKey ? "bg-sakura-50/40" : "bg-white"}>
              <td className="px-3 py-2.5 font-semibold text-slate-600">{row.rowNumber}</td>
              <td className="px-3 py-2.5 text-slate-600">{t(`settings.importExport.section.${row.dataType}`)}</td>
              <td className="px-3 py-2.5 font-mono tabular-nums text-slate-700"><span className="block truncate" title={row.values["Sakurava Ref"] || t("settings.importExport.generatedRef")}>{row.values["Sakurava Ref"] || "—"}</span></td>
              <td className="px-3 py-2.5"><span className="block truncate font-medium text-slate-800" title={row.target}>{row.target}</span></td>
              <td className="px-3 py-2.5 text-slate-600">{row.detectedResult === "Added" || row.detectedResult === "Modified" || row.detectedResult === "Deleted" ? <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">{row.detectedResult === "Added" ? t("settings.importExport.filter.add") : row.detectedResult === "Modified" ? t("settings.importExport.filter.update") : t("settings.importExport.filter.delete")}</span> : "—"}</td>
              <td className="import-details-cell px-3 py-2.5">
                <button type="button" aria-expanded={selectedRowKey === rowKey} onClick={() => setSelectedRowKey((current) => current === rowKey ? "" : rowKey)} className="block w-full truncate text-left text-slate-600 outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-sakura-300" title={getImportRowDetailsTitle(row, t)}>
                  <span className="import-details-responsive" data-summary-narrow={getImportRowDetails(row, t, 1)} data-summary-medium={getImportRowDetails(row, t, 2)} data-summary-wide={getImportRowDetails(row, t, 3)}>{getImportRowDetails(row, t, 3)}</span>
                </button>
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {selectedRow ? <ImportRowComparisonDetail row={selectedRow} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs font-medium text-slate-500"><div className="flex flex-wrap items-center gap-3"><span>{t("settings.importExport.showing", { start: filteredRows.length === 0 ? "0" : String((page - 1) * pageSize + 1), end: String(Math.min(page * pageSize, filteredRows.length)), total: String(filteredRows.length) })}</span><label className="flex items-center gap-2">{t("settings.backup.history.pageSize")}<select aria-label={t("settings.backup.history.pageSize")} value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600"><option value={32}>32</option><option value={64}>64</option><option value={128}>128</option><option value={256}>256</option></select></label></div><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:text-slate-300">{t("common.previous")}</button><span className="flex size-8 items-center justify-center rounded-lg bg-sakura-500 font-semibold text-white">{page}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:text-slate-300">{t("common.next")}</button></div></div>
    </div>

    {importApplyStatus.state === "confirming" ? <ImportApplyConfirmPanel preview={importApplyStatus.preview} onCancelApply={onCancelApply} onConfirmApply={() => onConfirmApply(importApplyStatus.preview)} /> : null}
    {importApplyStatus.state === "error" ? <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"><span>{importApplyStatus.message}</span>{importApplyStatus.failureStage === "stalePreview" ? <button type="button" onClick={onPreviewAgain} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100">{t("settings.importExport.previewAgain")}</button> : null}</div> : null}
    <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4"><button type="button" disabled={isApplyPending} onClick={onCancel} className="h-10 min-w-28 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 disabled:bg-slate-100 disabled:text-slate-300">{t("common.cancel")}</button><button type="button" disabled={!canApply} onClick={() => onRequestApply(preview)} className="h-10 min-w-36 rounded-lg bg-sakura-500 px-4 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400">{t("settings.importExport.applyImport")}</button></div>
  </div>;
}

function ImportApplyConfirmPanel({
  preview,
  onCancelApply,
  onConfirmApply,
}: {
  preview: ImportCsvPreview | ImportCatalogPreview;
  onCancelApply: () => void;
  onConfirmApply: () => void;
}) {
  const t = useTranslation();
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const summary = "create" in preview.summary
    ? {
        added: preview.summary.create,
        modified: preview.summary.update,
        deleted: preview.summary.delete,
        warnings: preview.summary.needsAttention,
      }
    : preview.summary;

  const totalCatalogRows = "totalRows" in preview.summary ? preview.summary.totalRows : summary.added + summary.modified + summary.deleted;
  const critical = summary.deleted > 0 && (summary.deleted >= Math.max(10, Math.ceil(totalCatalogRows * 0.5)) || summary.deleted === totalCatalogRows);

  function confirmOnce() {
    if (!acknowledged) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    onConfirmApply();
  }

  return createPortal(
    <ConfirmDialog
      open
      title={t("settings.import.confirmApply")}
      description={<><dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm text-slate-700"><dt>{t("settings.importExport.filter.add")}</dt><dd>{summary.added}</dd><dt>{t("settings.importExport.filter.update")}</dt><dd>{summary.modified}</dd><dt>{t("settings.importExport.filter.delete")}</dt><dd>{summary.deleted}</dd><dt>{t("settings.importExport.filter.warning")}</dt><dd>{summary.warnings}</dd></dl><p className="mt-3 text-xs text-slate-500">{t("settings.import.confirmApplySafety")}</p><label className={`mt-4 flex gap-2 rounded-lg border p-3 text-xs font-semibold ${critical ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5" />{critical ? t("settings.import.confirmApplyDelete", { count: String(summary.deleted) }) : t("settings.import.confirmApplyAcknowledge")}</label></>}
      confirmLabel={t("settings.import.confirmApplyAction")}
      cancelLabel={t("common.cancel")}
      pending={submitting}
      confirmDisabled={!acknowledged}
      onCancel={onCancelApply}
      onConfirm={confirmOnce}
    />,
    document.body,
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

function getImportRowDetails(
  row: ImportPreviewRow,
  t?: (key: string, replacements?: Record<string, string>) => string,
  maxFieldLabels = 3,
) {
  if (row.dependencyPlan?.detail) {
    return row.dependencyPlan.detail;
  }

  if (row.detectedResult === "Deleted") {
    return t?.("settings.importExport.details.delete") ?? "Record will be deleted";
  }
  if (row.errors.length > 0) {
    return friendlyImportIssue(row.errors[0], t);
  }
  if (row.warnings.length > 0) {
    return friendlyImportIssue(row.warnings[0], t);
  }
  if (row.detectedResult === "Added") {
    return t?.("settings.importExport.details.create") ?? "New record will be added";
  }
  if (row.detectedResult === "Modified") {
    const detail = row.changeDetails?.length === 1 ? row.changeDetails[0] : undefined;
    if (detail?.cleared) {
      return t?.("settings.importExport.details.clearValue", {
        field: humanizeImportField(detail.field, t),
      }) ?? `${humanizeImportField(detail.field, t)} will be cleared`;
    }
    if (detail && canShowImportValueChange(detail)) {
      return t?.("settings.importExport.details.changeValue", {
        field: humanizeImportField(detail.field, t),
        before: detail.before,
        after: detail.after,
      }) ?? `${humanizeImportField(detail.field, t)} changes from “${detail.before}” to “${detail.after}”`;
    }
    const fields = importChangedFieldLabels(row, t);
    if (fields.length === 1) return t?.("settings.importExport.details.updateField", { field: fields[0] }) ?? `${fields[0]} will be updated`;
    const visible = fields.slice(0, maxFieldLabels);
    const remaining = Math.max(0, fields.length - visible.length);
    const fieldSummary = `${visible.join(", ")}${remaining > 0 ? `, … +${remaining}` : ""}`;
    return t?.("settings.importExport.details.updateFieldsNamed", {
      count: String(fields.length),
      fields: fieldSummary,
    }) ?? `${fields.length} fields (${fieldSummary}) will change`;
  }
  if (row.detectedResult === "Unchanged") {
    return t?.("settings.importExport.details.noChanges") ?? "No changes";
  }
  if (row.detectedResult === "Skipped") {
    return t?.("settings.importExport.details.skip") ?? "Row will be skipped";
  }
  return t?.("settings.importExport.details.review") ?? "Review this row";
}

function canShowImportValueChange(detail: { field: string; before: string; after: string }) {
  if (/path|url|definition|notes?/i.test(detail.field)) return false;
  return detail.before.length <= 40 && detail.after.length <= 40;
}

function getImportRowDetailsTitle(
  row: ImportPreviewRow,
  t?: (key: string, replacements?: Record<string, string>) => string,
) {
  if (row.dependencyPlan?.detail) return row.dependencyPlan.detail;
  if (row.detectedResult === "Deleted") {
    return "Will delete catalog record only. Original media files are not deleted.";
  }
  if (row.changeDetails?.length) {
    return row.changeDetails.map((detail) => detail.cleared
      ? `${humanizeImportField(detail.field, t)}: ${t?.("settings.importExport.details.cleared") ?? "Cleared"}`
      : `${humanizeImportField(detail.field, t)}: ${detail.before || "—"} → ${detail.after || "—"}`)
      .join("; ");
  }
  return getImportRowDetails(row, t, Number.MAX_SAFE_INTEGER);
}

function importChangedFieldLabels(
  row: ImportPreviewRow,
  t?: (key: string, replacements?: Record<string, string>) => string,
) {
  const source = row.changeDetails?.length
    ? row.changeDetails.map((detail) => detail.field)
    : row.changes;
  return Array.from(new Set(source.map((field) => humanizeImportField(field, t))));
}

function humanizeImportField(
  field: string,
  t?: (key: string, replacements?: Record<string, string>) => string,
) {
  const normalized = field
    .replace(/^Categories [+-].*$/, "Categories")
    .replace(/^Related (Videos|Images|Performers) [+-].*$/, "Related records");
  const key = importFieldTranslationKeys[normalized];
  return key && t ? t(key) : normalized;
}

const importFieldTranslationKeys: Record<string, string> = {
  Title: "settings.importExport.field.title",
  "Original Title": "settings.importExport.field.originalTitle",
  Code: "settings.importExport.field.code",
  Name: "settings.importExport.field.name",
  "Original Name": "settings.importExport.field.originalName",
  Term: "settings.importExport.field.term",
  Definition: "settings.importExport.field.definition",
  "Category Name": "settings.importExport.field.categoryName",
  Categories: "settings.importExport.field.categories",
  "Related records": "settings.importExport.field.relatedRecords",
  Favorite: "settings.importExport.field.favorite",
  Availability: "settings.importExport.field.availability",
  Censorship: "settings.importExport.field.censorship",
  "Release Date": "settings.importExport.field.releaseDate",
  "Birth Date": "settings.importExport.field.birthDate",
  "Debut Date": "settings.importExport.field.debutDate",
  "Retired Date": "settings.importExport.field.retiredDate",
  Description: "settings.importExport.field.description",
  Notes: "settings.importExport.field.notes",
  "Source Links": "settings.importExport.field.sourceLinks",
};

function friendlyImportIssue(
  message: string,
  t?: (key: string, replacements?: Record<string, string>) => string,
) {
  const category = message.match(/^Unknown category:\s*(.+?)\.?$/i);
  if (category) return `Category “${category[1]}” is not available`;
  if (/valid date|date format/i.test(message)) return t?.("settings.importExport.details.invalidDate") ?? "Date is not valid for this computer";
  if (/^Unknown Action:/i.test(message)) return "Choose Auto, Create, Update, Delete, or Skip";
  if (/Sakurava Ref was not found/i.test(message)) return t?.("settings.importExport.details.idNotFound") ?? "Record ID was not found";
  if (/Duplicate Sakurava Ref/i.test(message)) return "This Sakurava record appears more than once";
  if (/must start with|Sakurava Ref is not valid/i.test(message)) return "The Sakurava record reference is not valid";
  if (/must be a number|must be numeric/i.test(message)) return "Enter a valid number";
  if (/required header/i.test(message)) return "A required column is missing";
  const required = message.match(/^(.+?) is required for a new row\.?$/i);
  if (required) return t?.("settings.importExport.details.requiredMissing", { field: humanizeImportField(required[1]).toLowerCase() }) ?? `Required ${humanizeImportField(required[1]).toLowerCase()} is missing`;
  if (/Favorite must/i.test(message)) return t?.("settings.importExport.details.invalidFavorite") ?? "Favorite must be true or false";
  if (/Parent Ref must be/i.test(message)) return t?.("settings.importExport.details.invalidParentId") ?? "Parent Glossary ID is not valid";
  if (/Glossary entry cannot be its own parent/i.test(message)) return t?.("settings.importExport.details.selfParent") ?? "A Glossary record cannot be its own parent";
  if (/Glossary parent was not found/i.test(message)) return t?.("settings.importExport.details.parentNotFound") ?? "Parent Glossary record was not found";
  return message;
}

function ImportRowComparisonDetail({ row }: { row: ImportPreviewRow }) {
  const t = useTranslation();
  const comparisons = row.changeDetails ?? [];
  return (
    <section
      aria-label={t("settings.importExport.rowDetails")}
      className="border-t border-slate-200 bg-slate-50/70 px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h4 className="truncate text-xs font-semibold text-slate-800" title={row.target}>
          {row.target}
        </h4>
        <span className="text-[11px] font-semibold text-slate-500">
          {t("settings.importExport.rowNumber", { row: String(row.rowNumber) })}
        </span>
      </div>
      {comparisons.length > 0 ? (
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {comparisons.map((detail) => (
            <div key={`${detail.field}-${detail.before}-${detail.after}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <dt className="text-[11px] font-semibold text-slate-500">
                {humanizeImportField(detail.field, t)}
              </dt>
              <dd className="mt-1 break-words text-xs text-slate-700">
                {detail.cleared
                  ? t("settings.importExport.details.valueWillBeCleared")
                  : <><span>{detail.before || "—"}</span><span aria-hidden="true" className="px-1.5 text-slate-400">→</span><span>{detail.after || "—"}</span></>}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-slate-600">{getImportRowDetails(row, t)}</p>
      )}
      {[...row.errors, ...row.warnings].length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-rose-700">
          {[...row.errors, ...row.warnings].map((message) => (
            <li key={message}>{friendlyImportIssue(message, t)}</li>
          ))}
        </ul>
      ) : null}
    </section>
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

function BackupSummaryCard({
  icon,
  label,
  value,
  badge,
  action,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  badge?: string;
  action?: ReactNode;
}) {
  const Icon = icon;
  return (
    <div className="flex min-h-28 gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500">
        <Icon size={19} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</p>
        {badge ? (
          <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={13} aria-hidden="true" />
            {badge}
          </span>
        ) : null}
        {action}
      </div>
    </div>
  );
}

function BackupHistoryPanel({
  packages, page, pageSize, busy, restoreStatus, managementStatus,
  selectedPackageName, restoreConfirmationOpen, toasts, onRefresh, onPageChange,
  onPageSizeChange, onSelect, onRestore, onDownload, onDelete,
  onCancelDelete, onConfirmDelete, onCancelRestore, onConfirmRestore, onDone, onDismissToast,
}: {
  packages: BackupPackageInfo[]; page: number; pageSize: number; busy: boolean;
  restoreStatus: RestoreStatus; managementStatus: BackupPackageManagementStatus;
  selectedPackageName: string | null; restoreConfirmationOpen: boolean; toasts: BackupToast[];
  onRefresh: () => void; onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSelect: (packageName: string) => void; onRestore: (packageName: string) => void;
  onDownload: (backupPackage: BackupPackageInfo) => void;
  onDelete: (backupPackage: BackupPackageInfo) => void;
  onCancelDelete: () => void; onConfirmDelete: () => void;
  onCancelRestore: () => void; onConfirmRestore: () => void; onDone: () => void; onDismissToast: (id: number) => void;
}) {
  const t = useTranslation();
  const [openMenu, setOpenMenu] = useState<{
    backupPackage: BackupPackageInfo;
    left: number;
    top: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pageCount = Math.max(1, Math.ceil(packages.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = (currentPage - 1) * pageSize;
  const visiblePackages = packages.slice(startIndex, startIndex + pageSize);
  const selectedPackage = packages.find((item) => item.packageName === selectedPackageName);
  const preview = restoreStatus.state === "confirming" || restoreStatus.state === "pending"
    ? restoreStatus.preview : null;

  function closeMenu(restoreFocus = true) {
    setOpenMenu(null);
    if (restoreFocus) menuTriggerRef.current?.focus();
  }

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !menuTriggerRef.current?.contains(target)) {
        closeMenu();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    const onViewportChange = () => closeMenu(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [openMenu]);

  return <>
    <section aria-label={t("settings.backup.history.title")} className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex h-11 items-center justify-between border-b border-slate-200 px-4">
        <h3 className="text-sm font-semibold text-slate-900">{t("settings.backup.history.title")}</h3>
        <button type="button" aria-label={t("settings.backup.history.refresh")} disabled={busy} onClick={onRefresh} className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-sakura-600 disabled:text-slate-300"><RefreshCw size={15} aria-hidden="true" /></button>
      </header>
      <div className="max-h-[25rem] overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-50"><tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="w-12 px-4 py-3"><span className="sr-only">{t("settings.backup.history.selection")}</span></th>
            <th className="px-3 py-3">{t("settings.backup.history.dateTime")}</th><th className="px-3 py-3">{t("settings.backup.history.size")}</th><th className="px-3 py-3">{t("settings.backup.history.type")}</th><th className="px-3 py-3">{t("settings.backup.history.status")}</th><th className="px-3 py-3 text-right">{t("settings.backup.history.actions")}</th>
          </tr></thead>
          <tbody>{visiblePackages.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm font-medium text-slate-400">{t("settings.backup.list.empty")}</td></tr> : visiblePackages.map((item) => {
            const selected = item.packageName === selectedPackageName;
            return <tr key={item.packageName} aria-selected={selected} onClick={() => !busy && onSelect(item.packageName)} className={`cursor-pointer border-b border-slate-100 text-sm last:border-b-0 ${selected ? "bg-sakura-50/70" : "text-slate-600 hover:bg-slate-50"}`}>
              <td className="px-4 py-3"><span className={`block size-3 rounded-full border ${selected ? "border-sakura-500 bg-sakura-500 ring-2 ring-sakura-100" : "border-slate-300"}`} /></td>
              <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-700">{formatBackupCreatedAt(item.manifest.createdAt)}</td>
              <td className="px-3 py-3 text-slate-400">—</td>
              <td className="px-3 py-3">{t(item.manifest.backupType === "automatic" ? "settings.backup.type.automatic" : "settings.backup.type.manual")}</td>
              <td className="px-3 py-3"><span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={13} aria-hidden="true" />{t("settings.backup.status.success")}</span></td>
              <td className="relative px-3 py-3" onClick={(event) => event.stopPropagation()}><div className="flex justify-end gap-1">
                <button type="button" aria-label={`${t("settings.backup.history.view")} ${item.packageName}`} disabled={busy} onClick={() => onSelect(item.packageName)} className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-sakura-600"><Eye size={15} aria-hidden="true" /></button>
                <button type="button" aria-label={`${t("settings.backup.history.more")} ${item.packageName}`} aria-expanded={openMenu?.backupPackage.packageName === item.packageName} disabled={busy} onClick={(event) => {
                  const trigger = event.currentTarget;
                  if (openMenu?.backupPackage.packageName === item.packageName) {
                    closeMenu(false);
                    return;
                  }
                  const rect = trigger.getBoundingClientRect();
                  menuTriggerRef.current = trigger;
                  setOpenMenu({
                    backupPackage: item,
                    left: Math.max(8, Math.min(rect.right - 176, window.innerWidth - 184)),
                    top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 148)),
                  });
                }} className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><MoreHorizontal size={17} aria-hidden="true" /></button>
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <footer className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-xs font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-2"><span>{t("settings.backup.history.showing", { start: packages.length ? String(startIndex + 1) : "0", end: String(Math.min(startIndex + visiblePackages.length, packages.length)), total: String(packages.length) })}</span><label className="flex items-center gap-2">{t("settings.backup.history.pageSize")}<select aria-label={t("settings.backup.history.pageSize")} value={pageSize} onChange={(event) => { onPageSizeChange(Number(event.target.value)); onPageChange(1); }} className="h-8 rounded-lg border border-slate-200 bg-white px-2"><option value={16}>16</option><option value={32}>32</option><option value={64}>64</option></select></label></div><div className="flex items-center gap-1"><button type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="h-8 rounded-lg border border-slate-200 px-3 disabled:text-slate-300">{t("common.previous")}</button><span className="inline-flex size-8 items-center justify-center rounded-lg bg-sakura-500 text-white">{currentPage}</span><button type="button" disabled={currentPage >= pageCount} onClick={() => onPageChange(currentPage + 1)} className="h-8 rounded-lg border border-slate-200 px-3 disabled:text-slate-300">{t("common.next")}</button></div></footer>
      {managementStatus.state === "error" ? <p role="alert" className="border-t border-slate-100 px-4 py-3 text-sm font-semibold text-rose-600">{managementStatus.message}</p> : null}
      {restoreStatus.state === "previewPending" ? <p role="status" className="border-t border-slate-100 px-4 py-3 text-sm font-semibold text-slate-600">{t("settings.backup.validating")}</p> : restoreStatus.state === "importPending" ? <p role="status" className="border-t border-slate-100 px-4 py-3 text-sm font-semibold text-slate-600">{t("settings.backup.importSelected.importing")}</p> : restoreStatus.state === "error" ? <p role="alert" className="border-t border-slate-100 px-4 py-3 text-sm font-semibold text-rose-600">{restoreStatus.message}</p> : null}
    </section>
    {openMenu && typeof document !== "undefined" ? createPortal(
      <div ref={menuRef} data-backup-actions-menu="true" role="menu" aria-label={t("settings.backup.history.actions")} className="fixed z-[110] w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl" style={{ left: openMenu.left, top: openMenu.top }}>
        <button type="button" role="menuitem" onClick={() => { const item = openMenu.backupPackage; closeMenu(false); void onRestore(item.packageName); }} className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-semibold text-slate-600 hover:bg-slate-50"><RotateCcw size={14} aria-hidden="true" />{t("settings.backup.history.restore")}</button>
        <button type="button" role="menuitem" onClick={() => { const item = openMenu.backupPackage; closeMenu(false); onDownload(item); }} className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} aria-hidden="true" />{t("settings.backup.history.download")}</button>
        <button type="button" role="menuitem" onClick={() => { const item = openMenu.backupPackage; closeMenu(false); onDelete(item); }} className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 size={14} aria-hidden="true" />{t("settings.backup.history.delete")}</button>
      </div>,
      document.body,
    ) : null}
    {preview && selectedPackage && restoreStatus.state !== "success" ? <BackupPreviewCard backupPackage={selectedPackage} preview={preview} busy={busy} onDownload={() => onDownload(selectedPackage)} onDelete={() => onDelete(selectedPackage)} onRestore={() => onRestore(selectedPackage.packageName)} /> : null}
    {restoreStatus.state === "success" ? <RestoreSummaryCard status={restoreStatus} onDone={onDone} /> : null}
    {(managementStatus.state === "deleteConfirm" || managementStatus.state === "deletePending") ? <BackupDeleteModal backupPackage={managementStatus.backupPackage} pending={managementStatus.state === "deletePending"} onCancel={onCancelDelete} onConfirm={onConfirmDelete} /> : null}
  {restoreConfirmationOpen && (restoreStatus.state === "confirming" || restoreStatus.state === "pending") ? <RestoreConfirmModal preview={restoreStatus.preview} pending={restoreStatus.state === "pending"} onCancel={onCancelRestore} onConfirm={onConfirmRestore} /> : null}
    <BackupToastViewport toasts={toasts} onDismiss={onDismissToast} />
  </>;
}

function BackupPreviewCard({ backupPackage, preview, busy, onDownload, onDelete, onRestore }: { backupPackage: BackupPackageInfo; preview: BackupPackagePreview; busy: boolean; onDownload: () => void; onDelete: () => void; onRestore: () => void }) {
  const t = useTranslation();
  return <section aria-label={t("settings.backup.preview.title")} className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-sm font-semibold text-slate-900">{t("settings.backup.preview.title")}</h3><dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6"><PreviewField label={t("settings.backup.preview.name")} value={preview.packageName} /><PreviewField label={t("settings.backup.history.dateTime")} value={formatBackupCreatedAt(preview.manifest.createdAt)} /><PreviewField label={t("settings.backup.history.size")} value="—" /><PreviewField label={t("settings.backup.history.type")} value={t(preview.manifest.backupType === "automatic" ? "settings.backup.type.automatic" : "settings.backup.type.manual")} /><PreviewField label={t("settings.backup.history.status")} value={t("settings.backup.status.success")} /><PreviewField label={t("settings.backup.history.note")} value={backupPackage.manifest.note || "—"} /></dl>{preview.warnings.length ? <p className="mt-3 text-xs font-semibold text-amber-700">{preview.warnings[0]}</p> : null}<div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={onDownload} className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-600">{t("settings.backup.history.download")}</button><button type="button" disabled={busy} onClick={onDelete} className="h-9 rounded-lg border border-rose-200 px-4 text-xs font-semibold text-rose-600">{t("settings.backup.management.deleteConfirmAction")}</button><button type="button" disabled={busy} onClick={onRestore} className="h-9 rounded-lg bg-sakura-500 px-5 text-xs font-semibold text-white disabled:bg-slate-300">{t("settings.backup.restoreAction")}</button></div></section>;
}

function PreviewField({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="font-semibold text-slate-500">{label}</dt><dd className="mt-1 truncate font-semibold text-slate-800" title={value}>{value}</dd></div>; }

function BackupToastViewport({ toasts, onDismiss }: { toasts: BackupToast[]; onDismiss: (id: number) => void }) {
  const t = useTranslation();
  if (typeof document === "undefined" || toasts.length === 0) return null;
  return createPortal(
    <div className="pointer-events-none fixed right-5 top-5 z-[120] flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-2">
      {toasts.map((toast) => {
        const isError = toast.tone === "error";
        return <div key={toast.id} role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"} className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${isError ? "border-rose-200 bg-white text-rose-700" : "border-emerald-200 bg-white text-emerald-700"}`}>
          {isError ? <X size={17} className="mt-0.5 shrink-0" aria-hidden="true" /> : <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" />}
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{toast.title}</p>{toast.detail ? <p className="mt-0.5 text-xs font-medium text-slate-500">{toast.detail}</p> : null}</div>
          <button type="button" aria-label={t("settings.backup.toast.close")} onClick={() => onDismiss(toast.id)} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={15} aria-hidden="true" /></button>
        </div>;
      })}
    </div>,
    document.body,
  );
}

function BackupDeleteModal({ backupPackage, pending, onCancel, onConfirm }: { backupPackage: BackupPackageInfo; pending: boolean; onCancel: () => void; onConfirm: () => void }) { const t = useTranslation(); return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-label={t("settings.backup.management.deleteConfirmTitle")} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h3 className="text-base font-semibold text-slate-900">{t("settings.backup.management.deleteConfirmTitle")}</h3><p className="mt-2 text-sm text-slate-600">{t("settings.backup.management.deleteConfirmBodyRefined")}</p><p className="mt-3 text-xs font-semibold text-slate-700">{formatBackupCreatedAt(backupPackage.manifest.createdAt)}</p>{backupPackage.manifest.note ? <p className="mt-1 truncate text-xs text-slate-500">{backupPackage.manifest.note}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" disabled={pending} onClick={onCancel} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600">{t("common.cancel")}</button><button type="button" disabled={pending} onClick={onConfirm} className="h-9 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white disabled:bg-rose-300">{pending ? t("settings.backup.management.deleting") : t("settings.backup.management.deleteConfirmAction")}</button></div></section></div>; }

function RestoreConfirmModal({ preview, pending, onCancel, onConfirm }: { preview: BackupPackagePreview; pending: boolean; onCancel: () => void; onConfirm: () => void }) { const t = useTranslation(); return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-label={t("settings.backup.restoreConfirm.title")} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h3 className="text-base font-semibold text-slate-900">{t("settings.backup.restoreConfirm.title")}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{t("settings.backup.restoreConfirm.bodyRefined")}</p><p className="mt-2 text-xs text-slate-500">{t("settings.backup.restoreConfirm.mediaUnaffectedRefined")}</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={pending} onClick={onCancel} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600">{t("common.cancel")}</button><button type="button" disabled={pending} onClick={onConfirm} className="h-9 rounded-lg bg-sakura-500 px-4 text-sm font-semibold text-white disabled:bg-slate-300">{pending ? t("settings.backup.restoring") : t("settings.backup.restoreAction")}</button></div><span className="sr-only">{preview.packageName}</span></section></div>; }

function RestoreSummaryCard({ status, onDone }: { status: Extract<RestoreStatus, { state: "success" }>; onDone: () => void }) { const t = useTranslation(); return <section aria-label={t("settings.backup.summary.title")} className="mt-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm"><h3 className="text-sm font-semibold text-slate-900">{t("settings.backup.summary.title")}</h3><dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6"><PreviewField label={t("settings.backup.summary.restoredBackup")} value={status.result.restoredPackageName} /><PreviewField label={t("settings.backup.summary.restoredOn")} value={formatBackupCreatedAt(status.result.restoredAt)} /><PreviewField label={t("settings.backup.history.size")} value="—" /><PreviewField label={t("settings.backup.summary.backupType")} value={t(status.preview.manifest.backupType === "automatic" ? "settings.backup.type.automatic" : "settings.backup.type.manual")} /><PreviewField label={t("settings.backup.summary.safetyBackup")} value={status.result.safetyPackageName} /><PreviewField label={t("settings.backup.summary.finalStatus")} value={t("settings.backup.status.success")} /></dl><div className="mt-4 flex items-center justify-between gap-4"><p className="text-sm font-medium text-emerald-700">{t("settings.backup.summary.success")}</p><button type="button" onClick={onDone} className="h-9 rounded-lg bg-sakura-500 px-6 text-sm font-semibold text-white">{t("common.done")}</button></div></section>; }

function LegacyBackupHistoryPanel({
  packages,
  page,
  pageSize,
  busy,
  restoreStatus,
  managementStatus,
  onRefresh,
  onPageChange,
  onPageSizeChange,
  onRestore,
  onDownload,
  onDelete,
  onCancelDelete,
  onConfirmDelete,
  onCancelRestore,
  onConfirmRestore,
}: {
  packages: BackupPackageInfo[];
  page: number;
  pageSize: number;
  busy: boolean;
  restoreStatus: RestoreStatus;
  managementStatus: BackupPackageManagementStatus;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRestore: (packageName: string) => void;
  onDownload: (backupPackage: BackupPackageInfo) => void;
  onDelete: (backupPackage: BackupPackageInfo) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onCancelRestore: () => void;
  onConfirmRestore: () => void;
}) {
  const t = useTranslation();
  const pageCount = Math.max(1, Math.ceil(packages.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = (currentPage - 1) * pageSize;
  const visiblePackages = packages.slice(startIndex, startIndex + pageSize);
  const showingStart = packages.length === 0 ? 0 : startIndex + 1;
  const showingEnd = Math.min(startIndex + visiblePackages.length, packages.length);

  return (
    <section
      aria-label={t("settings.backup.history.title")}
      className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <header className="flex h-12 items-center justify-between border-b border-slate-200 px-4">
        <h3 className="text-sm font-semibold text-slate-900">
          {t("settings.backup.history.title")}
        </h3>
        <button
          type="button"
          aria-label={t("settings.backup.history.refresh")}
          disabled={busy}
          onClick={onRefresh}
          className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-sakura-200 hover:text-sakura-600 disabled:text-slate-300"
        >
          <RefreshCw size={15} aria-hidden="true" />
        </button>
      </header>
      <div className="max-h-[30rem] overflow-auto">
        <table className="min-w-[780px] w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">{t("settings.backup.history.dateTime")}</th>
              <th className="px-3 py-3">{t("settings.backup.history.type")}</th>
              <th className="px-3 py-3">{t("settings.backup.history.status")}</th>
              <th className="px-3 py-3">{t("settings.backup.history.note")}</th>
              <th className="px-3 py-3">{t("settings.backup.history.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {visiblePackages.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm font-medium text-slate-400">
                  {t("settings.backup.list.empty")}
                </td>
              </tr>
            ) : (
              visiblePackages.map((backupPackage) => (
                <tr
                  key={backupPackage.packageName}
                  className="border-b border-slate-100 text-sm text-slate-600 last:border-b-0"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                    {formatBackupCreatedAt(backupPackage.manifest.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${
                      backupPackage.manifest.backupType === "automatic"
                        ? "bg-violet-50 text-violet-600"
                        : "bg-sakura-50 text-sakura-600"
                    }`}>
                      {t(
                        backupPackage.manifest.backupType === "automatic"
                          ? "settings.backup.type.auto"
                          : "settings.backup.type.manual",
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 size={13} aria-hidden="true" />
                      {t("settings.backup.status.success")}
                    </span>
                  </td>
                  <td className="max-w-52 truncate px-3 py-3" title={backupPackage.manifest.note}>
                    {backupPackage.manifest.note || t("common.none")}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRestore(backupPackage.packageName)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition hover:border-sakura-200 hover:text-sakura-600 disabled:text-slate-300"
                      >
                        <RotateCcw size={13} aria-hidden="true" />
                        {t("settings.backup.history.restore")}
                        <span className="sr-only">{backupPackage.packageName}</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDownload(backupPackage)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition hover:border-sakura-200 hover:text-sakura-600 disabled:text-slate-300"
                      >
                        <Download size={13} aria-hidden="true" />
                        {managementStatus.state === "downloadPending" &&
                        managementStatus.packageName === backupPackage.packageName
                          ? t("settings.backup.management.downloading")
                          : t("settings.backup.history.download")}
                        <span className="sr-only">{backupPackage.packageName}</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDelete(backupPackage)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-rose-600 transition hover:border-rose-200 hover:bg-rose-50 disabled:text-slate-300"
                      >
                        <Trash2 size={13} aria-hidden="true" />
                        {t("settings.backup.history.delete")}
                        <span className="sr-only">{backupPackage.packageName}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-xs font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {t("settings.backup.history.showing", {
              start: String(showingStart),
              end: String(showingEnd),
              total: String(packages.length),
            })}
          </span>
          <label className="flex items-center gap-2">
            {t("settings.backup.history.pageSize")}
            <select
              aria-label={t("settings.backup.history.pageSize")}
              value={pageSize}
              onChange={(event) => {
                onPageSizeChange(Number(event.target.value));
                onPageChange(1);
              }}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600"
            >
              {[16, 32, 64].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            {t("settings.backup.history.perPage")}
          </label>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="h-8 rounded-lg border border-slate-200 px-3 disabled:text-slate-300"
          >
            {t("common.previous")}
          </button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              aria-current={pageNumber === currentPage ? "page" : undefined}
              onClick={() => onPageChange(pageNumber)}
              className={`size-8 rounded-lg border text-xs font-semibold ${
                pageNumber === currentPage
                  ? "border-sakura-400 bg-sakura-500 text-white"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            disabled={currentPage >= pageCount}
            onClick={() => onPageChange(currentPage + 1)}
            className="h-8 rounded-lg border border-slate-200 px-3 disabled:text-slate-300"
          >
            {t("common.next")}
          </button>
        </div>
      </footer>
      <div className="space-y-3 px-4 pb-4">
        {managementStatus.state === "success" ? (
          <p role="status" className="text-sm font-semibold text-emerald-700">
            {managementStatus.message}
          </p>
        ) : managementStatus.state === "error" ? (
          <p role="alert" className="text-sm font-semibold text-rose-600">
            {managementStatus.message}
          </p>
        ) : null}
        {managementStatus.state === "deleteConfirm" ||
        managementStatus.state === "deletePending" ? (
          <BackupDeleteConfirmPanel
            backupPackage={managementStatus.backupPackage}
            pending={managementStatus.state === "deletePending"}
            onCancel={onCancelDelete}
            onConfirm={onConfirmDelete}
          />
        ) : null}
        {restoreStatus.state === "previewPending" ? (
          <p role="status" className="text-sm font-semibold text-slate-600">
            {t("settings.backup.validating")}
          </p>
        ) : null}
        {restoreStatus.state === "importPending" ? (
          <p role="status" className="text-sm font-semibold text-slate-600">
            {t("settings.backup.importSelected.importing")}
          </p>
        ) : null}
        {(restoreStatus.state === "confirming" || restoreStatus.state === "pending") ? (
          <BackupPreviewPanel preview={restoreStatus.preview} />
        ) : null}
        {restoreStatus.state === "confirming" ? (
          <RestoreConfirmPanel
            restoreStatus={restoreStatus}
            onCancelRestore={onCancelRestore}
            onConfirmRestore={onConfirmRestore}
          />
        ) : null}
        {restoreStatus.state === "pending" ? (
          <p role="status" className="text-sm font-semibold text-slate-600">
            {t("settings.backup.restoring")}
          </p>
        ) : restoreStatus.state === "error" ? (
          <p role="alert" className="text-sm font-semibold text-rose-600">
            {restoreStatus.message}
          </p>
        ) : restoreStatus.state === "success" ? (
          <RestoreResultPanel result={restoreStatus.result} />
        ) : null}
      </div>
    </section>
  );
}

function BackupDeleteConfirmPanel({
  backupPackage,
  pending,
  onCancel,
  onConfirm,
}: {
  backupPackage: BackupPackageInfo;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslation();
  return (
    <section
      role="dialog"
      aria-label={t("settings.backup.management.deleteConfirmTitle")}
      className="rounded-lg border border-rose-200 bg-rose-50 p-4"
    >
      <h4 className="text-sm font-semibold text-rose-900">
        {t("settings.backup.management.deleteConfirmTitle")}
      </h4>
      <p className="mt-1 text-xs font-medium text-rose-800">
        {t("settings.backup.management.deleteConfirmBody")}
      </p>
      <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
        <div>
          <dt className="font-semibold">{t("settings.backup.history.dateTime")}</dt>
          <dd>{formatBackupCreatedAt(backupPackage.manifest.createdAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("settings.backup.history.type")}</dt>
          <dd>
            {t(
              backupPackage.manifest.backupType === "automatic"
                ? "settings.backup.type.auto"
                : "settings.backup.type.manual",
            )}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{t("settings.backup.history.note")}</dt>
          <dd className="truncate">{backupPackage.manifest.note || t("common.none")}</dd>
        </div>
      </dl>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 disabled:text-slate-300"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className="h-9 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:bg-rose-300"
        >
          {pending
            ? t("settings.backup.management.deleting")
            : t("settings.backup.management.deleteConfirmAction")}
        </button>
      </div>
    </section>
  );
}

function BackupPreviewPanel({ preview }: { preview: BackupPackagePreview }) {
  const t = useTranslation();
  const counts = preview.database.counts;
  return (
    <section
      aria-label={t("settings.backup.preview.title")}
      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
    >
      <h3 className="text-sm font-semibold text-slate-800">
        {t("settings.backup.preview.title")}
      </h3>
      <p className="mt-1 break-all text-xs font-medium text-slate-500">
        {preview.packageName}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <BackupPreviewMetric label={t("common.videos")} value={counts.videos} />
        <BackupPreviewMetric label={t("common.images")} value={counts.images} />
        <BackupPreviewMetric label={t("common.performers")} value={counts.performers} />
        <BackupPreviewMetric label={t("common.categories")} value={counts.categories} />
        <BackupPreviewMetric label={t("settings.backup.preview.glossary")} value={counts.glossary} />
        <BackupPreviewMetric label={t("settings.backup.preview.credits")} value={counts.credits} />
      </div>
      <div className="mt-3 space-y-1 text-xs font-medium text-slate-600">
        <p>{t("settings.backup.preview.databaseIncluded")}</p>
        <p>
          {t("settings.backup.preview.createdAt", {
            createdAt: preview.manifest.createdAt,
          })}
        </p>
        <p>
          {t("settings.backup.preview.type", {
            type: t(
              preview.manifest.backupType === "automatic"
                ? "settings.backup.type.automatic"
                : "settings.backup.type.manual",
            ),
          })}
        </p>
        {preview.manifest.note ? (
          <p>{t("settings.backup.preview.note", { note: preview.manifest.note })}</p>
        ) : null}
      </div>
      {preview.warnings.map((warning) => (
        <p key={warning} className="mt-2 text-xs font-semibold text-amber-700">
          {warning}
        </p>
      ))}
      {preview.errors.map((error) => (
        <p key={error} role="alert" className="mt-2 text-xs font-semibold text-rose-600">
          {error}
        </p>
      ))}
    </section>
  );
}

function BackupPreviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function RestoreResultPanel({ result }: { result: BackupPackageRestoreResult }) {
  const t = useTranslation();
  return (
    <section
      aria-label={t("settings.backup.result.title")}
      className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-700"
    >
      <h3 className="font-semibold">{t("settings.backup.result.title")}</h3>
      <p className="mt-2 break-all">
        {t("settings.backup.result.restored", {
          packageName: result.restoredPackageName,
        })}
      </p>
      <p className="mt-1 break-all">
        {t("settings.backup.safetyPackageCreated", {
          packageName: result.safetyPackageName,
        })}
      </p>
      {result.rollbackAttempted ? (
        <p className="mt-1">
          {t("settings.backup.result.rollback", {
            status: result.rollbackSucceeded
              ? t("settings.backup.result.rollbackSucceeded")
              : t("settings.backup.result.rollbackFailed"),
          })}
        </p>
      ) : null}
      {result.warnings.map((warning) => (
        <p key={warning} className="mt-2 text-xs font-semibold text-amber-700">
          {warning}
        </p>
      ))}
      {result.errors.map((error) => (
        <p key={error} role="alert" className="mt-2 text-xs font-semibold text-rose-600">
          {error}
        </p>
      ))}
    </section>
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
        <p className="font-semibold text-slate-800">{t("settings.backup.restoreConfirm.title")}</p>
        <p>{t("settings.backup.restoreConfirm.replaceDatabase")}</p>
        <p>{t("settings.backup.restoreConfirm.safetyPackage")}</p>
        <p>{t("settings.backup.restoreConfirm.mediaUnaffected")}</p>
        <p>{t("settings.backup.restoreConfirm.missingMedia")}</p>
        <p className="break-all font-medium text-slate-500">
          {t("settings.backup.restoreConfirm.package", {
            packageName: restoreStatus.preview.packageName,
          })}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCancelRestore}
          className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          {t("settings.backup.restoreConfirm.cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirmRestore}
          className="h-9 rounded-lg border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-600 hover:bg-rose-100"
        >
          {t("settings.backup.restoreConfirm.confirm")}
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
              Package: {restoreStatus.preview.packageName}
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
              ? `Exporting ${"label" in status ? status.label : "data"} ${
                  "format" in status ? status.format.toUpperCase() : ""
                }...`
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
      {status.state === "pending"
        ? pendingMessage
        : "message" in status
          ? status.message
          : null}
    </p>
  );
}

function runtimeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }
  return fallback;
}

function runtimeErrorCode(error: unknown) {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "";
}

function formatBackupCreatedAt(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
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
