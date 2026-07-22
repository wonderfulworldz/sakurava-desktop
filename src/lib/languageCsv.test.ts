import { beforeEach, describe, expect, it } from "vitest";
import {
  applyFullEnglishResetPreview,
  applySafeLanguageCsvPreview,
  applyCustomLanguageCsvPreview,
  buildCanonicalLanguageCsv,
  buildCustomLanguageCsvPreview,
  buildLanguageExportCsv,
  canonicalLanguageCsvHeaders,
  defaultLanguageCsvFileName,
  parseLanguageCsv,
  previewFullEnglishReset,
  previewLanguageCsvImport,
} from "./languageCsv";
import { getAllTranslationKeys, getBuiltInText, translate } from "./language";
import {
  getOverridesForLanguage,
  setOverrideForLanguage,
} from "./languageOverrides";
import {
  addCustomLanguage,
  getStoredCustomLanguages,
} from "./customLanguages";
import {
  translationStorageKeys,
  type TranslationStorage,
} from "./translationStorage";

const csv = (...rows: string[]) =>
  ["language_code,key,text,context", ...rows].join("\n");

type StorageOperation = {
  op: "getItem" | "setItem" | "removeItem";
  key: string;
  value?: string;
};

class CsvFakeStorage implements TranslationStorage {
  readonly values = new Map<string, string>();
  readonly operations: StorageOperation[] = [];
  private readonly failures = new Map<string, Set<number>>();
  private readonly counts = new Map<string, number>();

  constructor(initial: Readonly<Record<string, string>> = {}) {
    Object.entries(initial).forEach(([key, value]) => this.values.set(key, value));
  }

  fail(op: StorageOperation["op"], key: string, occurrence = 1) {
    const id = `${op}:${key}`;
    const occurrences = this.failures.get(id) ?? new Set<number>();
    occurrences.add(occurrence);
    this.failures.set(id, occurrences);
  }

  private count(op: StorageOperation["op"], key: string) {
    const id = `${op}:${key}`;
    const next = (this.counts.get(id) ?? 0) + 1;
    this.counts.set(id, next);
    if (this.failures.get(id)?.has(next)) throw new Error(id);
  }

  getItem(key: string) {
    this.operations.push({ op: "getItem", key });
    this.count("getItem", key);
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.operations.push({ op: "setItem", key, value });
    this.count("setItem", key);
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.operations.push({ op: "removeItem", key });
    this.count("removeItem", key);
    this.values.delete(key);
  }
}

const storageKeys = translationStorageKeys;

function safeStorage(
  custom = "[]",
  overrides = "{}",
  selected = "en",
) {
  return new CsvFakeStorage({
    [storageKeys.selectedLanguage]: selected,
    [storageKeys.customLanguages]: custom,
    [storageKeys.languageOverrides]: overrides,
  });
}

function formatD(...rows: string[]) {
  return [canonicalLanguageCsvHeaders.join(","), ...rows].join("\n");
}

function expectPreview(
  result: ReturnType<typeof previewLanguageCsvImport>,
) {
  if (!result.ok) throw new Error(result.diagnostics.map((entry) => entry.code).join(","));
  return result.preview;
}

