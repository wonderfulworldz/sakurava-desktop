export const IMPORT_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const IMPORT_MAX_WORKSHEETS = 16;
export const IMPORT_MAX_ROWS_PER_SECTION = 25_000;
export const IMPORT_MAX_TOTAL_ROWS = 50_000;
export const IMPORT_MAX_CELL_CHARACTERS = 32_767;
export const IMPORT_MAX_PREVIEW_ROWS = IMPORT_MAX_TOTAL_ROWS;

export function importLimitMessage(kind: "file" | "sheets" | "sectionRows" | "totalRows" | "cell") {
  if (kind === "file") return "Choose a Sakurava import file no larger than 25 MB.";
  if (kind === "sheets") return "This workbook has too many worksheets. Use 16 or fewer.";
  if (kind === "sectionRows") return "A data section exceeds 25,000 rows. Split it into smaller imports.";
  if (kind === "totalRows") return "This import exceeds 50,000 total rows. Split it into smaller imports.";
  return "A cell exceeds Excel's 32,767-character limit. Shorten that value and review the file again.";
}
