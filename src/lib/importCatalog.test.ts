import { describe, expect, it } from "vitest";
import type { GlossaryEntry, Video } from "../backend/types";
import { buildCsvCatalogPreview, buildXlsxCatalogPreview } from "./importCatalog";
import { buildGlossaryCsv, buildVideosCsv } from "./exportCsv";
import { buildXlsxWorkbook, EXPORT_CONTRACT_VERSION } from "./exportWorkbook";

describe("catalog CSV/XLSX import preview", () => {
  it("keeps existing CSV import behavior and accepts local dates", () => {
    const csv = buildVideosCsv([video({ releaseDate: "2026-07-14" })], { locale: "en-GB" });
    const preview = buildCsvCatalogPreview(csv, { ...context(), videos: [video()] }, "en-GB");
    expect(preview.format).toBe("csv");
    expect(preview.sections[0].dataType).toBe("videos");
    expect(preview.rows[0].values["Release Date"]).toBe("2026-07-14");
    expect(preview.rows[0].errors).toEqual([]);
  });

  it("ignores Instructions and Examples and parses an identified Data sheet", async () => {
    const built = await buildXlsxWorkbook({
      selections: [{ dataType: "videos", records: [] }],
      locale: "en-GB",
      template: true,
    });
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(built.bytes as unknown as ArrayBuffer);
    const data = workbook.getWorksheet("Data")!;
    data.addRow(["Create", "", "V-001", "New Video", "", new Date(2026, 6, 14)]);
    const preview = await buildXlsxCatalogPreview(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      context(),
      "en-GB",
    );
    expect(preview.sections).toHaveLength(1);
    expect(preview.sections[0]).toMatchObject({ dataType: "videos", sheetName: "Data" });
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].values["Release Date"]).toBe("2026-07-14");
    expect(preview.rows[0].detectedResult).toBe("Added");
  });

  it("parses every supported named sheet in a multi-sheet workbook", async () => {
    const built = await buildXlsxWorkbook({
      selections: [
        { dataType: "videos", records: [video()] },
        { dataType: "images", records: [] },
        { dataType: "performers", records: [] },
      ],
      locale: "en-US",
    });
    const preview = await buildXlsxCatalogPreview(built.bytes, context(), "en-US");
    expect(preview.sections.map((section) => section.sheetName)).toEqual([
      "Videos", "Images", "Performers",
    ]);
    expect(preview.rows.every((row) => row.sheetName !== "Instructions")).toBe(true);
  });

  it("converts numeric Excel dates only when date-formatted", async () => {
    const formatted = await numericDateWorkbook("m/d/yyyy");
    const valid = await buildXlsxCatalogPreview(formatted, context(), "en-US");
    expect(valid.rows[0].values["Release Date"]).toBe("2026-07-02");
    expect(valid.rows[0].errors).toEqual([]);

    const ordinaryNumber = await numericDateWorkbook("0");
    const invalid = await buildXlsxCatalogPreview(ordinaryNumber, context(), "en-US");
    expect(invalid.rows[0].errors[0]).toContain("Enter a valid date");
  });

  it("ignores unknown sheets when a supported sheet exists and blocks arbitrary workbooks", async () => {
    const ExcelJS = await import("exceljs");
    const supported = new ExcelJS.Workbook();
    supported.description = `${EXPORT_CONTRACT_VERSION}; dataTypes=videos`;
    supported.addWorksheet("Notes").addRow(["not data"]);
    supported.addWorksheet("Videos").addRow(buildVideosCsv([]).split(","));
    const supportedPreview = await buildXlsxCatalogPreview(
      new Uint8Array(await supported.xlsx.writeBuffer()), context(), "en-US",
    );
    expect(supportedPreview.headerWarnings.join(" ")).toContain("Ignored unsupported worksheet: Notes");
    expect(supportedPreview.headerErrors).toEqual([]);

    const arbitrary = new ExcelJS.Workbook();
    arbitrary.addWorksheet("Anything").addRow(["hello"]);
    const blocked = await buildXlsxCatalogPreview(
      new Uint8Array(await arbitrary.xlsx.writeBuffer()), context(), "en-US",
    );
    expect(blocked.summary.blocked).toBe(true);
    expect(blocked.headerErrors.join(" ")).toContain("No supported Sakurava data worksheets");
  });

  it("makes unsupported Actions blocking", async () => {
    const bytes = await videoWorkbookRow(["Bogus", "", "", "Bad Action"]);
    const preview = await buildXlsxCatalogPreview(bytes, context(), "en-US");
    expect(preview.rows[0].errors).toContain("Unknown Action: Bogus.");
    expect(preview.summary.blocked).toBe(true);
  });

  it("parses exported Glossary worksheets and ignores Instructions", async () => {
    const entry = glossary();
    const built = await buildXlsxWorkbook({
      selections: [{ dataType: "glossary", records: [entry] }],
      locale: "en-US",
    });
    const preview = await buildXlsxCatalogPreview(
      built.bytes,
      { ...context(), glossary: [entry] },
      "en-US",
    );
    expect(preview.sections).toHaveLength(1);
    expect(preview.sections[0]).toMatchObject({ dataType: "glossary", sheetName: "Glossary" });
    expect(preview.rows[0]).toMatchObject({ dataType: "glossary", detectedResult: "Unchanged" });
    expect(preview.rows.every((row) => row.sheetName !== "Instructions")).toBe(true);
  });

  it("identifies a Glossary template Data sheet from workbook metadata and ignores Examples", async () => {
    const built = await buildXlsxWorkbook({
      selections: [{ dataType: "glossary", records: [] }],
      locale: "en-US",
      template: true,
    });
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(built.bytes as unknown as ArrayBuffer);
    const headers = buildGlossaryCsv([]).split(",");
    workbook.getWorksheet("Data")!.addRow(headers.map((header) => ({
      Action: "Auto", Term: "Created Term", Definition: "Created definition",
    })[header] ?? ""));
    const preview = await buildXlsxCatalogPreview(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      context(),
      "en-US",
    );
    expect(preview.sections[0]).toMatchObject({ dataType: "glossary", sheetName: "Data" });
    expect(preview.rows[0]).toMatchObject({ dataType: "glossary", detectedResult: "Added" });
    expect(preview.rows.every((row) => row.sheetName !== "Examples")).toBe(true);
  });
});

