import { describe, expect, it } from "vitest";
import type { GlossaryEntry, Image, ManagedCategory, Performer, Video } from "../backend/types";
import { parseCsv } from "./importCsvPreview";
import {
  buildCsvExportArtifacts,
  defaultExportFileName,
  exportTypeCode,
  localExportTimestamp,
} from "./exportArtifacts";
import {
  EXPORT_ACTIONS,
  buildVideosCsv,
  buildEntityCsv,
  exportSchemaFor,
  parseExportDate,
  type ExportCsvEntity,
} from "./exportCsv";

const fixedDate = new Date(2026, 6, 14, 5, 38, 25);

describe("shared XLSX/CSV export contract", () => {
  it.each([
    ["videos", "vid"],
    ["images", "img"],
    ["performers", "per"],
    ["categories", "cat"],
    ["glossary", "glo"],
  ] as const)("uses the approved filename token for %s", (dataType, token) => {
    expect(defaultExportFileName([dataType], "csv", fixedDate))
      .toBe(`skv-${token}-20261407-053825.csv`);
    expect(exportTypeCode([dataType])).toBe(token);
  });

  it("uses all for multi-type XLSX and the exact local YYYYDDMM-HHmmss order", () => {
    expect(localExportTimestamp(fixedDate)).toBe("20261407-053825");
    expect(defaultExportFileName(["videos", "performers"], "xlsx", fixedDate))
      .toBe("skv-all-20261407-053825.xlsx");
  });

  it.each(["videos", "images", "performers", "categories", "glossary"] as const)(
    "%s has one ordered contract with valid metadata",
    (dataType) => {
      const schema = exportSchemaFor(dataType);
      expect(schema[0]).toMatchObject({
        key: "action",
        header: "Action",
        required: true,
        editable: true,
        valueType: "text",
      });
      expect(new Set(schema.map((column) => column.key)).size).toBe(schema.length);
      for (const column of schema) {
        expect(column.key).not.toBe("");
        expect(column.header).not.toBe("");
        expect(typeof column.required).toBe("boolean");
        expect(typeof column.editable).toBe("boolean");
        expect(["text", "date", "date-time", "number", "boolean", "identifier", "list/reference"])
          .toContain(column.valueType);
      }
    },
  );

  it("uses the same approved Action values for both representations", () => {
    expect(EXPORT_ACTIONS).toEqual(["Auto", "Create", "Update", "Delete", "Skip"]);
    expect(exportSchemaFor("videos")[0].value({})).toBe("Auto");
  });

  it("uses one operation timestamp for every multi-file CSV artifact", () => {
    const artifacts = buildCsvExportArtifacts({
      selections: [
        { dataType: "videos", records: [] },
        { dataType: "images", records: [] },
        { dataType: "performers", records: [] },
      ],
      locale: "en-US",
      date: fixedDate,
    });
    expect(artifacts.map((artifact) => artifact.fileName)).toEqual([
      "skv-vid-20261407-053825.csv",
      "skv-img-20261407-053825.csv",
      "skv-per-20261407-053825.csv",
    ]);
  });

  it("generates a headers-only CSV template for empty data", () => {
    const [artifact] = buildCsvExportArtifacts({
      selections: [{ dataType: "videos", records: [] }],
      locale: "en-US",
      date: fixedDate,
    });
    const csv = new TextDecoder().decode(artifact.bytes);
    expect(artifact.template).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(1);
    expect(csv.startsWith("Action,Sakurava Ref,Code,Title")).toBe(true);
  });

  it("preserves CSV quoting and parser round-trip for commas, quotes, and multiline text", () => {
    const csv = buildVideosCsv([video({
      title: 'Fictional, "Title"',
      notes: "Line one\nLine two",
    })], { locale: "en-US" });
    const parsed = parseCsv(csv);
    expect(parsed.rows[0][3]).toBe('Fictional, "Title"');
    expect(parsed.rows[0][parsed.rows[0].length - 1]).toBe("Line one\nLine two");
  });

  it("exports Glossary through the same Action and identifier contract", () => {
    const csv = buildEntityCsv("glossary", [glossary()]);
    expect(csv).toContain("Action,Sakurava Ref,Term,Definition,Synonyms");
    expect(csv).toContain("Auto,GLO-");
    expect(csv).toContain("Fictional glossary definition");
  });

  it("formats CSV dates for day-first and month-first locales and keeps invalid/empty values", () => {
    expect(buildVideosCsv([video({ releaseDate: "2026-02-01" })], { locale: "en-GB" }))
      .toContain("01/02/2026");
    expect(buildVideosCsv([video({ releaseDate: "2026-02-01" })], { locale: "en-US" }))
      .toContain("2/1/2026");
    expect(buildVideosCsv([video({ releaseDate: "not-a-date" })], { locale: "en-US" }))
      .toContain("not-a-date");
    expect(buildVideosCsv([video({ releaseDate: "" })], { locale: "en-US" }))
      .not.toContain("Invalid Date");
  });

  it("interprets ambiguous numeric dates using the current computer locale", () => {
    const dayFirst = parseExportDate("1/2/2026", false, "en-GB")!;
    const monthFirst = parseExportDate("1/2/2026", false, "en-US")!;
    expect([dayFirst.getFullYear(), dayFirst.getMonth() + 1, dayFirst.getDate()])
      .toEqual([2026, 2, 1]);
    expect([monthFirst.getFullYear(), monthFirst.getMonth() + 1, monthFirst.getDate()])
      .toEqual([2026, 1, 2]);
  });
});

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "video-1", title: "Video", originalTitle: "", code: "", censorship: "",
    availability: "", releaseDate: "", durationMinutes: null, resolution: "",
    fileSizeBytes: null, fileType: "", publisherLabel: "", coverPath: "",
    mediaPath: "", categoriesJson: "[]", relatedPerformersJson: "[]",
    relatedImagesJson: "[]", sourceLinksJson: "[]", ratingJson: "{}", notes: "",
    favorite: false, createdAt: "", updatedAt: "", ...overrides,
  };
}

// Compile-time coverage keeps every supported record type tied to this contract test.
type SupportedRecords = Video | Image | Performer | ManagedCategory | GlossaryEntry;
const _supportedDataTypes: Record<ExportCsvEntity, SupportedRecords | null> = {
  videos: null, images: null, performers: null, categories: null, glossary: null,
};
void _supportedDataTypes;

function glossary(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: "glossary-1", term: "Fictional Term", definition: "Fictional glossary definition",
    synonymsJson: "[]", category: "", parentId: "", thumbnailPath: "", favorite: false,
    sourceTitle: "", sourceUrl: "", createdAt: 0, updatedAt: 0, ...overrides,
  };
}