describe("language CSV", () => {
  beforeEach(() => window.localStorage.clear());

  it("uses a recognizable timestamped filename", () => {
    expect(
      defaultLanguageCsvFileName("en", new Date(2026, 4, 20, 14, 30, 12)),
    ).toBe("custom-skv-lang-20262005-143012.csv");
  });

  it("exports the final header and every English registry key", () => {
    const output = buildLanguageExportCsv("en");
    expect(output.split("\n")[0]).toBe("language_code,key,text,context");
    expect(output.split("\n")).toHaveLength(getAllTranslationKeys().length + 1);
    for (const row of [
      ",nav.home,Home,Nav > Home",
      ",collection.filter,Filter,Collection > Filter",
      ",detail.metadata,Metadata,Detail > Metadata",
      ",form.basicIdentity,Basic Identity,Form > Basic Identity",
      ",categories.title,Categories,Categories > Title",
      ",viewer.shortcutsTitle,Shortcuts,Image Viewer > Shortcuts Title",
      ",settings.title,Settings,Settings > Title",
    ]) {
      expect(output).toContain(row);
    }
    expect(output).not.toContain("Private User Title");
  });

  it("exports structural keys with detailed contexts in grouped prefix order", () => {
    const output = buildLanguageExportCsv("en");
    for (const row of [
      ",categories.table.header.name,NAME,Categories > Table > Header > Name",
      ",categories.table.header.description,DESCRIPTION,Categories > Table > Header > Description",
      ",glossary.form.field.category,Category,Glossary > Form > Field > Category",
      ",glossary.form.field.thumbnail,Thumbnail,Glossary > Form > Field > Thumbnail",
      ",common.status.available,Available,Common > Status Value > Available",
      ",catalog.filterChip.category,Category,Catalog > Toolbar > Active Filter Chip > Category",
      ",catalog.filterChip.publisherLabel,Publisher / Label,Catalog > Toolbar > Active Filter Chip > Publisher/Label",
      ",viewer.shortcuts.key.esc,Esc,Image Viewer > Shortcuts > Key > Esc",
      ",viewer.shortcuts.action.closeViewer,Close viewer,Image Viewer > Shortcuts > Action > Close Viewer",
      ",viewer.more.saveAs,Save As,Image Viewer > More > Save As",
      ",viewer.fileInfo.name,Name,Image Viewer > File Info > Name",
    ]) {
      expect(output).toContain(row);
    }
    expect(output.indexOf(",common.")).toBeLessThan(output.indexOf(",home."));
    expect(output.indexOf(",home.")).toBeLessThan(output.indexOf(",detail."));
    expect(output.indexOf(",detail.")).toBeLessThan(output.indexOf(",form."));
    expect(output.indexOf(",form.")).toBeLessThan(output.indexOf(",categories."));
  });

  it("always exports English template text", () => {
    setOverrideForLanguage("id", "nav.home", "Beranda");
    expect(buildLanguageExportCsv("id")).toContain("id,nav.home,Home,Nav > Home");
  });

  it("adds and updates Indonesian as a custom language", () => {
    let preview = buildCustomLanguageCsvPreview(
      csv("id,nav.home,Beranda,Sidebar navigation"),
    );
    expect(preview.languageName).toBe("Indonesian");
    expect(preview.isNew).toBe(true);
    expect(applyCustomLanguageCsvPreview(preview).applied).toBe(1);
    expect(getStoredCustomLanguages()).toEqual([
      { code: "id", label: "Indonesian", baseLanguage: "en" },
    ]);

    preview = buildCustomLanguageCsvPreview(
      csv("id,nav.home,Beranda Baru,Sidebar navigation"),
    );
    expect(preview.isNew).toBe(false);
    applyCustomLanguageCsvPreview(preview);
    expect(getOverridesForLanguage("id")["nav.home"]).toBe("Beranda Baru");
  });

  it("rejects blank, English, and mixed language codes", () => {
    expect(
      buildCustomLanguageCsvPreview(csv(",nav.home,Beranda,Sidebar")).headerError,
    ).toContain("Fill language_code");
    expect(
      buildCustomLanguageCsvPreview(csv("en,nav.home,Changed,Sidebar")).headerError,
    ).toContain("Cannot import");
    expect(
      buildCustomLanguageCsvPreview(
        csv("id,nav.home,Beranda,Sidebar", "ja,nav.videos,ビデオ,Sidebar"),
      ).errorRows,
    ).toBe(1);
  });

  it("rejects duplicate keys, unknown keys, and retired headers", () => {
    expect(
      buildCustomLanguageCsvPreview(
        csv("id,nav.home,A,Sidebar", "id,nav.home,B,Sidebar"),
      ).errorRows,
    ).toBe(1);
    expect(
      buildCustomLanguageCsvPreview(
        csv("id,unknown.key,Unknown,Unknown"),
      ).errorRows,
    ).toBe(1);
    expect(
      buildCustomLanguageCsvPreview(
        "Language Code,Language Name,Key,Text,Description\nid,Indonesian,nav.home,Beranda,nav",
      ).headerError,
    ).toContain("language_code,key,text,context");
  });

  it("uses empty text as English fallback", () => {
    addCustomLanguage({ code: "id", label: "Indonesian", baseLanguage: "en" });
    setOverrideForLanguage("id", "nav.home", "Beranda");
    applyCustomLanguageCsvPreview(
      buildCustomLanguageCsvPreview(csv("id,nav.home,,Sidebar")),
    );
    const overrides = getOverridesForLanguage("id");
    expect(overrides["nav.home"]).toBeUndefined();
    expect(translate("id", "nav.home", {}, overrides)).toBe("Home");
  });

  it("never overwrites the English source", () => {
    applyCustomLanguageCsvPreview(
      buildCustomLanguageCsvPreview(csv("id,nav.home,Beranda,Sidebar")),
    );
    expect(getBuiltInText("en", "nav.home")).toBe("Home");
  });
});

