import {
  getAllTranslationKeys,
  getBuiltInText,
  getKeyDescription,
  type LanguageCode,
} from "./language";
import {
  getOverridesForLanguage,
  resetOverrideForLanguage,
  setOverrideForLanguage,
} from "./languageOverrides";
import { addCustomLanguage, getStoredCustomLanguages } from "./customLanguages";
import { localFileTimestamp } from "../runtime/exportCommands";

// --- CSV headers (5-column format) ---

const csvHeaders = ["Language Code", "Language Name", "Key", "Text", "Description"] as const;

// --- CSV filename ---

export function defaultLanguageCsvFileName(
  languageCode: LanguageCode,
  date = new Date(),
) {
  const code = languageCode === "en" ? "custom" : languageCode;
  return `${code}-skv-lang-${localFileTimestamp(date)}.csv`;
}

// --- CSV export ---

function escapeCsvCell(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function resolveEffectiveText(
  languageCode: LanguageCode,
  key: string,
  overrides: Record<string, string>,
): string {
  if (overrides[key]) {
    return overrides[key];
  }

  const builtInText = getBuiltInText(languageCode, key);
  if (builtInText !== undefined) {
    return builtInText;
  }

  const englishText = getBuiltInText("en", key);
  if (englishText !== undefined) {
    return englishText;
  }

  return key;
}

/**
 * Export a custom language CSV.
 * - If languageCode is "en": exports a starter CSV prefilled from English text.
 * - If languageCode is non-English: exports an edit/replace CSV for that language.
 */
export function buildLanguageExportCsv(languageCode: LanguageCode): string {
  const keys = getAllTranslationKeys();
  const isEnglish = languageCode === "en";
  const overrides = isEnglish ? {} : getOverridesForLanguage(languageCode);

  const code = isEnglish ? "custom" : languageCode;
  const name = isEnglish
    ? "Custom Language"
    : getLanguageLabel(languageCode);

  const headerRow = csvHeaders.join(",");
  const dataRows = keys.map((key) => {
    const text = resolveEffectiveText(languageCode, key, overrides);
    const description = getKeyDescription(key);

    return [
      escapeCsvCell(code),
      escapeCsvCell(name),
      escapeCsvCell(key),
      escapeCsvCell(text),
      escapeCsvCell(description),
    ].join(",");
  });

  return [headerRow, ...dataRows].join("\n");
}

function getLanguageLabel(languageCode: LanguageCode): string {
  const custom = getStoredCustomLanguages();
  const found = custom.find((l) => l.code === languageCode);
  if (found) {
    return found.label;
  }
  if (languageCode === "id") {
    return "Indonesian";
  }
  return languageCode;
}

// --- CSV import preview ---

export type LanguageCsvPreviewRow = {
  lineNumber: number;
  key: string;
  text: string;
  description: string;
  action: "override" | "reset" | "skip";
  warning?: string;
  error?: string;
};

export type CustomLanguageCsvPreview = {
  languageCode: string;
  languageName: string;
  isNew: boolean;
  totalRows: number;
  validRows: number;
  overrideRows: number;
  resetRows: number;
  warningRows: number;
  errorRows: number;
  rows: LanguageCsvPreviewRow[];
  headerError?: string;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ",") {
        cells.push(current);
        current = "";
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  cells.push(current);
  return cells;
}

function parseCsvContent(csvContent: string): string[][] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < csvContent.length && csvContent[i + 1] === '"') {
          current += '""';
          i++;
        } else {
          inQuotes = false;
          current += char;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        current += char;
      } else if (char === "\n") {
        lines.push(current.replace(/\r$/, ""));
        current = "";
      } else {
        current += char;
      }
    }
  }

  if (current.replace(/\r$/, "").trim()) {
    lines.push(current.replace(/\r$/, ""));
  }

  return lines.map(parseCsvLine);
}

