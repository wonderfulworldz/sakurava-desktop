import { describe, expect, it } from "vitest";
import type { Credit, GlossaryEntry, Image, ManagedCategory, Performer, Video } from "../backend/types";
import { buildImportCsvPreview, parseCsv } from "./importCsvPreview";
import {
  buildCsvExportArtifacts,
  defaultExportFileName,
  exportTypeCode,
  localExportTimestamp,
  prepareSelectionsWithPublicRefs,
  projectSafeExportSelections,
} from "./exportArtifacts";
import {
  EXPORT_ACTIONS,
  EXPORT_EXAMPLE_SENTINEL,
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
  ["credits", "cre"],
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
    expect(EXPORT_ACTIONS).toEqual(["Auto", "Add", "Update", "Delete"]);
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

  it("generates one ignored example row for an empty CSV section", () => {
    const [artifact] = buildCsvExportArtifacts({
      selections: [{ dataType: "videos", records: [] }],
      locale: "en-US",
      date: fixedDate,
    });
    const csv = new TextDecoder().decode(artifact.bytes);
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv.startsWith("Action,Sakurava Ref,Title,Original Title,Code")).toBe(true);
    expect(parseCsv(csv).rows[0][0]).toBe(EXPORT_EXAMPLE_SENTINEL);
    expect(buildImportCsvPreview(csv, {
      videos: [], images: [], performers: [], categories: [], glossary: [], credits: [],
    }).rows).toEqual([]);
  });

  it("treats an edited example row as an ordinary import row", () => {
    const [artifact] = buildCsvExportArtifacts({
      selections: [{ dataType: "videos", records: [] }],
      locale: "en-US",
      date: fixedDate,
    });
    const csv = new TextDecoder().decode(artifact.bytes)
      .replace(EXPORT_EXAMPLE_SENTINEL, "Auto");
    const preview = buildImportCsvPreview(csv, {
      videos: [], images: [], performers: [], categories: [], glossary: [], credits: [],
    });
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].detectedResult).toBe("Added");
  });

  it("omits Glossary Refs from new exports while retaining legacy input compatibility", () => {
    const csv = buildEntityCsv("videos", [video({ glossaryRefsJson: JSON.stringify(["glo-1"]) })]);
    expect(parseCsv(csv).headers).not.toContain("Glossary Refs");
    const legacy = csv.replace("Related Performers", "Glossary Refs,Related Performers")
      .replace("Auto,", "Auto,,glo-1,");
    const preview = buildImportCsvPreview(legacy, {
      videos: [], images: [], performers: [], categories: [], glossary: [], credits: [],
    });
    expect(preview.headerErrors).toEqual([]);
  });

  it("projects sensitive columns from safe artifacts while preserving import compatibility", () => {
    const performer = {
      id: "performer-1", name: "Performer", categoriesJson: "[]", relatedVideosJson: "[]",
      relatedImagesJson: "[]", ratingJson: "{}", sourceLinksJson: "[]", thumbnailPathsJson: "[]",
    } as unknown as Performer;
    const [safeArtifact] = buildCsvExportArtifacts({
      selections: [{ dataType: "performers", records: [performer] }],
      locale: "en-US",
      date: fixedDate,
      safeExport: true,
    });
    const safeCsv = new TextDecoder().decode(safeArtifact.bytes);
    const [explicitArtifact] = buildCsvExportArtifacts({
      selections: [{ dataType: "performers", records: [performer] }],
      locale: "en-US",
      date: fixedDate,
      explicit: true,
    });
    const explicitCsv = new TextDecoder().decode(explicitArtifact.bytes);

    expect(safeCsv).not.toContain("R+");
    expect(safeCsv).not.toContain("Measurements");
    expect(safeCsv).not.toContain("Cup Size");
    expect(explicitCsv).toContain("R+");
    expect(explicitCsv).toContain("Measurements");
    expect(explicitCsv).toContain("Cup Size");

    for (const csv of [safeCsv, explicitCsv]) {
      const preview = buildImportCsvPreview(csv, {
        videos: [], images: [], performers: [], categories: [], glossary: [], credits: [],
      });
      expect(preview.headerErrors).toEqual([]);
      expect(preview.summary.blocked).toBe(false);
    }
  });

  it("preserves CSV quoting and parser round-trip for commas, quotes, and multiline text", () => {
    const csv = buildVideosCsv([video({
      title: 'Fictional, "Title"',
      notes: "Line one\nLine two",
    })], { locale: "en-US" });
    const parsed = parseCsv(csv);
    expect(parsed.rows[0][parsed.headers.indexOf("Title")]).toBe('Fictional, "Title"');
    expect(parsed.rows[0][parsed.rows[0].length - 1]).toBe("Line one\nLine two");
  });

  it("exports Glossary through the same Action and identifier contract", () => {
    const csv = buildEntityCsv("glossary", [glossary()]);
    expect(csv).toContain("Action,Sakurava Ref,Term,Definition,Parent Ref,Synonyms");
    expect(csv).toContain("Auto,GLO-");
    expect(csv).toContain("Fictional glossary definition");
  });

  it("converts current relationship keys to Sakurava Refs before export", () => {
    const prepared = prepareSelectionsWithPublicRefs([
      { dataType: "videos", records: [video({
        sakuravaRef: "V26070001",
        relatedPerformersJson: JSON.stringify([{ performerId: "performer-1", nameSnapshot: "One" }]),
        relatedImagesJson: JSON.stringify([{ recordId: "image-1", titleSnapshot: "Image One" }]),
        categoriesJson: JSON.stringify(["Drama"]),
      })] },
      { dataType: "images", records: [{
        id: "image-1", sakuravaRef: "I26070003", categoriesJson: JSON.stringify(["Drama"]),
        relatedVideosJson: JSON.stringify([{ recordId: "video-1", titleSnapshot: "Video" }]),
        relatedPerformersJson: JSON.stringify([{ performerId: "performer-1", nameSnapshot: "One" }]),
      }] },
      { dataType: "performers", records: [{
        id: "performer-1", sakuravaRef: "P26070007", categoriesJson: JSON.stringify(["Drama"]),
        relatedVideosJson: JSON.stringify([{ recordId: "video-1", titleSnapshot: "Video" }]),
        relatedImagesJson: JSON.stringify([{ recordId: "image-1", titleSnapshot: "Image One" }]),
      }] },
      { dataType: "categories", records: [{ key: "category-1", name: "Drama", sakuravaRef: "C26070004" }] },
    ]);
    const exportedVideo = prepared[0].records[0] as Video;
    const exportedImage = prepared[1].records[0] as Image;
    const exportedPerformer = prepared[2].records[0] as Performer;
    expect(exportedVideo.relatedPerformersJson).toContain("P26070007");
    expect(exportedVideo.relatedImagesJson).toContain("I26070003");
    expect(exportedVideo.categoriesJson).toContain("C2607-0004 | Drama");
    expect(exportedImage.relatedVideosJson).toContain("V26070001");
    expect(exportedImage.relatedPerformersJson).toContain("P26070007");
    expect(exportedImage.categoriesJson).toContain("C2607-0004 | Drama");
    expect(exportedPerformer.relatedVideosJson).toContain("V26070001");
    expect(exportedPerformer.relatedImagesJson).toContain("I26070003");
    expect(exportedPerformer.categoriesJson).toContain("C2607-0004 | Drama");
    const csv = buildEntityCsv("videos", [exportedVideo]);
    expect(csv).toContain("P2607-0007 | One");
    expect(csv).toContain("I2607-0003 | Image One");
    expect(csv).toContain("C2607-0004 | Drama");
    expect(csv).not.toContain("performer-1");
    expect(csv).not.toContain("image-1");
    expect(csv).not.toContain("category-1");
  });

  it("uses informational explicit filename suffixes without changing per-section CSV output", () => {
    expect(defaultExportFileName(["videos", "images"], "xlsx", fixedDate, { explicit: true }))
      .toBe("skv-all-20261407-053825-e.xlsx");
    const artifacts = buildCsvExportArtifacts({
      selections: [{ dataType: "videos", records: [video()] }, { dataType: "credits", records: [] }],
      locale: "en-US",
      date: fixedDate,
      explicit: true,
    });
    expect(artifacts.map((artifact) => artifact.fileName)).toEqual([
      "skv-vid-20261407-053825-e.csv",
      "skv-cre-20261407-053825-e.csv",
    ]);
  });

  it("projects Safe-ON export visibility from direct R+ only and prunes hidden relationships", () => {
    const projected = projectSafeExportSelections([
      { dataType: "videos", records: [
        video({
          id: "linked-visible",
          rPlus: false,
          categoriesJson: JSON.stringify(["General", "Restricted"]),
          glossaryRefsJson: JSON.stringify(["glo-visible", "glo-r"]),
          relatedImagesJson: JSON.stringify([
            { recordId: "image-visible", titleSnapshot: "Visible" },
            { recordId: "image-direct", titleSnapshot: "Hidden" },
          ]),
        }),
        video({ id: "video-direct", rPlus: true }),
      ] },
      { dataType: "images", records: [
        { id: "image-visible", rPlus: false, categoriesJson: "[]", glossaryRefsJson: "[]", relatedPerformersJson: "[]", relatedVideosJson: "[]" },
        { id: "image-direct", rPlus: true, categoriesJson: "[]", glossaryRefsJson: "[]", relatedPerformersJson: "[]", relatedVideosJson: "[]" },
      ] },
      { dataType: "performers", records: [] },
      { dataType: "categories", records: [
        { key: "cat-visible", name: "General", rPlus: false },
        { key: "cat-r", name: "Restricted", rPlus: true },
      ] },
      { dataType: "glossary", records: [
        { id: "glo-visible", parentId: "", rPlus: false },
        { id: "glo-r", parentId: "", rPlus: true },
      ] },
      { dataType: "credits", records: [] },
    ], ["videos", "images", "performers", "categories", "glossary", "credits"]);

    const projectedVideo = projected[0].records[0] as Video;
    expect(projected[0].records).toHaveLength(1);
    expect(projectedVideo.id).toBe("linked-visible");
    expect(projectedVideo.categoriesJson).toBe('["General"]');
    expect(projectedVideo.glossaryRefsJson).toBe('["glo-visible"]');
    expect(projectedVideo.relatedImagesJson).toContain("image-visible");
    expect(projectedVideo.relatedImagesJson).not.toContain("image-direct");
    expect(projected[1].records).toHaveLength(1);
    expect(projected[3].records).toHaveLength(1);
    expect(projected[4].records).toHaveLength(1);
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
type SupportedRecords = Video | Image | Performer | ManagedCategory | GlossaryEntry | Credit;
const _supportedDataTypes: Record<ExportCsvEntity, SupportedRecords | null> = {
  videos: null, images: null, performers: null, categories: null, glossary: null, credits: null,
};
void _supportedDataTypes;

function glossary(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: "glossary-1", term: "Fictional Term", definition: "Fictional glossary definition",
    synonymsJson: "[]", category: "", parentId: "", thumbnailPath: "", favorite: false,
    sourceTitle: "", sourceUrl: "", createdAt: 0, updatedAt: 0, ...overrides,
  };
}
