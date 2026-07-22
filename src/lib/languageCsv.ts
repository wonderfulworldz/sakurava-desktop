import {
  getAllTranslationKeys,
  getBuiltInText,
  getKeyDescription,
  type LanguageCode,
} from "./language";
import {
  getOverridesForLanguage,
  inspectStoredLanguageOverrides,
  languageOverridesStorageKey,
  resetOverrideForLanguage,
  setOverrideForLanguage,
} from "./languageOverrides";
import {
  addCustomLanguage,
  customLanguagesStorageKey,
  getStoredCustomLanguages,
  inspectStoredCustomLanguages,
  isProtectedLanguageCode,
  maxCustomLanguages,
  normalizeCustomLanguageCode,
  normalizeCustomLanguageLabel,
  normalizeLanguageIdentity,
} from "./customLanguages";
import { localFileTimestamp } from "../runtime/exportCommands";
import {
  commitTranslationTransaction,
  createTranslationTransactionPlan,
  readRawTranslationSnapshot,
  translationStorageKeys,
  type RawTranslationSnapshot,
  type TranslationStorage,
} from "./translationStorage";

const csvHeaders = ["language_code", "key", "text", "context"] as const;

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

export function buildLanguageExportCsv(languageCode: LanguageCode): string {
  const keys = getAllTranslationKeys();
  const targetCode = languageCode === "en" ? "" : languageCode;

  const headerRow = csvHeaders.join(",");
  const dataRows = keys.map((key) => {
    const english = getBuiltInText("en", key) ?? key;
    const description = getKeyDescription(key);

    return [
      escapeCsvCell(targetCode),
      escapeCsvCell(key),
      escapeCsvCell(english),
      escapeCsvCell(description),
    ].join(",");
  });

  return [headerRow, ...dataRows].join("\n");
}

function resolveLanguageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
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

  const isFinalFormat =
    normalizedHeaders.length === 4 &&
    normalizedHeaders[0] === "language_code" &&
    normalizedHeaders[1] === "key" &&
    normalizedHeaders[2] === "text" &&
    normalizedHeaders[3] === "context";

  if (!isFinalFormat) {
    return emptyCustomPreview(
      "Invalid CSV headers. Expected: language_code,key,text,context.",
    );
  }

  const dataRows = allRows.slice(1);
  if (dataRows.length === 0) {
    return emptyCustomPreview("No data rows in CSV.");
  }

  const firstRow = dataRows[0];
  const languageCode = normalizeCustomLanguageCode(firstRow[0]);
  const languageName = languageCode
    ? normalizeCustomLanguageLabel(resolveLanguageName(languageCode))
    : null;

  if (!languageCode) {
    return emptyCustomPreview(
      "Fill language_code with a valid non-English target language code.",
    );
  }

  if (!languageName) {
    return emptyCustomPreview("Language Name must contain 2-60 safe characters.");
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
    const rowKey = (cells[1] ?? "").trim();
    const rowText = (cells[2] ?? "").trim();
    const rowDescription = (cells[3] ?? "").trim();

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
        error: "Unknown key — import cannot be applied.",
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
  ) && isProtectedLanguageCode(languageCode) === false;
  if (isNew && existingCustom.length >= maxCustomLanguages) {
    return emptyCustomPreview(
      `Up to ${maxCustomLanguages} custom languages can be installed. Remove one before importing another.`,
    );
  }

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
  if (preview.headerError || preview.validRows === 0) {
    return {
      applied: 0,
      overrides: 0,
      resets: 0,
      skipped: preview.totalRows,
      warnings: preview.warningRows,
      errors: Math.max(1, preview.errorRows),
    };
  }

  if (!isProtectedLanguageCode(preview.languageCode)) {
    const registration = addCustomLanguage({
      code: preview.languageCode,
      label: preview.languageName,
      baseLanguage: "en",
    });
    if (!registration.ok) {
      return {
        applied: 0,
        overrides: 0,
        resets: 0,
        skipped: preview.totalRows,
        warnings: preview.warningRows,
        errors: Math.max(1, preview.errorRows),
      };
    }
  }

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

// --- Safe compatibility engine (Batch 42.2C) ---

export const canonicalLanguageCsvHeaders = Object.freeze([
  "language_code",
  "language_label",
  "key",
  "text",
  "state",
  "source_text",
  "context",
] as const);

const historicalFormatAHeaders = Object.freeze([
  "key",
  "text",
  "description",
  "status",
] as const);
const historicalFormatBHeaders = Object.freeze([
  "language code",
  "language name",
  "key",
  "text",
  "description",
] as const);
const historicalFormatCHeaders = Object.freeze([
  "language_code",
  "key",
  "text",
  "context",
] as const);

export type LanguageCsvFormat = "A" | "B" | "C" | "D";
export type LanguageCsvDiagnosticSeverity = "warning" | "error";

export interface SafeLanguageCsvDiagnostic {
  readonly severity: LanguageCsvDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly rowNumber?: number;
  readonly key?: string;
}

export interface ParsedLanguageCsv {
  readonly ok: boolean;
  readonly format?: LanguageCsvFormat;
  readonly rows: readonly (readonly string[])[];
  readonly ignoredBlankRows: number;
  readonly diagnostics: readonly SafeLanguageCsvDiagnostic[];
}

export type HistoricalBuiltInDecision =
  | "treat_as_missing"
  | "preserve_as_custom_override";
export type IdenticalEnglishDecision =
  | "treat_as_missing"
  | "preserve_as_custom_override";
export type LanguageLabelDecision = "preserve_existing" | "replace_existing";

export interface SafeLanguageCsvPreviewOptions {
  readonly explicitTargetCode?: string;
  readonly explicitTargetLabel?: string;
  readonly historicalBuiltInDecision?: HistoricalBuiltInDecision;
  readonly identicalEnglishDecision?: IdenticalEnglishDecision;
  readonly languageLabelDecision?: LanguageLabelDecision;
}