async function numericDateWorkbook(numberFormat: string) {
  const bytes = await videoWorkbookRow(["Create", "", "V-001", "Numeric Date", "", 46205]);
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  workbook.getWorksheet("Videos")!.getCell("F2").numFmt = numberFormat;
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function videoWorkbookRow(row: Array<string | number>) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.description = `${EXPORT_CONTRACT_VERSION}; dataTypes=videos`;
  const sheet = workbook.addWorksheet("Videos");
  sheet.addRow(buildVideosCsv([]).split(","));
  sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function context() {
  return { videos: [], images: [], performers: [], categories: [] };
}

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "video-1", title: "Video", originalTitle: "", code: "", censorship: "",
    availability: "", releaseDate: "2026-07-14", durationMinutes: null,
    resolution: "", fileSizeBytes: null, fileType: "", publisherLabel: "",
    coverPath: "", mediaPath: "", categoriesJson: "[]", relatedPerformersJson: "[]",
    relatedImagesJson: "[]", sourceLinksJson: "[]", ratingJson: "{}", notes: "",
    favorite: false, createdAt: "", updatedAt: "", ...overrides,
  };
}

function glossary(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: "glossary-1", term: "Term", definition: "Definition", synonymsJson: "[]",
    category: "", parentId: "", thumbnailPath: "", favorite: false,
    sourceTitle: "", sourceUrl: "", createdAt: 1, updatedAt: 1, ...overrides,
  };
}
