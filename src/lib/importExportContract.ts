import type { ExportCsvEntity } from "./exportCsv";

export const SAKURAVA_APPLICATION_ID = "app.sakurava.desktop";
export const SAKURAVA_IMPORT_CONTRACT_VERSION = 1;
export const SAKURAVA_EXPORT_FORMAT_VERSION = 1;
export const SAKURAVA_METADATA_SHEET = "__SakuravaMetadata";
export const SAKURAVA_CLEAR_VALUE = "[[SAKURAVA:CLEAR:v1]]";

export type SakuravaWorkbookMetadata = {
  applicationId: typeof SAKURAVA_APPLICATION_ID;
  contractVersion: number;
  exportFormatVersion: number;
  generatedAt: string;
  includedDataTypes: ExportCsvEntity[];
  workbookType: "catalog" | "template";
  format: "xlsx";
};

export function buildWorkbookMetadata({
  dataTypes,
  generatedAt,
  template,
}: {
  dataTypes: ExportCsvEntity[];
  generatedAt: Date;
  template: boolean;
}): SakuravaWorkbookMetadata {
  return {
    applicationId: SAKURAVA_APPLICATION_ID,
    contractVersion: SAKURAVA_IMPORT_CONTRACT_VERSION,
    exportFormatVersion: SAKURAVA_EXPORT_FORMAT_VERSION,
    generatedAt: generatedAt.toISOString(),
    includedDataTypes: dataTypes,
    workbookType: template ? "template" : "catalog",
    format: "xlsx",
  };
}

export function stableContractJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableContractJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableContractJson(item)}`)
    .join(",")}}`;
}

export function operationFingerprint(value: unknown) {
  const text = stableContractJson(value);
  return fingerprintBytes(new TextEncoder().encode(text), "skv1");
}

export function sourceFileFingerprint(bytes: Uint8Array) {
  return fingerprintBytes(bytes, "skvf1");
}

function fingerprintBytes(bytes: Uint8Array, prefix: string) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
