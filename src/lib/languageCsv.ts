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
import { localFileTimestamp } from "../runtime/exportCommands";

// --- CSV filename ---

export function defaultLanguageCsvFileName(
  languageCode: LanguageCode,
  date = new Date(),
) {
  return `${languageCode}-skv-lang-${localFileTimestamp(date)}.csv`;
}

// --- CSV export ---

const csvHeaders = ["Key", "Text", "Description", "Status"] as const;

type LanguageCsvRowStatus = "Built-in" | "Custom" | "Missing" | "Fallback";

function resolveRowStatus(
  languageCode: LanguageCode,
  key: string,
  overrides: Record<string, string>,
): LanguageCsvRowStatus {
  if (overrides[key]) {
    return "Custom";
  }

  const builtInText = getBuiltInText(languageCode, key);
  if (builtInText !== undefined) {
    return "Built-in";
  }

  const englishText = getBuiltInText("en", key);
  if (englishText !== undefined) {
    return languageCode === "en" ? "Built-in" : "Fallback";
  }

  return "Missing";
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

export function buildLanguageCsv(languageCode: LanguageCode): string {
  const keys = getAllTranslationKeys();
  const overrides = getOverridesForLanguage(languageCode);

  const headerRow = csvHeaders.join(",");
  const dataRows = keys.map((key) => {
    const text = resolveEffectiveText(languageCode, key, overrides);
    const description = getKeyDescription(key);
    const status = resolveRowStatus(languageCode, key, overrides);

    return [
      escapeCsvCell(key),
      escapeCsvCell(text),
      escapeCsvCell(description),
      escapeCsvCell(status),
    ].join(",");
  });

  return [headerRow, ...dataRows].join("\n");
}

// --- CSV import preview ---

export type LanguageCsvPreviewRow = {
  lineNumber: number;
  key: string;
  text: string;
  description: string;
  status: string;
  action: "override" | "reset" | "skip";
  warning?: string;
  error?: string;
};

export type LanguageCsvPreview = {
  languageCode: LanguageCode;
  totalRows: number;
  validRows: number;
  overrideRows: number;
  resetRows: number;
  warningRows: number;
  errorRows: number;
  rows: LanguageCsvPreviewRow[];
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

export function buildLanguageCsvPreview(
  languageCode: LanguageCode,
  csvContent: string,
): LanguageCsvPreview {
  const allRows = parseCsvContent(csvContent);
  const knownKeys = new Set(getAllTranslationKeys());
  const seenKeys = new Set<string>();

  if (allRows.length === 0) {
    return emptyPreview(languageCode, "Empty CSV file.");
  }

  const headerRow = allRows[0];
  const normalizedHeaders = headerRow.map((h) => h.trim().toLowerCase());

  if (
    normalizedHeaders[0] !== "key" ||
    normalizedHeaders[1] !== "text"
  ) {
    return emptyPreview(
      languageCode,
      "Invalid CSV headers. Expected: Key,Text,Description,Status",
    );
  }

  const dataRows = allRows.slice(1);
  const previewRows: LanguageCsvPreviewRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    const lineNumber = i + 2; // 1-indexed, skip header
    const key = (cells[0] ?? "").trim();
    const text = (cells[1] ?? "").trim();
    const description = (cells[2] ?? "").trim();
    const status = (cells[3] ?? "").trim();

    if (!key) {
      continue; // skip blank rows
    }

    if (seenKeys.has(key)) {
      previewRows.push({
        lineNumber,
        key,
        text,
        description,
        status,
        action: "skip",
        error: "Duplicate key — not applied.",
      });
      continue;
    }

    seenKeys.add(key);

    if (!knownKeys.has(key)) {
      previewRows.push({
        lineNumber,
        key,
        text,
        description,
        status,
        action: "skip",
        warning: "Unknown key — not applied.",
      });
      continue;
    }

    if (text === "") {
      previewRows.push({
        lineNumber,
        key,
        text,
        description,
        status,
        action: "reset",
      });
    } else {
      previewRows.push({
        lineNumber,
        key,
        text,
        description,
        status,
        action: "override",
      });
    }
  }

  const overrideRows = previewRows.filter((r) => r.action === "override").length;
  const resetRows = previewRows.filter((r) => r.action === "reset").length;
  const warningRows = previewRows.filter((r) => r.warning).length;
  const errorRows = previewRows.filter((r) => r.error).length;
  const validRows = overrideRows + resetRows;

  return {
    languageCode,
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

export function applyLanguageCsvPreview(
  preview: LanguageCsvPreview,
): LanguageCsvApplyReport {
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

function emptyPreview(
  languageCode: LanguageCode,
  errorMessage: string,
): LanguageCsvPreview {
  return {
    languageCode,
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
        status: "",
        action: "skip",
        error: errorMessage,
      },
    ],
  };
}