describe("safe Translation CSV engine", () => {
  it("detects the exact canonical Format D header", () => {
    const parsed = parseLanguageCsv(formatD("en,English,nav.home,Home,baseline,Home,Nav"));
    expect(parsed).toMatchObject({ ok: true, format: "D" });
    expect(canonicalLanguageCsvHeaders.join(",")).toBe(
      "language_code,language_label,key,text,state,source_text,context",
    );
  });

  it.each([
    ["A", "Key,Text,Description,Status\nnav.home,Beranda,Nav,Custom"],
    ["B", "Language Code,Language Name,Key,Text,Description\nid,Indonesian,nav.home,Beranda,Nav"],
    ["C", "language_code,key,text,context\nid,nav.home,Beranda,Nav"],
  ])("detects historical Format %s by exact header", (format, source) => {
    expect(parseLanguageCsv(source)).toMatchObject({ ok: true, format });
  });

  it("accepts one BOM only in the first header cell", () => {
    expect(parseLanguageCsv(`\uFEFF${formatD("en,English,nav.home,Home,baseline,Home,Nav")}`)).toMatchObject({
      ok: true,
      format: "D",
    });
    expect(parseLanguageCsv(`\uFEFF\uFEFF${formatD("en,English,nav.home,Home,baseline,Home,Nav")}`).ok).toBe(false);
  });

  it.each([
    ["unknown headers", "foo,bar\na,b", "unknown_header_signature"],
    ["extra columns", `${canonicalLanguageCsvHeaders.join(",")},extra\na,b,c,d,e,f,g,h`, "unknown_header_signature"],
    ["partial signature", "language_code,key,text\nid,nav.home,Beranda", "unknown_header_signature"],
    ["duplicate headers", "language_code,key,key,context\nid,nav.home,Beranda,Nav", "duplicate_header"],
    ["inconsistent columns", `${canonicalLanguageCsvHeaders.join(",")}\nen,English,nav.home,Home`, "inconsistent_column_count"],
    ["unclosed quote", `${canonicalLanguageCsvHeaders.join(",")}\nen,English,nav.home,\"Home`, "unclosed_quote"],
    ["characters after quote", `${canonicalLanguageCsvHeaders.join(",")}\nen,English,nav.home,\"Home\"x,baseline,Home,Nav`, "characters_after_closing_quote"],
  ])("rejects %s", (_name, source, code) => {
    expect(parseLanguageCsv(source).diagnostics.some((entry) => entry.code === code)).toBe(true);
  });

  it("preserves commas, escaped quotes, and embedded newlines", () => {
    const text = "Hello, \"friend\"\r\nnext line";
    const source = formatD(`en,English,nav.home,\"Hello, \"\"friend\"\"\r\nnext line\",override,Home,Nav`);
    const parsed = parseLanguageCsv(source);
    expect(parsed.ok).toBe(true);
    expect(parsed.rows[0][3]).toBe(text);
  });

  it("ignores fully blank rows and reports their count", () => {
    const parsed = parseLanguageCsv(`${formatD("en,English,nav.home,Home,baseline,Home,Nav")}\n,,,,,,`);
    expect(parsed).toMatchObject({ ok: true, ignoredBlankRows: 1 });
  });

  it("exports deterministic English Format D with baseline and override states", () => {
    const storage = safeStorage("[]", JSON.stringify({ en: { "nav.home": "Start" } }));
    const first = buildCanonicalLanguageCsv("en", storage);
    const second = buildCanonicalLanguageCsv("en", storage);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const parsed = parseLanguageCsv(first.csv);
    expect(parsed.rows).toHaveLength(getAllTranslationKeys().length);
    expect(parsed.rows.find((row) => row[2] === "nav.home")).toEqual([
      "en", "English", "nav.home", "Start", "override", "Home", "Nav > Home",
    ]);
    expect(parsed.rows.find((row) => row[2] === "nav.videos")?.[4]).toBe("baseline");
  });

  it("exports custom overrides without copying fallback English into text", () => {
    const custom = JSON.stringify([{ code: "id", label: "Bahasa Indonesia", baseLanguage: "en" }]);
    const overrides = JSON.stringify({ en: { "nav.videos": "Movies" }, id: { "nav.home": "Beranda" } });
    const result = buildCanonicalLanguageCsv("ID", safeStorage(custom, overrides));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = parseLanguageCsv(result.csv);
    expect(parsed.rows.find((row) => row[2] === "nav.home")?.slice(3, 6)).toEqual([
      "Beranda", "override", "Home",
    ]);
    expect(parsed.rows.find((row) => row[2] === "nav.videos")?.slice(3, 6)).toEqual([
      "", "missing", "Movies",
    ]);
  });

  it("round-trips exact canonical Translation text and escaping", () => {
    const value = "One, \"two\"\nthree";
    const storage = safeStorage("[]", JSON.stringify({ en: { "nav.home": value } }));
    const exported = buildCanonicalLanguageCsv("en", storage);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const preview = expectPreview(previewLanguageCsvImport(exported.csv, {}, storage));
    expect(preview.rows.find((row) => row.key === "nav.home")?.text).toBe(value);
  });

  it("parse, Preview, export, and reset reads do not mutate storage", () => {
    const storage = safeStorage();
    parseLanguageCsv(formatD("en,English,nav.home,Home,baseline,Home,Nav"));
    buildCanonicalLanguageCsv("en", storage);
    previewLanguageCsvImport(formatD("en,English,nav.home,Home,baseline,Home,Nav"), {}, storage);
    previewFullEnglishReset(storage);
    expect(storage.operations.every((operation) => operation.op === "getItem")).toBe(true);
  });
});