export type SafeLanguageCsvRowAction =
  | "create_override"
  | "update_override"
  | "reset_override"
  | "unchanged"
  | "blocked";

export interface SafeLanguageCsvPreviewRow {
  readonly rowNumber: number;
  readonly key: string;
  readonly text: string;
  readonly sourceText: string;
  readonly context: string;
  readonly action: SafeLanguageCsvRowAction;
  readonly diagnostics: readonly SafeLanguageCsvDiagnostic[];
}

export interface SafeLanguageCsvCounts {
  readonly creates: number;
  readonly updates: number;
  readonly resets: number;
  readonly unchanged: number;
}

export interface SafeLanguageCsvPreview {
  readonly schemaVersion: 1;
  readonly kind: "language_csv_import" | "english_full_reset";
  readonly format: LanguageCsvFormat | "english_reset";
  readonly rawCsv: string;
  readonly targetStoredCode: string;
  readonly targetIdentity: string;
  readonly targetLabel: string;
  readonly capturedSnapshot: RawTranslationSnapshot;
  readonly sourceRowCount: number;
  readonly ignoredBlankRowCount: number;
  readonly counts: SafeLanguageCsvCounts;
  readonly warningCount: number;
  readonly errorCount: number;
  readonly rows: readonly SafeLanguageCsvPreviewRow[];
  readonly fileDiagnostics: readonly SafeLanguageCsvDiagnostic[];
  readonly proposedCustomLanguageMetadata: readonly unknown[];
  readonly proposedCompleteOverrideState: Readonly<Record<string, unknown>>;
  readonly proposedCustomLanguagesRaw: string | null;
  readonly proposedLanguageOverridesRaw: string | null;
  readonly affectedStorageKeys: readonly string[];
  readonly ambiguityDecisions: Readonly<{
    historicalBuiltIn: HistoricalBuiltInDecision;
    identicalEnglish: IdenticalEnglishDecision;
    languageLabel: LanguageLabelDecision;
  }>;
  readonly applyAllowed: boolean;
}

export type SafeLanguageCsvExportResult =
  | {
      readonly ok: true;
      readonly format: "D";
      readonly languageCode: string;
      readonly csv: string;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly SafeLanguageCsvDiagnostic[];
    };

export type SafeLanguageCsvApplyResult =
  | {
      readonly ok: true;
      readonly status: "committed" | "unchanged";
      readonly counts: SafeLanguageCsvCounts;
    }
  | {
      readonly ok: false;
      readonly status:
        | "confirmation_required"
        | "preview_blocked"
        | "stale_preview"
        | "storage_failure"
        | "transaction_recovery_required";
      readonly counts: SafeLanguageCsvCounts;
      readonly diagnostics: readonly SafeLanguageCsvDiagnostic[];
      readonly expectedSnapshot?: RawTranslationSnapshot;
      readonly observedSnapshot?: RawTranslationSnapshot;
      readonly rollback?: "not_attempted" | "succeeded" | "failed";
    };

export interface SafeLanguageCsvApplyOptions {
  readonly confirmed: true;
  readonly transactionId: string;
}

function safeBrowserStorage(): TranslationStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function diagnostic(
  severity: LanguageCsvDiagnosticSeverity,
  code: string,
  message: string,
  rowNumber?: number,
  key?: string,
): SafeLanguageCsvDiagnostic {
  return Object.freeze({
    severity,
    code,
    message,
    ...(rowNumber === undefined ? {} : { rowNumber }),
    ...(key === undefined ? {} : { key }),
  });
}

