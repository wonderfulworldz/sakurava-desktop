import {
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { backUpDatabase, restoreDatabase } from "../runtime/databaseCommands";
import {
  selectDatabaseBackupDestination,
  selectDatabaseRestoreSource,
  selectLocalFolder,
} from "../runtime/dialogCommands";
import {
  allowMediaAssetRoot,
  getStoredMediaAssetRoots,
  storeMediaAssetRoots,
} from "../runtime/mediaAssetScope";
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";

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

type MediaRootStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

const appOverviewRows: SettingsRow[] = [
  { label: "App Name", value: "Sakurava", icon: Tag },
  { label: "Version", value: "1.0.0 MVP", icon: ShieldCheck },
  { label: "Mode", value: "Local / Offline", icon: CloudOff },
  { label: "Platform Target", value: "Windows Desktop", icon: Monitor },
];

const DATABASE_FILE_NAME = "sakurava.sqlite";
const APP_DATA_FOLDER_LABEL = "app.sakurava.desktop";

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
  { label: "Backup / Restore", value: "Planned / disabled", icon: FileArchive },
  { label: "Import / Export", value: "Planned / disabled", icon: FileInput },
  { label: "Native File Picker", value: "Planned / disabled", icon: Folder },
  { label: "Advanced Settings", value: "Planned / disabled", icon: SlidersHorizontal },
];

const appearanceRows: SettingsRow[] = [
  { label: "Light Mode", value: "Current / default", icon: Monitor },
  { label: "Dark Mode", value: "Planned / disabled", icon: Palette },
  { label: "Accent Color", value: "Sakura Pink", icon: Palette },
  { label: "Density", value: "Compact", icon: SlidersHorizontal },
  { label: "Sidebar", value: "Expanded by default", icon: Folder },
];

const languageRows: SettingsRow[] = [
  { label: "English", value: "Current / default", icon: FileText },
  { label: "Indonesian", value: "Planned / disabled", icon: FileText },
];

function SettingsPage() {
  const isDesktopRuntime = isTauriRuntimeAvailable();
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({
    state: "idle",
  });
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>({
    state: "idle",
  });
  const [mediaRoots, setMediaRoots] = useState<string[]>([]);
  const [mediaRootStatus, setMediaRootStatus] = useState<MediaRootStatus>({
    state: "idle",
  });
  const isBackupPending = backupStatus.state === "pending";
  const isRestorePending = restoreStatus.state === "pending";
  const isMediaRootPending = mediaRootStatus.state === "pending";
  const canBackUpDatabase = isDesktopRuntime && !isBackupPending && !isRestorePending;
  const canRestoreDatabase =
    isDesktopRuntime && !isBackupPending && !isRestorePending;
  const canAddMediaRoot = isDesktopRuntime && !isMediaRootPending;
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
      label: "Database file name",
      value: DATABASE_FILE_NAME,
      icon: Database,
    },
    {
      label: "App data folder label",
      value: APP_DATA_FOLDER_LABEL,
      icon: Folder,
    },
    { label: "Storage mode", value: "Local only", icon: HardDrive },
  ];

  useEffect(() => {
    setMediaRoots(getStoredMediaAssetRoots());
  }, []);

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
        setMediaRootStatus({
          state: "success",
          message: `${displayMediaRootPath(result.rootPath)} is already configured.`,
        });
        return;
      }

      const nextRoots = [...mediaRoots, result.rootPath];
      storeMediaAssetRoots(nextRoots);
      setMediaRoots(nextRoots);
      setMediaRootStatus({
        state: "success",
        message: `Media root enabled for thumbnails: ${displayMediaRootPath(result.rootPath)}`,
      });
    } catch (error) {
      setMediaRootStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Media root was not enabled.",
      });
    }
  }

  function handleRemoveMediaRoot(rootPath: string) {
    const nextRoots = mediaRoots.filter(
      (root) => mediaRootKey(root) !== mediaRootKey(rootPath),
    );
    storeMediaAssetRoots(nextRoots);
    setMediaRoots(nextRoots);
    setMediaRootStatus({
      state: "success",
      message: "Removed roots stop being restored after restart.",
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl font-semibold tracking-normal text-slate-950">
          Settings
        </h1>
        <p className="mt-3 text-base text-slate-500">
          Read-only runtime status for the local Sakurava desktop app.
        </p>
      </header>

      <SettingsCard title="App Overview" rows={appOverviewRows} />
      <SettingsCard
        title="Runtime & Database"
        rows={runtimeRows}
        badges={[
          isDesktopRuntime ? "Desktop Runtime" : "Browser Preview",
          isDesktopRuntime ? "Database Available" : "Database Unavailable",
        ]}
      />
      <SettingsCard
        title="Thumbnails & Local Assets"
        rows={thumbnailRows}
        actions={[
          {
            label: isMediaRootPending ? "Adding Media Root..." : "Add Media Root",
            disabled: !canAddMediaRoot,
            onClick: handleAddMediaRoot,
          },
        ]}
        mediaRootStatus={mediaRootStatus}
        mediaRoots={mediaRoots}
        onRemoveMediaRoot={handleRemoveMediaRoot}
      />
      <SettingsCard
        title="Data Safety"
        rows={dataSafetyRows}
        actions={[
          {
            label: isBackupPending ? "Backing Up..." : "Backup Data",
            disabled: !canBackUpDatabase,
            onClick: handleBackupData,
          },
          {
            label: isRestorePending ? "Restoring..." : "Restore Data",
            disabled: !canRestoreDatabase,
            onClick: handleRestoreData,
          },
        ]}
        backupStatus={backupStatus}
        restoreStatus={restoreStatus}
        onCancelRestore={() => setRestoreStatus({ state: "idle" })}
        onConfirmRestore={handleConfirmRestore}
      />
      <SettingsCard title="MVP Feature Status" rows={featureStatusRows} />
      <SettingsCard
        title="Planned Tools"
        rows={plannedActionRows}
        disabledActions={[
          "Backup / Restore",
          "Import / Export",
          "Native File Picker",
          "Open Data Folder",
          "Advanced Settings",
        ]}
      />
      <SettingsCard
        title="Appearance"
        rows={appearanceRows}
        note="Appearance switching is planned and not active in this batch."
      />
      <SettingsCard
        title="Language"
        rows={languageRows}
        note="Language switching is planned and not active in this batch."
      />
      <AboutCard />
    </div>
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
      <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold tracking-normal text-slate-950">
          {title}
        </h2>
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
      <div className="divide-y divide-slate-200 px-4">
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
        <div className="space-y-4 border-t border-slate-200 px-6 py-4">
          <div className="space-y-2 text-sm leading-6 text-slate-600">
            <p className="font-semibold text-slate-800">Confirm database restore</p>
            <p>Current Sakurava database will be replaced.</p>
            <p>Only records are restored.</p>
            <p>Local media files are not restored or deleted.</p>
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
        <div className="space-y-3 border-t border-slate-200 px-4 py-4">
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
        <div className="flex flex-wrap gap-3 border-t border-slate-200 px-4 py-4">
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
        <p className="border-t border-slate-200 px-6 py-4 text-sm font-medium text-slate-500">
          {note}
        </p>
      )}
    </section>
  );
}