describe("safe Translation CSV Preview semantics", () => {
  it("blocks blank populated keys, duplicate keys, and unknown keys", () => {
    const storage = safeStorage();
    const blank = expectPreview(previewLanguageCsvImport(
      formatD("en,English,,Changed,override,,Context"), {}, storage,
    ));
    expect(blank.applyAllowed).toBe(false);
    expect(blank.rows[0].diagnostics.some((entry) => entry.code === "blank_key")).toBe(true);

    const duplicate = expectPreview(previewLanguageCsvImport(formatD(
      "en,English,nav.home,Start,override,Home,Nav",
      "en,English,nav.home,Home,baseline,Home,Nav",
    ), {}, storage));
    expect(duplicate.applyAllowed).toBe(false);
    expect(duplicate.rows[1].diagnostics.some((entry) => entry.code === "duplicate_key")).toBe(true);

    const unknown = expectPreview(previewLanguageCsvImport(
      formatD("en,English,user.catalog.title,Private,override,,Catalog"), {}, storage,
    ));
    expect(unknown.applyAllowed).toBe(false);
    expect(unknown.rows[0].diagnostics.some((entry) => entry.code === "unknown_key")).toBe(true);
  });

  it("rejects multiple Format D identities and never uses a filename", () => {
    const preview = expectPreview(previewLanguageCsvImport(formatD(
      "id,Indonesian,nav.home,Beranda,override,Home,Nav",
      "ja,Japanese,nav.videos,ビデオ,override,Videos,Nav",
    ), { explicitTargetCode: "id" }, safeStorage()));
    expect(preview.applyAllowed).toBe(false);
    expect(preview.fileDiagnostics.some((entry) => entry.code === "mixed_language_identities")).toBe(true);
    expect(JSON.stringify(preview)).not.toContain("filename");
  });

  it("creates, updates, resets, and classifies unchanged English overrides", () => {
    const storage = safeStorage("[]", JSON.stringify({ en: {
      "nav.home": "Start",
      "nav.videos": "Films",
      "nav.images": "Pictures",
    } }));
    const preview = expectPreview(previewLanguageCsvImport(formatD(
      "en,English,nav.home,Begin,override,Home,Nav",
      "en,English,nav.videos,,baseline,Videos,Nav",
      "en,English,nav.images,Images,baseline,Images,Nav",
      "en,English,nav.performers,Performers,baseline,Performers,Nav",
      "en,English,nav.settings,Options,override,Settings,Nav",
    ), {}, storage));
    expect(preview.applyAllowed).toBe(true);
    expect(preview.counts).toEqual({ creates: 1, updates: 1, resets: 2, unchanged: 1 });
    expect(preview.proposedCompleteOverrideState).toEqual({ en: {
      "nav.home": "Begin",
      "nav.settings": "Options",
    } });
    expect(preview.proposedCustomLanguageMetadata).toEqual([]);
  });

  it("English Preview preserves exact custom metadata raw text", () => {
    const customRaw = '[\r\n  {"code":"id","label":"Indonesian","baseLanguage":"en","unknown":true}\r\n]';
    const storage = safeStorage(customRaw, "{}");
    const preview = expectPreview(previewLanguageCsvImport(
      formatD("en,English,nav.home,Start,override,Home,Nav"), {}, storage,
    ));
    expect(preview.proposedCustomLanguagesRaw).toBe(customRaw);
    expect(preview.affectedStorageKeys).toEqual([storageKeys.languageOverrides]);
  });

  it("an unchanged Preview preserves exact override raw text", () => {
    const overrideRaw = '{\r\n  "en": {"nav.home":"Start"}\r\n}';
    const preview = expectPreview(previewLanguageCsvImport(
      formatD("en,English,nav.home,Start,override,Home,Nav"), {}, safeStorage("[]", overrideRaw),
    ));
    expect(preview.counts).toEqual({ creates: 0, updates: 0, resets: 0, unchanged: 1 });
    expect(preview.proposedLanguageOverridesRaw).toBe(overrideRaw);
    expect(preview.affectedStorageKeys).toEqual([]);
  });

  it("keeps custom overrides separate from English and treats blanks as missing", () => {
    const custom = JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en", extra: "keep" }]);
    const overrides = JSON.stringify({
      en: { "nav.videos": "Movies" },
      id: { "nav.home": "Lama", "nav.images": "Gambar" },
      jp: { "nav.home": "Home JP" },
    });
    const preview = expectPreview(previewLanguageCsvImport(formatD(
      "id,Indonesian,nav.home,Beranda,override,Home,Nav",
      "id,Indonesian,nav.videos,,missing,Movies,Nav",
      "id,Indonesian,nav.images,,missing,Images,Nav",
    ), {}, safeStorage(custom, overrides)));
    expect(preview.counts).toEqual({ creates: 0, updates: 1, resets: 1, unchanged: 1 });
    expect(preview.proposedCompleteOverrideState).toEqual({
      en: { "nav.videos": "Movies" },
      id: { "nav.home": "Beranda" },
      jp: { "nav.home": "Home JP" },
    });
    expect(preview.proposedCustomLanguageMetadata).toEqual([
      { code: "id", label: "Indonesian", baseLanguage: "en", extra: "keep" },
    ]);
  });

  it("diagnoses Format D state/text inconsistencies and source evidence mismatches", () => {
    const custom = JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en" }]);
    const preview = expectPreview(previewLanguageCsvImport(formatD(
      "id,Indonesian,nav.home,Beranda,missing,Old Home,Nav",
      "id,Indonesian,nav.videos,,override,Videos,Nav",
    ), {}, safeStorage(custom)));
    expect(preview.applyAllowed).toBe(false);
    expect(preview.errorCount).toBe(2);
    expect(preview.warningCount).toBeGreaterThan(0);
  });

  it("blocks missing required Format D identity, label, and source fields", () => {
    const preview = expectPreview(previewLanguageCsvImport(formatD(
      ",,nav.home,Start,override,,Nav",
    ), { explicitTargetCode: "en" }, safeStorage()));
    expect(preview.applyAllowed).toBe(false);
    expect(preview.rows[0].diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "missing_language_code", "missing_language_label", "missing_source_text",
    ]));
  });

  it("derives English mutation from text and warns when state evidence disagrees", () => {
    const preview = expectPreview(previewLanguageCsvImport(formatD(
      "en,English,nav.home,Start,baseline,Home,Nav",
    ), {}, safeStorage()));
    expect(preview.applyAllowed).toBe(true);
    expect(preview.rows[0].action).toBe("create_override");
    expect(preview.rows[0].diagnostics.some((entry) => entry.code === "state_text_inconsistency")).toBe(true);
  });

  it("requires explicit target and label for identity-free historical input", () => {
    const sourceA = "Key,Text,Description,Status\nnav.home,Beranda,Nav,Custom";
    const noTarget = expectPreview(previewLanguageCsvImport(sourceA, {}, safeStorage()));
    expect(noTarget.applyAllowed).toBe(false);
    expect(noTarget.fileDiagnostics.some((entry) => entry.code === "explicit_target_required")).toBe(true);
    const noLabel = expectPreview(previewLanguageCsvImport(sourceA, { explicitTargetCode: "jp" }, safeStorage()));
    expect(noLabel.applyAllowed).toBe(false);
    expect(noLabel.fileDiagnostics.some((entry) => entry.code === "explicit_label_required")).toBe(true);
    const valid = expectPreview(previewLanguageCsvImport(sourceA, {
      explicitTargetCode: "jp",
      explicitTargetLabel: "Japanese Custom",
    }, safeStorage()));
    expect(valid.applyAllowed).toBe(true);
    expect(valid.targetIdentity).toBe("jp");
  });

  it("maps Format A statuses without silently preserving historical built-in text", () => {
    const source = [
      "Key,Text,Description,Status",
      "nav.home,Beranda,Nav,Custom",
      "nav.videos,Video,Nav,Fallback",
      "nav.images,Gambar,Nav,Missing",
      "nav.performers,Penampil,Nav,Built-in",
    ].join("\n");
    const baseOptions = { explicitTargetCode: "id", explicitTargetLabel: "Indonesian" } as const;
    const defaultPreview = expectPreview(previewLanguageCsvImport(source, baseOptions, safeStorage()));
    expect(defaultPreview.rows.map((row) => row.action)).toEqual([
      "create_override", "unchanged", "unchanged", "unchanged",
    ]);
    const preservePreview = expectPreview(previewLanguageCsvImport(source, {
      ...baseOptions,
      historicalBuiltInDecision: "preserve_as_custom_override",
    }, safeStorage()));
    expect(preservePreview.rows[3].action).toBe("create_override");
  });

  it("rejects unknown Format A status", () => {
    const source = "Key,Text,Description,Status\nnav.home,Beranda,Nav,Translated";
    const preview = expectPreview(previewLanguageCsvImport(source, {
      explicitTargetCode: "id",
      explicitTargetLabel: "Indonesian",
    }, safeStorage()));
    expect(preview.applyAllowed).toBe(false);
    expect(preview.rows[0].diagnostics[0].code).toBe("unknown_historical_status");
  });

  it("preserves stored Format B labels unless replacement is explicitly approved", () => {
    const custom = JSON.stringify([{ code: "ID", label: "Stored Indonesian", baseLanguage: "en", extra: 1 }]);
    const source = "Language Code,Language Name,Key,Text,Description\nid,Imported Indonesian,nav.home,Beranda,Nav";
    const kept = expectPreview(previewLanguageCsvImport(source, {}, safeStorage(custom)));
    expect(kept.targetLabel).toBe("Stored Indonesian");
    expect(kept.proposedCustomLanguageMetadata).toEqual(JSON.parse(custom));
    const replaced = expectPreview(previewLanguageCsvImport(source, {
      languageLabelDecision: "replace_existing",
    }, safeStorage(custom)));
    expect(replaced.targetLabel).toBe("Imported Indonesian");
    expect(replaced.proposedCustomLanguageMetadata[0]).toMatchObject({
      code: "ID", label: "Imported Indonesian", extra: 1,
    });
  });

  it("rejects inconsistent Format B codes and labels", () => {
    const source = [
      "Language Code,Language Name,Key,Text,Description",
      "id,Indonesian,nav.home,Beranda,Nav",
      "ja,Japanese,nav.videos,ビデオ,Nav",
    ].join("\n");
    const preview = expectPreview(previewLanguageCsvImport(source, {}, safeStorage()));
    expect(preview.applyAllowed).toBe(false);
    expect(preview.fileDiagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "mixed_language_identities", "inconsistent_language_labels",
    ]));
  });

  it("defaults identical historical custom text to missing and preserves only explicitly", () => {
    const custom = JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en" }]);
    const source = "language_code,key,text,context\nid,nav.home,Home,Nav";
    const missing = expectPreview(previewLanguageCsvImport(source, {}, safeStorage(custom)));
    expect(missing.rows[0].action).toBe("unchanged");
    expect(missing.ambiguityDecisions.identicalEnglish).toBe("treat_as_missing");
    const preserved = expectPreview(previewLanguageCsvImport(source, {
      identicalEnglishDecision: "preserve_as_custom_override",
    }, safeStorage(custom)));
    expect(preserved.rows[0].action).toBe("create_override");
  });

  it("supports Format C explicit target, blank inherited row codes, and rejects multiple codes", () => {
    const noCode = "language_code,key,text,context\n,nav.home,Beranda,Nav";
    expect(expectPreview(previewLanguageCsvImport(noCode, {}, safeStorage())).applyAllowed).toBe(false);
    const inherited = expectPreview(previewLanguageCsvImport([
      "language_code,key,text,context",
      "id,nav.home,Beranda,Nav",
      ",nav.videos,Video,Nav",
    ].join("\n"), { explicitTargetLabel: "Indonesian" }, safeStorage()));
    expect(inherited.targetIdentity).toBe("id");
    expect(inherited.applyAllowed).toBe(true);
    const mixed = expectPreview(previewLanguageCsvImport([
      "language_code,key,text,context",
      "id,nav.home,Beranda,Nav",
      "ja,nav.videos,ビデオ,Nav",
    ].join("\n"), {}, safeStorage()));
    expect(mixed.applyAllowed).toBe(false);
  });

  it("never creates English custom metadata or seeds Indonesian", () => {
    const english = expectPreview(previewLanguageCsvImport(
      formatD("en,English,nav.home,Start,override,Home,Nav"), {}, safeStorage(),
    ));
    expect(english.proposedCustomLanguageMetadata).toEqual([]);
    const japanese = expectPreview(previewLanguageCsvImport(
      formatD("jp,Japanese Custom,nav.home,ホーム,override,Home,Nav"), {}, safeStorage(),
    ));
    expect(japanese.proposedCustomLanguageMetadata).toEqual([
      { code: "jp", label: "Japanese Custom", baseLanguage: "en" },
    ]);
    expect(JSON.stringify(japanese.proposedCustomLanguageMetadata)).not.toContain('"id"');
  });

  it("does not select an imported language", () => {
    const storage = safeStorage("[]", "{}", "en");
    const preview = expectPreview(previewLanguageCsvImport(
      formatD("id,Indonesian,nav.home,Beranda,override,Home,Nav"), {}, storage,
    ));
    expect(preview.affectedStorageKeys).not.toContain(storageKeys.selectedLanguage);
    expect(storage.values.get(storageKeys.selectedLanguage)).toBe("en");
  });

  it.each([
    ["malformed custom storage", "{bad", "{}", "unsafe_custom_language_storage"],
    ["malformed override storage", "[]", "{bad", "unsafe_override_storage"],
    ["duplicate normalized identities", '[{"code":"id","label":"One"},{"code":"ID","label":"Two"}]', "{}", "unsafe_custom_language_storage"],
  ])("blocks %s without rewriting raw state", (_name, custom, overrides, code) => {
    const storage = safeStorage(custom, overrides);
    const preview = expectPreview(previewLanguageCsvImport(
      formatD("en,English,nav.home,Start,override,Home,Nav"), {}, storage,
    ));
    expect(preview.applyAllowed).toBe(false);
    expect(preview.fileDiagnostics.some((entry) => entry.code === code)).toBe(true);
    expect(storage.values.get(storageKeys.customLanguages)).toBe(custom);
    expect(storage.values.get(storageKeys.languageOverrides)).toBe(overrides);
  });

  it("blocks unresolved transaction state", () => {
    const storage = safeStorage();
    storage.values.set(storageKeys.transactionJournal, "{}");
    const preview = expectPreview(previewLanguageCsvImport(
      formatD("en,English,nav.home,Start,override,Home,Nav"), {}, storage,
    ));
    expect(preview.applyAllowed).toBe(false);
    expect(preview.fileDiagnostics.some((entry) => entry.code === "transaction_recovery_required")).toBe(true);
  });
});

