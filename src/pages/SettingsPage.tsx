import {
  CloudOff,
  Database,
  FileText,
  Folder,
  HardDrive,
  Monitor,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Tag,
  Upload,
  Video,
  Image as ImageIcon,
  UserRound,
  FilePenLine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type SettingsRow = {
  label: string;
  value: string;
  icon: LucideIcon;
};

const appOverviewRows: SettingsRow[] = [
  { label: "App Name", value: "Sakurava", icon: Tag },
  { label: "Version", value: "1.0.0 MVP", icon: ShieldCheck },
  { label: "Mode", value: "Local / Offline", icon: CloudOff },
  { label: "Platform", value: "Windows Desktop", icon: Monitor },
  { label: "Build Status", value: "Static Frontend Preview", icon: Star },
];

const storageRows: SettingsRow[] = [
  { label: "Database File", value: "sakurava.sqlite", icon: Database },
  { label: "App Data Folder", value: "app.sakurava.desktop", icon: Folder },
  { label: "Storage Mode", value: "Local only", icon: HardDrive },
  { label: "Database Status", value: "Not connected yet", icon: ShieldCheck },
];

const dataSafetyRows: SettingsRow[] = [
  { label: "Data Privacy", value: "Local device only", icon: ShieldCheck },
  { label: "Internet Required", value: "No", icon: CloudOff },
  { label: "Cloud Sync", value: "Not enabled", icon: CloudOff },
  { label: "Backup", value: "Coming later", icon: Upload },
  { label: "Restore", value: "Coming later", icon: Folder },
];

const featureStatusRows: SettingsRow[] = [
  { label: "Videos", value: "Static UI Ready", icon: Video },
  { label: "Images", value: "Static UI Ready", icon: ImageIcon },
  { label: "Performers", value: "Static UI Ready", icon: UserRound },
  { label: "Forms", value: "Static UI Ready", icon: FilePenLine },
  { label: "SQLite", value: "Not connected", icon: Database },
  { label: "Tauri Runtime", value: "Not connected", icon: Monitor },
  { label: "Native File Picker", value: "Post-MVP", icon: Folder },
  { label: "Backup / Restore", value: "Post-MVP", icon: Upload },
];

const uiPreferenceRows: SettingsRow[] = [
  { label: "Theme", value: "Light mode", icon: Monitor },
  { label: "Accent Color", value: "Sakura Pink", icon: Palette },
  { label: "Density", value: "Compact", icon: SlidersHorizontal },
  { label: "Sidebar", value: "Expanded", icon: Folder },
];

function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl font-semibold tracking-normal text-slate-950">
          Settings
        </h1>
        <p className="mt-3 text-base text-slate-500">
          Minimal local app settings
        </p>
      </header>

      <SettingsCard title="App Overview" rows={appOverviewRows} />
      <SettingsCard
        title="Storage & Database"
        rows={storageRows}
        badges={["Frontend Static Only", "Database Not Connected"]}
      />
      <SettingsCard
        title="Data Safety"
        rows={dataSafetyRows}
        disabledActions={["Backup Data", "Restore Data", "Open Data Folder"]}
      />
      <SettingsCard title="MVP Feature Status" rows={featureStatusRows} />
      <SettingsCard
        title="UI Preferences"
        rows={uiPreferenceRows}
        note="UI preferences are read-only in MVP."
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
              This MVP is currently in static frontend phase. Backend,
              database, and desktop runtime integration will be added later.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default SettingsPage;
