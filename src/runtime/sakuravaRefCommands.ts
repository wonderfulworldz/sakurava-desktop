import { currentSakuravaRefYymm } from "../lib/sakuravaRef";
import { invokeTauriCommand } from "./tauriClient";

export type SakuravaRefSectionCounts = {
  videos: number;
  images: number;
  performers: number;
  categories: number;
  glossary: number;
};

export type SakuravaRefMigrationStatus = {
  state: "legacy" | "migrated" | "invalid";
  required: boolean;
  migrationId: string;
  counts: SakuravaRefSectionCounts;
  capacityPerSectionMonth: number;
  preconditionsValid: boolean;
  issues: string[];
};

export type SakuravaRefMigrationResult = {
  migrated: boolean;
  migrationId: string;
  migrationYymm: string;
  counts: SakuravaRefSectionCounts;
  safetyPackageName: string;
};

export function getSakuravaRefMigrationStatus() {
  return invokeTauriCommand<SakuravaRefMigrationStatus>("sakurava_ref_migration_get_status");
}

export async function requireMigratedSakuravaRefs() {
  const status = await getSakuravaRefMigrationStatus();
  const state = status.state ?? (status.required ? "legacy" : "migrated");
  if (state === "migrated") return status;
  if (state === "legacy") {
    throw new Error("Catalog references must be upgraded before this action is available.");
  }
  throw new Error("Catalog references need recovery before this action is available.");
}

export function applySakuravaRefMigration(date = new Date()) {
  return invokeTauriCommand<SakuravaRefMigrationResult>("sakurava_ref_migration_apply", {
    migrationYymm: currentSakuravaRefYymm(date),
  });
}