export function buildCustomLanguageCsvPreview(
  csvContent: string,
): CustomLanguageCsvPreview {
  const allRows = parseCsvContent(csvContent);
  const knownKeys = new Set(getAllTranslationKeys());
  const seenKeys = new Set<string>();

  if (allRows.length === 0) {
    return emptyCustomPreview("Empty CSV file.");
  }

  const headerRow = allRows[0];
  const normalizedHeaders = headerRow.map((h) => h.trim().toLowerCase());

  // Detect old 7-column format and give clear error
  if (
    normalizedHeaders.length >= 7 &&
    normalizedHeaders[0] === "language code" &&
    normalizedHeaders[2] === "base language"
  ) {
    return emptyCustomPreview(
      "Unsupported 7-column CSV format detected. Please use the current 5-column format: Language Code,Language Name,Key,Text,Description",
    );
  }

  // Validate 5-column headers
  if (
    normalizedHeaders[0] !== "language code" ||
    normalizedHeaders[1] !== "language name" ||
    normalizedHeaders[2] !== "key" ||
    normalizedHeaders[3] !== "text"
  ) {
    return emptyCustomPreview(
      "Invalid CSV headers. Expected: Language Code,Language Name,Key,Text,Description",
    );
  }

  const dataRows = allRows.slice(1);
  if (dataRows.length === 0) {
    return emptyCustomPreview("No data rows in CSV.");
  }

  // Extract language metadata from first data row
  const firstRow = dataRows[0];
  const languageCode = (firstRow[0] ?? "").trim().toLowerCase();
  const languageName = (firstRow[1] ?? "").trim();

  if (!languageCode) {
    return emptyCustomPreview("Language Code is required.");
  }

  if (!languageName) {
    return emptyCustomPreview("Language Name is required.");
  }

  if (languageCode === "en") {
    return emptyCustomPreview("Cannot import custom language with code 'en'. English is the built-in primary language.");
  }

  // Validate all rows use the same language code
  const previewRows: LanguageCsvPreviewRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    const lineNumber = i + 2;
    const rowLangCode = (cells[0] ?? "").trim().toLowerCase();
    const rowKey = (cells[2] ?? "").trim();
    const rowText = (cells[3] ?? "").trim();
    const rowDescription = (cells[4] ?? "").trim();

    if (!rowKey) {
      continue; // skip blank rows
    }

    if (rowLangCode && rowLangCode !== languageCode) {
      previewRows.push({
        lineNumber,
        key: rowKey,
        text: rowText,
        description: rowDescription,
        action: "skip",
        error: `Mixed language codes in one CSV. Expected '${languageCode}', found '${rowLangCode}'.`,
      });
      continue;
    }

    if (seenKeys.has(rowKey)) {
      previewRows.push({
        lineNumber,
        key: rowKey,
        text: rowText,
        description: rowDescription,
        action: "skip",
        error: "Duplicate key — not applied.",
      });
      continue;
    }

    seenKeys.add(rowKey);

    if (!knownKeys.has(rowKey)) {
      previewRows.push({
        lineNumber,
        key: rowKey,
        text: rowText,
        description: rowDescription,
        action: "skip",
        warning: "Unknown key — not applied.",
      });
      continue;
    }

    if (rowText === "") {
      previewRows.push({
        lineNumber,
        key: rowKey,
        text: rowText,
        description: rowDescription,
        action: "reset",
      });
    } else {
      previewRows.push({
        lineNumber,
        key: rowKey,
        text: rowText,
        description: rowDescription,
        action: "override",
      });
    }
  }

  const overrideRows = previewRows.filter((r) => r.action === "override").length;
  const resetRows = previewRows.filter((r) => r.action === "reset").length;
  const warningRows = previewRows.filter((r) => r.warning).length;
  const errorRows = previewRows.filter((r) => r.error).length;
  const validRows = overrideRows + resetRows;

  // Determine if this is a new or existing custom language
  const existingCustom = getStoredCustomLanguages();
  const isNew = !existingCustom.some(
    (lang) => lang.code.trim().toLowerCase() === languageCode,
  ) && languageCode !== "id"; // id is bundled, treat as existing

  return {
    languageCode,
    languageName,
    isNew,
    totalRows: previewRows.length,
    validRows,
    overrideRows,
    resetRows,
    warningRows,
    errorRows,
    rows: previewRows,
  };
}

// --- CSV import apply ---

export type LanguageCsvApplyReport = {
  applied: number;
  overrides: number;
  resets: number;
  skipped: number;
  warnings: number;
  errors: number;
};

export function applyCustomLanguageCsvPreview(
  preview: CustomLanguageCsvPreview,
): LanguageCsvApplyReport {
  // Register/update the custom language metadata
  addCustomLanguage({
    code: preview.languageCode,
    label: preview.languageName,
    baseLanguage: "en",
  });

  // Apply translations as overrides
  let overrides = 0;
  let resets = 0;
  let skipped = 0;
  let warnings = 0;
  let errors = 0;

  for (const row of preview.rows) {
    if (row.error) {
      errors++;
      continue;
    }

    if (row.warning) {
      warnings++;
      continue;
    }

    if (row.action === "override") {
      setOverrideForLanguage(preview.languageCode, row.key, row.text);
      overrides++;
    } else if (row.action === "reset") {
      resetOverrideForLanguage(preview.languageCode, row.key);
      resets++;
    } else {
      skipped++;
    }
  }

  return {
    applied: overrides + resets,
    overrides,
    resets,
    skipped: skipped + warnings + errors,
    warnings,
    errors,
  };
}

function emptyCustomPreview(errorMessage: string): CustomLanguageCsvPreview {
  return {
    languageCode: "",
    languageName: "",
    isNew: false,
    totalRows: 0,
    validRows: 0,
    overrideRows: 0,
    resetRows: 0,
    warningRows: 0,
    errorRows: 1,
    rows: [
      {
        lineNumber: 0,
        key: "",
        text: "",
        description: "",
        action: "skip",
        error: errorMessage,
      },
    ],
    headerError: errorMessage,
  };
}