describe("safe Translation CSV apply and English reset", () => {
  it("requires explicit confirmation and rejects blocked Preview", () => {
    const storage = safeStorage();
    const valid = expectPreview(previewLanguageCsvImport(
      formatD("en,English,nav.home,Start,override,Home,Nav"), {}, storage,
    ));
    expect(applySafeLanguageCsvPreview(
      valid,
      { confirmed: false, transactionId: "no" } as unknown as { confirmed: true; transactionId: string },
      storage,
    )).toMatchObject({ ok: false, status: "confirmation_required", counts: noCounts });

    const blocked = expectPreview(previewLanguageCsvImport(
      formatD("en,English,unknown.key,X,override,,Unknown"), {}, storage,
    ));
    expect(applySafeLanguageCsvPreview(blocked, {
      confirmed: true,
      transactionId: "blocked",
    }, storage)).toMatchObject({ ok: false, status: "preview_blocked", counts: noCounts });
  });

  it("commits metadata and overrides through one journal-first transaction", () => {
    const storage = safeStorage();
    const preview = expectPreview(previewLanguageCsvImport(
      formatD("id,Indonesian,nav.home,Beranda,override,Home,Nav"), {}, storage,
    ));
    storage.operations.length = 0;
    const result = applySafeLanguageCsvPreview(preview, {
      confirmed: true,
      transactionId: "csv-import-id",
    }, storage);
    expect(result).toMatchObject({
      ok: true,
      status: "committed",
      counts: { creates: 1, updates: 0, resets: 0, unchanged: 0 },
    });
    expect(JSON.parse(storage.values.get(storageKeys.customLanguages)!)).toEqual([
      { code: "id", label: "Indonesian", baseLanguage: "en" },
    ]);
    expect(JSON.parse(storage.values.get(storageKeys.languageOverrides)!)).toEqual({
      id: { "nav.home": "Beranda" },
    });
    expect(storage.values.has(storageKeys.transactionJournal)).toBe(false);
    const journalIndex = storage.operations.findIndex(
      (operation) => operation.op === "setItem" && operation.key === storageKeys.transactionJournal,
    );
    const stateIndex = storage.operations.findIndex(
      (operation) => operation.op === "setItem" && operation.key === storageKeys.customLanguages,
    );
    expect(journalIndex).toBeGreaterThanOrEqual(0);
    expect(journalIndex).toBeLessThan(stateIndex);
    expect(storage.values.get(storageKeys.selectedLanguage)).toBe("en");
  });

  it("rejects stale Preview before any state-key mutation", () => {
    const storage = safeStorage();
    const preview = expectPreview(previewLanguageCsvImport(
      formatD("en,English,nav.home,Start,override,Home,Nav"), {}, storage,
    ));
    storage.values.set(storageKeys.selectedLanguage, "id");
    storage.operations.length = 0;
    const result = applySafeLanguageCsvPreview(preview, {
      confirmed: true,
      transactionId: "stale",
    }, storage);
    expect(result).toMatchObject({ ok: false, status: "stale_preview", counts: noCounts });
    expect(storage.operations.some((operation) =>
      operation.op !== "getItem" && operation.key !== storageKeys.transactionJournal,
    )).toBe(false);
  });

  it("treats a newly appeared journal as stale and never clears it", () => {
    const storage = safeStorage();
    const preview = expectPreview(previewLanguageCsvImport(
      formatD("en,English,nav.home,Start,override,Home,Nav"), {}, storage,
    ));
    const pending = "{\"pending\":true}";
    storage.values.set(storageKeys.transactionJournal, pending);
    storage.operations.length = 0;
    const result = applySafeLanguageCsvPreview(preview, {
      confirmed: true,
      transactionId: "journal-stale",
    }, storage);
    expect(result).toMatchObject({ ok: false, status: "stale_preview", counts: noCounts });
    expect(storage.values.get(storageKeys.transactionJournal)).toBe(pending);
    expect(storage.operations.some((operation) => operation.op !== "getItem")).toBe(false);
  });

  it("returns counters only after verified persistence", () => {
    const beforeOverrides = JSON.stringify({ en: { "nav.videos": "Films" } });
    const storage = safeStorage("[]", beforeOverrides);
    const preview = expectPreview(previewLanguageCsvImport(formatD(
      "en,English,nav.home,Start,override,Home,Nav",
      "en,English,nav.videos,,baseline,Videos,Nav",
    ), {}, storage));
    storage.fail("setItem", storageKeys.languageOverrides, 1);
    const result = applySafeLanguageCsvPreview(preview, {
      confirmed: true,
      transactionId: "write-failure",
    }, storage);
    expect(result).toMatchObject({ ok: false, status: "storage_failure", counts: noCounts, rollback: "succeeded" });
    expect(storage.values.get(storageKeys.languageOverrides)).toBe(beforeOverrides);
    expect(storage.values.has(storageKeys.transactionJournal)).toBe(false);
  });

  it("returns recovery-required with zero counters when rollback cannot be verified", () => {
    const storage = safeStorage();
    const preview = expectPreview(previewLanguageCsvImport(
      formatD("id,Indonesian,nav.home,Beranda,override,Home,Nav"), {}, storage,
    ));
    storage.fail("setItem", storageKeys.languageOverrides, 1);
    storage.fail("setItem", storageKeys.customLanguages, 2);
    const result = applySafeLanguageCsvPreview(preview, {
      confirmed: true,
      transactionId: "rollback-failure",
    }, storage);
    expect(result).toMatchObject({
      ok: false,
      status: "transaction_recovery_required",
      counts: noCounts,
      rollback: "failed",
    });
    expect(storage.values.has(storageKeys.transactionJournal)).toBe(true);
  });

  it("custom export/import round trip never creates fallback overrides", () => {
    const custom = JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en" }]);
    const original = safeStorage(custom, JSON.stringify({ id: { "nav.home": "Beranda" } }));
    const exported = buildCanonicalLanguageCsv("id", original);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const target = safeStorage(custom, "{}");
    const preview = expectPreview(previewLanguageCsvImport(exported.csv, {}, target));
    const result = applySafeLanguageCsvPreview(preview, {
      confirmed: true,
      transactionId: "round-trip",
    }, target);
    expect(result.ok).toBe(true);
    expect(JSON.parse(target.values.get(storageKeys.languageOverrides)!)).toEqual({
      id: { "nav.home": "Beranda" },
    });
  });

  it("previews full English reset without touching custom state or selected language", () => {
    const custom = JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en", extra: true }]);
    const overrides = JSON.stringify({
      en: { "nav.home": "Start", "nav.videos": "Films", "unknown.future": "keep" },
      id: { "nav.home": "Beranda" },
    });
    const storage = safeStorage(custom, overrides, "id");
    const result = previewFullEnglishReset(storage);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const preview = result.preview;
    expect(preview).toMatchObject({
      kind: "english_full_reset",
      counts: { creates: 0, updates: 0, resets: 2, unchanged: 0 },
      applyAllowed: true,
    });
    expect(preview.proposedCompleteOverrideState).toEqual({
      en: { "unknown.future": "keep" },
      id: { "nav.home": "Beranda" },
    });
    expect(preview.proposedCustomLanguagesRaw).toBe(custom);
    expect(preview.affectedStorageKeys).toEqual([storageKeys.languageOverrides]);
    expect(storage.values.get(storageKeys.selectedLanguage)).toBe("id");
  });

  it("full English reset commits atomically and preserves custom state", () => {
    const custom = JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en" }]);
    const overrides = JSON.stringify({ en: { "nav.home": "Start" }, id: { "nav.home": "Beranda" } });
    const storage = safeStorage(custom, overrides, "id");
    const previewResult = previewFullEnglishReset(storage);
    expect(previewResult.ok).toBe(true);
    if (!previewResult.ok) return;
    const result = applyFullEnglishResetPreview(previewResult.preview, {
      confirmed: true,
      transactionId: "english-reset-all",
    }, storage);
    expect(result).toMatchObject({ ok: true, status: "committed", counts: { resets: 1 } });
    expect(JSON.parse(storage.values.get(storageKeys.languageOverrides)!)).toEqual({
      id: { "nav.home": "Beranda" },
    });
    expect(storage.values.get(storageKeys.customLanguages)).toBe(custom);
    expect(storage.values.get(storageKeys.selectedLanguage)).toBe("id");
  });

  it("full English reset is unchanged when no English overrides exist", () => {
    const storage = safeStorage("[]", JSON.stringify({ id: { "nav.home": "Beranda" } }));
    const previewResult = previewFullEnglishReset(storage);
    expect(previewResult.ok).toBe(true);
    if (!previewResult.ok) return;
    expect(previewResult.preview.counts).toEqual({ creates: 0, updates: 0, resets: 0, unchanged: 1 });
    const result = applyFullEnglishResetPreview(previewResult.preview, {
      confirmed: true,
      transactionId: "english-reset-none",
    }, storage);
    expect(result).toMatchObject({ ok: true, status: "unchanged" });
  });

  it("full English reset blocks malformed overrides and rolls back exactly on failure", () => {
    const malformed = safeStorage("[]", "{bad");
    const blocked = previewFullEnglishReset(malformed);
    expect(blocked.ok && blocked.preview.applyAllowed).toBe(false);

    const before = JSON.stringify({ en: { "nav.home": "Start" } });
    const storage = safeStorage("[]", before);
    const previewResult = previewFullEnglishReset(storage);
    expect(previewResult.ok).toBe(true);
    if (!previewResult.ok) return;
    storage.fail("removeItem", storageKeys.languageOverrides, 1);
    const result = applyFullEnglishResetPreview(previewResult.preview, {
      confirmed: true,
      transactionId: "english-reset-fail",
    }, storage);
    expect(result).toMatchObject({ ok: false, counts: noCounts, rollback: "succeeded" });
    expect(storage.values.get(storageKeys.languageOverrides)).toBe(before);
  });

  it("keeps existing public CSV exports type-compatible", () => {
    const fileName: string = defaultLanguageCsvFileName("en", new Date(2026, 0, 1));
    const legacyCsv: string = buildLanguageExportCsv("en");
    const legacyPreview = buildCustomLanguageCsvPreview(csv("id,nav.home,Beranda,Nav"));
    const legacyReport = applyCustomLanguageCsvPreview(legacyPreview);
    expect(fileName).toContain("custom-skv-lang");
    expect(legacyCsv.startsWith("language_code,key,text,context")).toBe(true);
    expect(legacyReport.applied).toBe(1);
  });
});

const noCounts = { creates: 0, updates: 0, resets: 0, unchanged: 0 };
