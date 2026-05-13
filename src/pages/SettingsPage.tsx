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
import { isTauriRuntimeAvailable } from "../runtime/tauriClient";

type SettingsRow = {
  label: string;
  value: string;
  icon: LucideIcon;
};

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

const thumbnailRows: SettingsRow[] = [
  {
    label: "Manual thumbnail rendering",
    value: "Enabled",
    icon: ImageUp,
  },
  {
    label: "Asset access scope",
    value: "Pictures, Videos, Documents, and Downloads",
    icon: Folder,
  },
  {
    label: "Browser preview thumbnails",
    value: "Placeholders only",
    icon: CloudOff,
  },
];

const plannedActionRows: SettingsRow[] = [
  { label: "Backup / Restore", value: "Planned / disabled", icon: FileArchive },
  { label: "Import / Export", value: "Planned / disabled", icon: FileInput },
  { label: "Native File Picker", value: "Planned / disabled", icon: Folder },
  { label: "Advanced Settings", value: "Planned / disabled", icon: SlidersHorizontal },
];

const uiPreferenceRows: SettingsRow[] = [
  { label: "Theme", value: "Light mode", icon: Monitor },
  { label: "Accent Color", value: "Sakura Pink", icon: Palette },
  { label: "Density", value: "Compact", icon: SlidersHorizontal },
  { label: "Sidebar", value: "Expanded", icon: Folder },
];

function SettingsPage() {
  const isDesktopRuntime = isTauriRuntimeAvailable();
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
      <SettingsCard title="Thumbnails & Local Assets" rows={thumbnailRows} />
      <SettingsCard
        title="Data Safety"
        rows={dataSafetyRows}
        disabledActions={["Backup Data", "Restore Data"]}
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
        title="UI Preferences"
        rows={uiPreferenceRows}
        note="Settings are read-only in this batch."
      />
      <AboutCard />
    </div>
  );
}

function SettingsCard({
  title,
  rows,
  badges,
  disabledActions,
  note,
}: {
  title: string;
  rows: SettingsRow[];
  badges?: string[];
  disabledActions?: string[];
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

export default SettingsPage;