function sameHeader(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function freezeParsed(
  format: LanguageCsvFormat | undefined,
  rows: string[][],
  ignoredBlankRows: number,
  diagnostics: SafeLanguageCsvDiagnostic[],
): ParsedLanguageCsv {
  const frozenRows = Object.freeze(
    rows.map((row) => Object.freeze([...row]) as readonly string[]),
  );
  const frozenDiagnostics = Object.freeze([...diagnostics]);
  return Object.freeze({
    ok: diagnostics.every((entry) => entry.severity !== "error"),
    ...(format ? { format } : {}),
    rows: frozenRows,
    ignoredBlankRows,
    diagnostics: frozenDiagnostics,
  });
}

/** Strict, dependency-free parser used only by the additive safe engine. */
export function parseLanguageCsv(csvContent: string): ParsedLanguageCsv {
  const rows: string[][] = [];
  const diagnostics: SafeLanguageCsvDiagnostic[] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let afterClosingQuote = false;
  let rowNumber = 1;

  const finishCell = () => {
    row.push(cell);
    cell = "";
    afterClosingQuote = false;
  };
  const finishRow = () => {
    finishCell();
    rows.push(row);
    row = [];
    rowNumber++;
  };

  for (let index = 0; index < csvContent.length; index++) {
    const char = csvContent[index];
    if (inQuotes) {
      if (char === '"') {
        if (csvContent[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          inQuotes = false;
          afterClosingQuote = true;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (afterClosingQuote) {
      if (char === ",") {
        finishCell();
      } else if (char === "\n") {
        finishRow();
      } else if (char === "\r" && csvContent[index + 1] === "\n") {
        finishRow();
        index++;
      } else {
        diagnostics.push(diagnostic(
          "error",
          "characters_after_closing_quote",
          "Unexpected characters follow a closing quote.",
          rowNumber,
        ));
        cell += char;
        afterClosingQuote = false;
      }
      continue;
    }
    if (char === '"') {
      if (cell.length !== 0) {
        diagnostics.push(diagnostic(
          "error",
          "unexpected_quote",
          "A quoted field must begin at the start of a cell.",
          rowNumber,
        ));
        cell += char;
      } else {
        inQuotes = true;
      }
    } else if (char === ",") {
      finishCell();
    } else if (char === "\n") {
      finishRow();
    } else if (char === "\r" && csvContent[index + 1] === "\n") {
      finishRow();
      index++;
    } else {
      cell += char;
    }
  }

  if (inQuotes) {
    diagnostics.push(diagnostic(
      "error",
      "unclosed_quote",
      "CSV contains an unclosed quoted field.",
      rowNumber,
    ));
  }
  if (row.length > 0 || cell.length > 0 || afterClosingQuote) finishRow();
  if (rows.length === 0) {
    diagnostics.push(diagnostic("error", "empty_csv", "CSV is empty."));
    return freezeParsed(undefined, [], 0, diagnostics);
  }

  if (rows[0][0]?.startsWith("\uFEFF")) {
    rows[0][0] = rows[0][0].slice(1);
  }
  const normalizedHeader = rows[0].map((value) =>
    value.replace(/^[\u0009-\u000D\u0020]+|[\u0009-\u000D\u0020]+$/g, "").toLowerCase(),
  );
  if (new Set(normalizedHeader).size !== normalizedHeader.length) {
    diagnostics.push(diagnostic(
      "error",
      "duplicate_header",
      "CSV contains duplicate header names.",
      1,
    ));
  }
  let format: LanguageCsvFormat | undefined;
  if (sameHeader(normalizedHeader, canonicalLanguageCsvHeaders)) format = "D";
  else if (sameHeader(normalizedHeader, historicalFormatAHeaders)) format = "A";
  else if (sameHeader(normalizedHeader, historicalFormatBHeaders)) format = "B";
  else if (sameHeader(normalizedHeader, historicalFormatCHeaders)) format = "C";
  else diagnostics.push(diagnostic(
    "error",
    "unknown_header_signature",
    "CSV headers do not exactly match a supported Translation format.",
    1,
  ));

  const dataRows: string[][] = [];
  let ignoredBlankRows = 0;
  for (let index = 1; index < rows.length; index++) {
    const candidate = rows[index];
    if (candidate.every((value) => value === "")) {
      ignoredBlankRows++;
      continue;
    }
    if (candidate.length !== rows[0].length) {
      diagnostics.push(diagnostic(
        "error",
        "inconsistent_column_count",
        `Row ${index + 1} has ${candidate.length} columns; expected ${rows[0].length}.`,
        index + 1,
      ));
    }
    dataRows.push(candidate);
  }
  if (dataRows.length === 0) {
    diagnostics.push(diagnostic("error", "no_data_rows", "CSV contains no data rows."));
  }
  return freezeParsed(format, dataRows, ignoredBlankRows, diagnostics);
}

function serializeCsvRows(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function snapshotStorage(snapshot: RawTranslationSnapshot): TranslationStorage {
  return {
    getItem(key) {
      if (key === translationStorageKeys.transactionJournal) return snapshot.journal;
      if (key === translationStorageKeys.selectedLanguage ||
        key === translationStorageKeys.customLanguages ||
        key === translationStorageKeys.languageOverrides) {
        return snapshot.state[key];
      }
      return null;
    },
    setItem() {
      throw new Error("Snapshot inspection storage is read-only.");
    },
    removeItem() {
      throw new Error("Snapshot inspection storage is read-only.");
    },
  };
}

function readSafeSnapshot(storage: TranslationStorage | null):
  | { readonly ok: true; readonly snapshot: RawTranslationSnapshot }
  | { readonly ok: false; readonly diagnostics: readonly SafeLanguageCsvDiagnostic[] } {
  if (!storage) {
    return {
      ok: false,
      diagnostics: [diagnostic("error", "storage_unavailable", "Translation storage is unavailable.")],
    };
  }
  const read = readRawTranslationSnapshot(storage);
  if (!read.ok) {
    return {
      ok: false,
      diagnostics: [diagnostic("error", "storage_read_failed", read.failure.message)],
    };
  }
  return { ok: true, snapshot: read.snapshot };
}

function unsafeStorageDiagnostics(snapshot: RawTranslationSnapshot): readonly SafeLanguageCsvDiagnostic[] {
  const readOnly = snapshotStorage(snapshot);
  const custom = inspectStoredCustomLanguages(readOnly);
  const overrides = inspectStoredLanguageOverrides(readOnly);
  const diagnostics: SafeLanguageCsvDiagnostic[] = [];
  if (snapshot.journal !== null) {
    diagnostics.push(diagnostic(
      "error",
      "transaction_recovery_required",
      "A pending Translation transaction must be recovered before Preview or apply.",
    ));
  }
  if (custom.classification !== "clean" || custom.rejectedRaw !== null) {
    diagnostics.push(diagnostic(
      "error",
      "unsafe_custom_language_storage",
      "Custom-language storage is malformed, ambiguous, or otherwise unsafe to mutate.",
    ));
  }
  if (overrides.classification !== "clean" || overrides.rejectedRaw !== null) {
    diagnostics.push(diagnostic(
      "error",
      "unsafe_override_storage",
      "Language-override storage is malformed, ambiguous, or otherwise unsafe to mutate.",
    ));
  }
  return Object.freeze(diagnostics);
}

export function buildCanonicalLanguageCsv(
  languageCode: string,
  storage: TranslationStorage | null = safeBrowserStorage(),
): SafeLanguageCsvExportResult {
  const identity = normalizeLanguageIdentity(languageCode);
  if (!identity) {
    return { ok: false, diagnostics: [diagnostic("error", "invalid_language_code", "Language code is invalid.")] };
  }
  const snapshotRead = readSafeSnapshot(storage);
  if (!snapshotRead.ok) return snapshotRead;
  const blocking = unsafeStorageDiagnostics(snapshotRead.snapshot);
  if (blocking.length > 0) return { ok: false, diagnostics: blocking };
  const readOnly = snapshotStorage(snapshotRead.snapshot);
  const customInspection = inspectStoredCustomLanguages(readOnly);
  const target = identity === "en"
    ? null
    : customInspection.languages.find(
      (entry) => normalizeLanguageIdentity(entry.code) === identity,
    );
  if (identity !== "en" && !target) {
    return {
      ok: false,
      diagnostics: [diagnostic("error", "unknown_language", "The custom language is not installed.")],
    };
  }
  const englishOverrides = getOverridesForLanguage("en", readOnly);
  const targetOverrides = identity === "en"
    ? englishOverrides
    : getOverridesForLanguage(identity, readOnly);
  const rows: string[][] = [[...canonicalLanguageCsvHeaders]];
  for (const key of getAllTranslationKeys()) {
    const baseline = getBuiltInText("en", key) ?? key;
    const effectiveEnglish = englishOverrides[key] ?? baseline;
    const override = targetOverrides[key];
    rows.push(identity === "en"
      ? [
          "en",
          "English",
          key,
          override ?? baseline,
          override === undefined ? "baseline" : "override",
          baseline,
          getKeyDescription(key),
        ]
      : [
          identity,
          target!.label,
          key,
          override ?? "",
          override === undefined ? "missing" : "override",
          effectiveEnglish,
          getKeyDescription(key),
        ]);
  }
  return Object.freeze({
    ok: true,
    format: "D",
    languageCode: identity,
    csv: serializeCsvRows(rows),
  });
}

export type SafeLanguageCsvPreviewResult =
  | { readonly ok: true; readonly preview: SafeLanguageCsvPreview }
  | {
      readonly ok: false;
      readonly parsed?: ParsedLanguageCsv;
      readonly diagnostics: readonly SafeLanguageCsvDiagnostic[];
    };

interface AdaptedCsvRow {
  readonly rowNumber: number;
  readonly code: string;
  readonly label: string;
  readonly key: string;
  readonly text: string;
  readonly sourceText: string;
  readonly context: string;
  readonly state: string;
}

function resolvePreviewIdentity(
  format: LanguageCsvFormat,
  rows: readonly (readonly string[])[],
  options: SafeLanguageCsvPreviewOptions,
  diagnostics: SafeLanguageCsvDiagnostic[],
): { readonly identity: string; readonly sourceCode: string; readonly sourceLabel: string } {
  const rowCodes = format === "A"
    ? []
    : rows.map((row) => format === "D" ? row[0] : format === "B" ? row[0] : row[0]);
  const normalizedCodes = rowCodes
    .filter((code) => code !== "")
    .map((code) => normalizeLanguageIdentity(code));
  if (normalizedCodes.some((code) => code === null)) {
    diagnostics.push(diagnostic("error", "invalid_language_code", "CSV contains an invalid language code."));
  }
  const identities = [...new Set(normalizedCodes.filter((code): code is string => code !== null))];
  let identity = "";
  if (format === "A") {
    identity = normalizeLanguageIdentity(options.explicitTargetCode) ?? "";
    if (!identity) {
      diagnostics.push(diagnostic(
        "error",
        "explicit_target_required",
        "Historical Format A requires an explicit target language code.",
      ));
    }
  } else if (format === "C" && identities.length === 0) {
    identity = normalizeLanguageIdentity(options.explicitTargetCode) ?? "";
    if (!identity) {
      diagnostics.push(diagnostic(
        "error",
        "explicit_target_required",
        "Format C without a language code requires an explicit target.",
      ));
    }
  } else if (identities.length === 1) {
    identity = identities[0];
    const explicit = normalizeLanguageIdentity(options.explicitTargetCode);
    if (explicit && explicit !== identity) {
      diagnostics.push(diagnostic(
        "error",
        "target_identity_conflict",
        "The explicit target conflicts with the CSV language identity.",
      ));
    }
  } else if (identities.length > 1) {
    diagnostics.push(diagnostic(
      "error",
      "mixed_language_identities",
      "CSV contains multiple normalized language identities.",
    ));
  } else {
    diagnostics.push(diagnostic(
      "error",
      "missing_language_identity",
      "CSV does not provide a language identity.",
    ));
  }

  const labels = format === "D"
    ? rows.map((row) => row[1]).filter((value) => value !== "")
    : format === "B"
      ? rows.map((row) => row[1]).filter((value) => value !== "")
      : [];
  const uniqueLabels = [...new Set(labels)];
  if ((format === "D" || format === "B") && uniqueLabels.length > 1) {
    diagnostics.push(diagnostic(
      "error",
      "inconsistent_language_labels",
      "CSV contains inconsistent language labels.",
    ));
  }
  if (format === "D" && uniqueLabels.length === 0) {
    diagnostics.push(diagnostic(
      "error",
      "missing_language_label",
      "Canonical Format D requires a language label.",
    ));
  }
  return {
    identity,
    sourceCode: rowCodes.find((code) => normalizeLanguageIdentity(code) === identity) ?? identity,
    sourceLabel: uniqueLabels[0] ?? options.explicitTargetLabel ?? "",
  };
}

function adaptRows(
  format: LanguageCsvFormat,
  rows: readonly (readonly string[])[],
  resolvedIdentity: string,
): readonly AdaptedCsvRow[] {
  return Object.freeze(rows.map((row, index) => {
    const rowNumber = index + 2;
    if (format === "D") {
      return Object.freeze({
        rowNumber,
        code: row[0] ?? "",
        label: row[1] ?? "",
        key: row[2] ?? "",
        text: row[3] ?? "",
        state: row[4] ?? "",
        sourceText: row[5] ?? "",
        context: row[6] ?? "",
      });
    }
    if (format === "A") {
      return Object.freeze({
        rowNumber,
        code: resolvedIdentity,
        label: "",
        key: row[0] ?? "",
        text: row[1] ?? "",
        context: row[2] ?? "",
        sourceText: "",
        state: row[3] ?? "",
      });
    }
    if (format === "B") {
      return Object.freeze({
        rowNumber,
        code: row[0] || resolvedIdentity,
        label: row[1] ?? "",
        key: row[2] ?? "",
        text: row[3] ?? "",
        context: row[4] ?? "",
        sourceText: "",
        state: "",
      });
    }
    return Object.freeze({
      rowNumber,
      code: row[0] || resolvedIdentity,
      label: "",
      key: row[1] ?? "",
      text: row[2] ?? "",
      context: row[3] ?? "",
      sourceText: "",
      state: "",
    });
  }));
}

function jsonRaw(value: readonly unknown[] | Readonly<Record<string, unknown>>): string | null {
  return Object.keys(value).length === 0 ? null : JSON.stringify(value);
}

function freezePreview(preview: SafeLanguageCsvPreview): SafeLanguageCsvPreview {
  return Object.freeze({
    ...preview,
    counts: Object.freeze({ ...preview.counts }),
    rows: Object.freeze(preview.rows.map((row) => Object.freeze({
      ...row,
      diagnostics: Object.freeze([...row.diagnostics]),
    }))),
    fileDiagnostics: Object.freeze([...preview.fileDiagnostics]),
    proposedCustomLanguageMetadata: Object.freeze([...preview.proposedCustomLanguageMetadata]),
    proposedCompleteOverrideState: Object.freeze({ ...preview.proposedCompleteOverrideState }),
    affectedStorageKeys: Object.freeze([...preview.affectedStorageKeys]),
    ambiguityDecisions: Object.freeze({ ...preview.ambiguityDecisions }),
  });
}

type MutableLanguageCsvCounts = {
  creates: number;
  updates: number;
  resets: number;
  unchanged: number;
};

function emptyCounts(): MutableLanguageCsvCounts {
  return { creates: 0, updates: 0, resets: 0, unchanged: 0 };
}

export function previewLanguageCsvImport(
  csvContent: string,
  options: SafeLanguageCsvPreviewOptions = {},
  storage: TranslationStorage | null = safeBrowserStorage(),
): SafeLanguageCsvPreviewResult {
  const parsed = parseLanguageCsv(csvContent);
  const fileDiagnostics = [...parsed.diagnostics];
  if (!parsed.format) {
    return { ok: false, parsed, diagnostics: Object.freeze(fileDiagnostics) };
  }
  const snapshotRead = readSafeSnapshot(storage);
  if (!snapshotRead.ok) return { ok: false, parsed, diagnostics: snapshotRead.diagnostics };
  fileDiagnostics.push(...unsafeStorageDiagnostics(snapshotRead.snapshot));

  const identityResult = resolvePreviewIdentity(
    parsed.format,
    parsed.rows,
    options,
    fileDiagnostics,
  );
  const identity = identityResult.identity;
  if (identity && !normalizeCustomLanguageCode(identity) && identity !== "en") {
    fileDiagnostics.push(diagnostic(
      "error",
      "invalid_custom_language_code",
      "The target language code does not satisfy the current custom-language contract.",
    ));
  }

  const readOnly = snapshotStorage(snapshotRead.snapshot);
  const customInspection = inspectStoredCustomLanguages(readOnly);
  const overrideInspection = inspectStoredLanguageOverrides(readOnly);
  const existingMeta = customInspection.languages.find(
    (entry) => normalizeLanguageIdentity(entry.code) === identity,
  );
  const sourceLabel = identity === "en" ? "English" : identityResult.sourceLabel;
  let targetLabel = identity === "en" ? "English" : existingMeta?.label ?? sourceLabel;
  const labelDecision = options.languageLabelDecision ?? "preserve_existing";
  const normalizedSuppliedLabel = normalizeCustomLanguageLabel(
    options.explicitTargetLabel ?? sourceLabel,
  );
  const isNewCustom = identity !== "" && identity !== "en" && !existingMeta;
  if (isNewCustom) {
    if (!normalizedSuppliedLabel) {
      fileDiagnostics.push(diagnostic(
        "error",
        "explicit_label_required",
        "A new custom language requires an explicit safe label.",
      ));
    } else {
      targetLabel = options.explicitTargetLabel ?? sourceLabel;
    }
    if (customInspection.languages.length >= maxCustomLanguages) {
      fileDiagnostics.push(diagnostic(
        "error",
        "maximum_languages_reached",
        `Up to ${maxCustomLanguages} custom languages can be installed.`,
      ));
    }
  } else if (existingMeta && sourceLabel && sourceLabel !== existingMeta.label) {
    if (labelDecision === "replace_existing") {
      if (!normalizeCustomLanguageLabel(sourceLabel)) {
        fileDiagnostics.push(diagnostic("error", "invalid_language_label", "Replacement language label is invalid."));
      } else {
        targetLabel = sourceLabel;
      }
    } else {
      fileDiagnostics.push(diagnostic(
        "warning",
        "language_label_preserved",
        "The stored language label remains authoritative.",
      ));
    }
  }

  const proposedMetadata = [...(customInspection.sourceEntries ?? [])];
  if (isNewCustom && normalizedSuppliedLabel) {
    proposedMetadata.push({ code: identity, label: targetLabel, baseLanguage: "en" });
  } else if (existingMeta && labelDecision === "replace_existing" && targetLabel !== existingMeta.label) {
    const sourceIndex = proposedMetadata.findIndex((entry) =>
      !!entry && typeof entry === "object" && !Array.isArray(entry) &&
      normalizeLanguageIdentity((entry as { code?: unknown }).code) === identity,
    );
    if (sourceIndex >= 0) {
      proposedMetadata[sourceIndex] = {
        ...(proposedMetadata[sourceIndex] as Record<string, unknown>),
        label: targetLabel,
      };
    }
  }

  const proposedOverrides: Record<string, unknown> = {
    ...(overrideInspection.sourceObject ?? {}),
  };
  const rawOverrideCode = Object.keys(proposedOverrides).find(
    (code) => normalizeLanguageIdentity(code) === identity,
  ) ?? identity;
  const currentLanguageEntry = rawOverrideCode && proposedOverrides[rawOverrideCode] &&
    typeof proposedOverrides[rawOverrideCode] === "object" &&
    !Array.isArray(proposedOverrides[rawOverrideCode])
    ? { ...(proposedOverrides[rawOverrideCode] as Record<string, unknown>) }
    : {};
  const englishOverrides = getOverridesForLanguage("en", readOnly);
  const keys = new Set(getAllTranslationKeys());
  const seen = new Set<string>();
  const adaptedRows = adaptRows(parsed.format, parsed.rows, identity);
  const previewRows: SafeLanguageCsvPreviewRow[] = [];
  const counts = emptyCounts();

  for (const row of adaptedRows) {
    const rowDiagnostics: SafeLanguageCsvDiagnostic[] = [];
    if (parsed.format === "D" && row.code === "") {
      rowDiagnostics.push(diagnostic("error", "missing_language_code", "Format D requires a language code on every row.", row.rowNumber, row.key));
    }
    if (parsed.format === "D" && row.label === "") {
      rowDiagnostics.push(diagnostic("error", "missing_language_label", "Format D requires a language label on every row.", row.rowNumber, row.key));
    }
    if (parsed.format === "D" && row.sourceText === "") {
      rowDiagnostics.push(diagnostic("error", "missing_source_text", "Format D requires source text on every row.", row.rowNumber, row.key));
    }
    if (row.key === "" && [row.code, row.label, row.text, row.state, row.sourceText, row.context].some((value) => value !== "")) {
      rowDiagnostics.push(diagnostic("error", "blank_key", "A populated row must contain a Translation key.", row.rowNumber));
    } else if (!keys.has(row.key)) {
      rowDiagnostics.push(diagnostic("error", "unknown_key", "Unknown Translation key.", row.rowNumber, row.key));
    }
    if (seen.has(row.key) && row.key !== "") {
      rowDiagnostics.push(diagnostic("error", "duplicate_key", "Duplicate Translation key.", row.rowNumber, row.key));
    }
    if (row.key !== "") seen.add(row.key);
    const rowIdentity = normalizeLanguageIdentity(row.code);
    if (rowIdentity && identity && rowIdentity !== identity) {
      rowDiagnostics.push(diagnostic("error", "mixed_language_identities", "Row targets another language identity.", row.rowNumber, row.key));
    }

    const baseline = row.key ? getBuiltInText("en", row.key) ?? row.key : "";
    const effectiveEnglish = row.key ? englishOverrides[row.key] ?? baseline : "";
    let desired: string | null = row.text;
    if (parsed.format === "D") {
      const state = row.state.trim().toLowerCase();
      const validStates = identity === "en" ? ["baseline", "override"] : ["missing", "override"];
      if (!validStates.includes(state)) {
        rowDiagnostics.push(diagnostic("error", "invalid_state", "Format D contains an invalid state value.", row.rowNumber, row.key));
      }
      if (identity !== "en" && state === "missing" && row.text !== "") {
        rowDiagnostics.push(diagnostic("error", "state_text_inconsistency", "A missing row cannot contain target text.", row.rowNumber, row.key));
      }
      if (identity !== "en" && state === "override" && row.text === "") {
        rowDiagnostics.push(diagnostic("error", "state_text_inconsistency", "An override row must contain target text.", row.rowNumber, row.key));
      }
      if (identity === "en" &&
        ((state === "baseline" && row.text !== "" && row.text !== baseline) ||
          (state === "override" && (row.text === "" || row.text === baseline)))) {
        rowDiagnostics.push(diagnostic("warning", "state_text_inconsistency", "English state evidence does not match text-derived override semantics.", row.rowNumber, row.key));
      }
      if (identity === "en" && row.sourceText !== baseline) {
        rowDiagnostics.push(diagnostic("warning", "source_text_mismatch", "Bundled English source text differs from the CSV evidence.", row.rowNumber, row.key));
      }
      if (identity !== "en" && row.sourceText !== effectiveEnglish) {
        rowDiagnostics.push(diagnostic("warning", "source_text_mismatch", "Effective English fallback differs from the CSV evidence.", row.rowNumber, row.key));
      }
    } else if (parsed.format === "A") {
      const status = row.state.trim().toLowerCase();
      if (!(["custom", "fallback", "missing", "built-in"] as const).includes(status as "custom")) {
        rowDiagnostics.push(diagnostic("error", "unknown_historical_status", "Unknown Format A status.", row.rowNumber, row.key));
      } else if (status === "fallback" || status === "missing") {
        desired = null;
      } else if (status === "built-in" && identity !== "en") {
        desired = (options.historicalBuiltInDecision ?? "treat_as_missing") === "preserve_as_custom_override"
          ? row.text
          : null;
        if (desired === null && row.text !== "") {
          rowDiagnostics.push(diagnostic("warning", "historical_built_in_not_preserved", "Historical built-in text defaults to missing.", row.rowNumber, row.key));
        }
      }
    } else if (identity !== "en" && row.text === effectiveEnglish && row.text !== "") {
      desired = (options.identicalEnglishDecision ?? "treat_as_missing") === "preserve_as_custom_override"
        ? row.text
        : null;
      rowDiagnostics.push(diagnostic(
        "warning",
        desired === null ? "identical_english_treated_as_missing" : "identical_english_preserved",
        desired === null
          ? "Text identical to effective English defaults to missing."
          : "Text identical to effective English is explicitly preserved as an override.",
        row.rowNumber,
        row.key,
      ));
    }

    if (identity === "en" && (desired === "" || desired === baseline)) desired = null;
    if (identity !== "en" && desired === "") desired = null;
    const current = typeof currentLanguageEntry[row.key] === "string"
      ? currentLanguageEntry[row.key] as string
      : undefined;
    let action: SafeLanguageCsvRowAction = "blocked";
    if (rowDiagnostics.every((entry) => entry.severity !== "error") && row.key !== "") {
      if (desired === null) {
        if (current === undefined) {
          action = "unchanged";
          counts.unchanged++;
        } else {
          action = "reset_override";
          counts.resets++;
          delete currentLanguageEntry[row.key];
        }
      } else if (current === desired) {
        action = "unchanged";
        counts.unchanged++;
      } else if (current === undefined) {
        action = "create_override";
        counts.creates++;
        currentLanguageEntry[row.key] = desired;
      } else {
        action = "update_override";
        counts.updates++;
        currentLanguageEntry[row.key] = desired;
      }
    }
    previewRows.push(Object.freeze({
      rowNumber: row.rowNumber,
      key: row.key,
      text: row.text,
      sourceText: parsed.format === "D" ? row.sourceText : effectiveEnglish,
      context: row.context,
      action,
      diagnostics: Object.freeze(rowDiagnostics),
    }));
  }

  if (identity) {
    if (Object.keys(currentLanguageEntry).length === 0) delete proposedOverrides[rawOverrideCode];
    else proposedOverrides[rawOverrideCode] = currentLanguageEntry;
  }
  const allDiagnostics = [
    ...fileDiagnostics,
    ...previewRows.flatMap((row) => row.diagnostics),
  ];
  const metadataChanged = isNewCustom ||
    (existingMeta !== undefined &&
      labelDecision === "replace_existing" &&
      targetLabel !== existingMeta.label);
  const overridesChanged = counts.creates + counts.updates + counts.resets > 0;
  const proposedCustomRaw = metadataChanged
    ? jsonRaw(proposedMetadata)
    : snapshotRead.snapshot.state[customLanguagesStorageKey];
  const proposedOverridesRaw = overridesChanged
    ? jsonRaw(proposedOverrides)
    : snapshotRead.snapshot.state[languageOverridesStorageKey];
  const affectedStorageKeys: string[] = [];
  if (proposedCustomRaw !== snapshotRead.snapshot.state[customLanguagesStorageKey]) {
    affectedStorageKeys.push(customLanguagesStorageKey);
  }
  if (proposedOverridesRaw !== snapshotRead.snapshot.state[languageOverridesStorageKey]) {
    affectedStorageKeys.push(languageOverridesStorageKey);
  }
  const preview = freezePreview({
    schemaVersion: 1,
    kind: "language_csv_import",
    format: parsed.format,
    rawCsv: csvContent,
    targetStoredCode: existingMeta?.code ?? identityResult.sourceCode,
    targetIdentity: identity,
    targetLabel,
    capturedSnapshot: snapshotRead.snapshot,
    sourceRowCount: parsed.rows.length,
    ignoredBlankRowCount: parsed.ignoredBlankRows,
    counts,
    warningCount: allDiagnostics.filter((entry) => entry.severity === "warning").length,
    errorCount: allDiagnostics.filter((entry) => entry.severity === "error").length,
    rows: previewRows,
    fileDiagnostics,
    proposedCustomLanguageMetadata: proposedMetadata,
    proposedCompleteOverrideState: proposedOverrides,
    proposedCustomLanguagesRaw: proposedCustomRaw,
    proposedLanguageOverridesRaw: proposedOverridesRaw,
    affectedStorageKeys,
    ambiguityDecisions: {
      historicalBuiltIn: options.historicalBuiltInDecision ?? "treat_as_missing",
      identicalEnglish: options.identicalEnglishDecision ?? "treat_as_missing",
      languageLabel: labelDecision,
    },
    applyAllowed: allDiagnostics.every((entry) => entry.severity !== "error"),
  });
  return { ok: true, preview };
}

function noAppliedCounts(): SafeLanguageCsvCounts {
  return Object.freeze({ creates: 0, updates: 0, resets: 0, unchanged: 0 });
}

function sameRawSnapshot(
  left: RawTranslationSnapshot,
  right: RawTranslationSnapshot,
): boolean {
  return left.journal === right.journal &&
    left.state[translationStorageKeys.selectedLanguage] === right.state[translationStorageKeys.selectedLanguage] &&
    left.state[translationStorageKeys.customLanguages] === right.state[translationStorageKeys.customLanguages] &&
    left.state[translationStorageKeys.languageOverrides] === right.state[translationStorageKeys.languageOverrides];
}

export function applySafeLanguageCsvPreview(
  preview: SafeLanguageCsvPreview,
  options: SafeLanguageCsvApplyOptions,
  storage: TranslationStorage | null = safeBrowserStorage(),
): SafeLanguageCsvApplyResult {
  if (!options || options.confirmed !== true) {
    return {
      ok: false,
      status: "confirmation_required",
      counts: noAppliedCounts(),
      diagnostics: [diagnostic("error", "confirmation_required", "Explicit confirmation is required.")],
    };
  }
  if (!preview.applyAllowed || preview.errorCount > 0) {
    return {
      ok: false,
      status: "preview_blocked",
      counts: noAppliedCounts(),
      diagnostics: [diagnostic("error", "preview_blocked", "Preview contains blocking errors.")],
    };
  }
  if (!storage) {
    return {
      ok: false,
      status: "storage_failure",
      counts: noAppliedCounts(),
      diagnostics: [diagnostic("error", "storage_unavailable", "Translation storage is unavailable.")],
    };
  }
  const observedBeforeApply = readRawTranslationSnapshot(storage);
  if (!observedBeforeApply.ok) {
    return {
      ok: false,
      status: "storage_failure",
      counts: noAppliedCounts(),
      diagnostics: [diagnostic("error", "storage_read_failed", observedBeforeApply.failure.message)],
    };
  }
  if (!sameRawSnapshot(preview.capturedSnapshot, observedBeforeApply.snapshot)) {
    return {
      ok: false,
      status: "stale_preview",
      counts: noAppliedCounts(),
      diagnostics: [diagnostic("error", "stale_preview", "Translation storage changed after Preview.")],
      expectedSnapshot: preview.capturedSnapshot,
      observedSnapshot: observedBeforeApply.snapshot,
    };
  }
  if (preview.affectedStorageKeys.length === 0) {
    return { ok: true, status: "unchanged", counts: preview.counts };
  }

  const requested: Record<string, string | null> = {};
  if (preview.affectedStorageKeys.includes(customLanguagesStorageKey)) {
    requested[customLanguagesStorageKey] = preview.proposedCustomLanguagesRaw;
  }
  if (preview.affectedStorageKeys.includes(languageOverridesStorageKey)) {
    requested[languageOverridesStorageKey] = preview.proposedLanguageOverridesRaw;
  }
  const plan = createTranslationTransactionPlan(
    preview.capturedSnapshot,
    options.transactionId,
    requested,
  );
  if (!plan.ok) {
    return {
      ok: false,
      status: "storage_failure",
      counts: noAppliedCounts(),
      diagnostics: [diagnostic("error", "transaction_plan_failed", `Transaction plan failed: ${plan.code}.`)],
    };
  }
  const committed = commitTranslationTransaction(storage, plan.plan);
  if (committed.ok) {
    return { ok: true, status: "committed", counts: preview.counts };
  }
  if (committed.status === "stale_snapshot") {
    const observed = readRawTranslationSnapshot(storage);
    return {
      ok: false,
      status: "stale_preview",
      counts: noAppliedCounts(),
      diagnostics: [diagnostic("error", "stale_preview", "Translation storage changed after Preview.")],
      expectedSnapshot: preview.capturedSnapshot,
      ...(observed.ok ? { observedSnapshot: observed.snapshot } : {}),
    };
  }
  const recoveryRequired = committed.status === "transaction_recovery_required";
  return {
    ok: false,
    status: recoveryRequired ? "transaction_recovery_required" : "storage_failure",
    counts: noAppliedCounts(),
    diagnostics: [diagnostic(
      "error",
      recoveryRequired ? "transaction_recovery_required" : "transaction_failed",
      recoveryRequired
        ? "The Translation transaction requires explicit recovery."
        : "The Translation transaction failed and no rows were applied.",
    )],
    rollback: committed.rollback,
  };
}

export function previewFullEnglishReset(
  storage: TranslationStorage | null = safeBrowserStorage(),
): SafeLanguageCsvPreviewResult {
  const snapshotRead = readSafeSnapshot(storage);
  if (!snapshotRead.ok) return snapshotRead;
  const fileDiagnostics = [...unsafeStorageDiagnostics(snapshotRead.snapshot)];
  const readOnly = snapshotStorage(snapshotRead.snapshot);
  const customInspection = inspectStoredCustomLanguages(readOnly);
  const overrideInspection = inspectStoredLanguageOverrides(readOnly);
  const proposedOverrides: Record<string, unknown> = {
    ...(overrideInspection.sourceObject ?? {}),
  };
  const rawEnglishCode = Object.keys(proposedOverrides).find(
    (code) => normalizeLanguageIdentity(code) === "en",
  ) ?? "en";
  const englishEntry = proposedOverrides[rawEnglishCode] &&
    typeof proposedOverrides[rawEnglishCode] === "object" &&
    !Array.isArray(proposedOverrides[rawEnglishCode])
    ? { ...(proposedOverrides[rawEnglishCode] as Record<string, unknown>) }
    : {};
  const rows: SafeLanguageCsvPreviewRow[] = [];
  let resets = 0;
  for (const key of getAllTranslationKeys()) {
    if (typeof englishEntry[key] !== "string") continue;
    rows.push(Object.freeze({
      rowNumber: rows.length + 1,
      key,
      text: englishEntry[key] as string,
      sourceText: getBuiltInText("en", key) ?? key,
      context: getKeyDescription(key),
      action: "reset_override" as const,
      diagnostics: Object.freeze([]),
    }));
    delete englishEntry[key];
    resets++;
  }
  if (Object.keys(englishEntry).length === 0) delete proposedOverrides[rawEnglishCode];
  else proposedOverrides[rawEnglishCode] = englishEntry;
  const proposedOverridesRaw = jsonRaw(proposedOverrides);
  const affectedStorageKeys = proposedOverridesRaw === snapshotRead.snapshot.state[languageOverridesStorageKey]
    ? []
    : [languageOverridesStorageKey];
  const counts = { creates: 0, updates: 0, resets, unchanged: resets === 0 ? 1 : 0 };
  const preview = freezePreview({
    schemaVersion: 1,
    kind: "english_full_reset",
    format: "english_reset",
    rawCsv: "",
    targetStoredCode: "en",
    targetIdentity: "en",
    targetLabel: "English",
    capturedSnapshot: snapshotRead.snapshot,
    sourceRowCount: rows.length,
    ignoredBlankRowCount: 0,
    counts,
    warningCount: fileDiagnostics.filter((entry) => entry.severity === "warning").length,
    errorCount: fileDiagnostics.filter((entry) => entry.severity === "error").length,
    rows,
    fileDiagnostics,
    proposedCustomLanguageMetadata: customInspection.sourceEntries ?? [],
    proposedCompleteOverrideState: proposedOverrides,
    proposedCustomLanguagesRaw: snapshotRead.snapshot.state[customLanguagesStorageKey],
    proposedLanguageOverridesRaw: proposedOverridesRaw,
    affectedStorageKeys,
    ambiguityDecisions: {
      historicalBuiltIn: "treat_as_missing",
      identicalEnglish: "treat_as_missing",
      languageLabel: "preserve_existing",
    },
    applyAllowed: fileDiagnostics.every((entry) => entry.severity !== "error"),
  });
  return { ok: true, preview };
}

export function applyFullEnglishResetPreview(
  preview: SafeLanguageCsvPreview,
  options: SafeLanguageCsvApplyOptions,
  storage: TranslationStorage | null = safeBrowserStorage(),
): SafeLanguageCsvApplyResult {
  if (preview.kind !== "english_full_reset") {
    return {
      ok: false,
      status: "preview_blocked",
      counts: noAppliedCounts(),
      diagnostics: [diagnostic("error", "wrong_preview_kind", "English reset requires an English-reset Preview.")],
    };
  }
  return applySafeLanguageCsvPreview(preview, options, storage);
}