function SettingsStatusMessage({
  status,
  kind,
}: {
  status?: BackupStatus | RestoreStatus | MediaRootStatus;
  kind: "backup" | "restore" | "mediaRoot";
}) {
  if (!status || status.state === "idle" || status.state === "confirming") {
    return null;
  }

  const isError = status.state === "error";
  const pendingMessage =
    kind === "backup"
      ? "Creating database backup..."
      : kind === "restore"
        ? "Restoring database..."
        : "Adding media root...";

  return (
    <p
      role={isError ? "alert" : "status"}
      className={`border-t border-slate-200 px-6 py-4 text-sm font-semibold ${
        isError ? "text-rose-600" : "text-slate-600"
      }`}
    >
      {status.state === "pending" ? pendingMessage : status.message}
    </p>
  );
}

function SettingsInfoRow({ row }: { row: SettingsRow }) {
  const Icon = row.icon;

  return (
    <div className="grid gap-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500">
          <Icon size={20} />
        </span>
        <p className="text-base font-semibold text-slate-700">{row.label}</p>
      </div>
      <p className="text-base font-semibold text-slate-500 sm:text-right">
        {row.value}
      </p>
    </div>
  );
}

function AboutCard() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sakura-50 text-sakura-500">
          <FileText size={20} />
        </span>
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-slate-950">
            About Sakurava
          </h2>
          <div className="mt-6 space-y-2 text-base leading-7 text-slate-500">
            <p>
              Sakurava is a private local desktop catalog app for Videos,
              Images, and Performers.
            </p>
            <p>
              Runtime data is stored locally, and manually saved thumbnails are
              rendered from approved local asset locations when running in
              Tauri.
            </p>
          </div>
        </div>
      </div>
    </section>
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

function mediaRootKey(rootPath: string) {
  return displayMediaRootPath(rootPath).replace(/\//g, "\\").toLocaleLowerCase();
}

function displayMediaRootPath(rootPath: string) {
  return rootPath.trim().replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
}

export default SettingsPage;
