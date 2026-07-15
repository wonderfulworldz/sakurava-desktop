import { describe, expect, it } from "vitest";
import type { GlossaryEntry, Video } from "../backend/types";
import { buildCsvCatalogPreview, buildXlsxCatalogPreview } from "./importCatalog";
import { buildGlossaryCsv, buildVideosCsv, sakuravaRef } from "./exportCsv";
import { buildXlsxWorkbook, EXPORT_CONTRACT_VERSION } from "./exportWorkbook";
import { SAKURAVA_METADATA_SHEET } from "./importExportContract";

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

  it("blocks unsupported metadata versions, duplicate data sheets, and formula errors", async () => {
    const built = await buildXlsxWorkbook({
      selections: [{ dataType: "videos", records: [video()] }],
      locale: "en-US",
      generatedAt: new Date("2026-07-15T01:02:03Z"),
    });
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(built.bytes as unknown as ArrayBuffer);
    const metadata = JSON.parse(String(workbook.getWorksheet(SAKURAVA_METADATA_SHEET)!.getCell("A1").value));
    metadata.contractVersion = 99;
    workbook.getWorksheet(SAKURAVA_METADATA_SHEET)!.getCell("A1").value = JSON.stringify(metadata);
    workbook.getWorksheet("Videos")!.getCell("D2").value = { formula: "1/0", error: "#DIV/0!" } as any;
    const duplicate = workbook.addWorksheet("Data");
    duplicate.addRow(buildVideosCsv([]).split(","));
    const preview = await buildXlsxCatalogPreview(
      new Uint8Array(await workbook.xlsx.writeBuffer()), context(), "en-US",
    );
    expect(preview.headerErrors.join(" ")).toContain("contract version is not supported");
    expect(preview.headerErrors.join(" ")).toContain("Duplicate Videos worksheets");
    expect(preview.headerErrors.join(" ")).toContain("unreadable formula or error cell");
    expect(preview.summary.blocked).toBe(true);
  });

  it("reports missing, exposed, and data-sheet metadata collisions deterministically", async () => {
    const built = await buildXlsxWorkbook({
      selections: [{ dataType: "videos", records: [] }],
      locale: "en-US",
      generatedAt: new Date("2026-07-15T01:02:03Z"),
    });
    const ExcelJS = await import("exceljs");

    const missing = new ExcelJS.Workbook();
    await missing.xlsx.load(built.bytes as unknown as ArrayBuffer);
    missing.removeWorksheet(missing.getWorksheet(SAKURAVA_METADATA_SHEET)!.id);
    const missingPreview = await buildXlsxCatalogPreview(
      new Uint8Array(await missing.xlsx.writeBuffer()), context(), "en-US",
    );
    expect(missingPreview.summary.blocked).toBe(false);
    expect(missingPreview.headerWarnings).toContain(
      "Sakurava workbook metadata is missing; only explicitly named legacy data sheets can be validated.",
    );

    const exposed = new ExcelJS.Workbook();
    await exposed.xlsx.load(built.bytes as unknown as ArrayBuffer);
    exposed.getWorksheet(SAKURAVA_METADATA_SHEET)!.state = "visible";
    const exposedPreview = await buildXlsxCatalogPreview(
      new Uint8Array(await exposed.xlsx.writeBuffer()), context(), "en-US",
    );
    expect(exposedPreview.headerErrors).toContain(
      "Sakurava workbook metadata sheet visibility was modified.",
    );

    const collision = new ExcelJS.Workbook();
    collision.addWorksheet(SAKURAVA_METADATA_SHEET).addRow(buildVideosCsv([]).split(","));
    collision.addWorksheet("Videos").addRow(buildVideosCsv([]).split(","));
    const collisionPreview = await buildXlsxCatalogPreview(
      new Uint8Array(await collision.xlsx.writeBuffer()), context(), "en-US",
    );
    expect(collisionPreview.headerErrors).toContain("Sakurava workbook metadata is malformed.");
    expect(collisionPreview.rows).toHaveLength(0);
  });

  it("blocks duplicate and unsupported CSV headers while retaining exact-header compatibility", () => {
    const compatible = buildVideosCsv([]);
    expect(buildCsvCatalogPreview(compatible, context(), "en-US").summary.blocked).toBe(false);
    const duplicate = compatible.replace("Title,", "Title,Title,");
    expect(buildCsvCatalogPreview(duplicate, context(), "en-US").headerErrors.join(" "))
      .toContain("Duplicate headers");
    const unsupported = compatible.replace("Notes", "Notes,Unexpected");
    expect(buildCsvCatalogPreview(unsupported, context(), "en-US").headerErrors.join(" "))
      .toContain("Unsupported headers");
  });

  it("resolves same-file Glossary parent references and blocks cycles", () => {
    const headers = buildGlossaryCsv([]).split(",");
    const row = (ref: string, term: string, parent: string) => headers.map((header) => ({
      Action: "Auto", "Sakurava Ref": ref, Term: term, Definition: `${term} definition`, "Parent Ref": parent,
    })[header] ?? "").join(",");
    const valid = buildCsvCatalogPreview([
      headers.join(","),
      row("GLO-NEW-PARENT", "Parent", ""),
      row("GLO-NEW-CHILD", "Child", "GLO-NEW-PARENT"),
    ].join("\r\n"), context(), "en-US");
    expect(valid.summary.blocked).toBe(false);
    expect(valid.rows.map((item) => item.detectedResult)).toEqual(["Added", "Added"]);

    const circular = buildCsvCatalogPreview([
      headers.join(","),
      row("GLO-NEW-A", "A", "GLO-NEW-B"),
      row("GLO-NEW-B", "B", "GLO-NEW-A"),
    ].join("\r\n"), context(), "en-US");
    expect(circular.summary.blocked).toBe(true);
    expect(circular.rows.some((item) => item.errors.join(" ").includes("circular"))).toBe(true);
  });

  it("reserves unique GLO-NEW identifiers and blocks permanent or duplicate collisions", () => {
    const headers = buildGlossaryCsv([]).split(",");
    const row = (ref: string, term: string) => headers.map((header) => ({
      Action: "Auto", "Sakurava Ref": ref, Term: term, Definition: `${term} definition`,
    })[header] ?? "").join(",");
    const existing = glossary({ id: "GLO-NEW-RESERVED", term: "Existing permanent" });
    const exportedPermanentRef = buildGlossaryCsv([existing]).split("\r\n")[1].split(",")[1];
    expect(exportedPermanentRef).toBe(sakuravaRef("GLO", existing.id));
    expect(exportedPermanentRef).not.toMatch(/^GLO-NEW-/);
    const permanentCollision = buildCsvCatalogPreview([
      headers.join(","),
      row("GLO-NEW-RESERVED", "New row"),
    ].join("\r\n"), { ...context(), glossary: [existing] }, "en-US");
    expect(permanentCollision.summary.blocked).toBe(true);
    expect(permanentCollision.rows[0].errors).toContain(
      "Temporary Glossary identifier conflicts with an existing permanent record.",
    );

    const duplicate = buildCsvCatalogPreview([
      headers.join(","),
      row("GLO-NEW-DUPLICATE", "First"),
      row("GLO-NEW-DUPLICATE", "Second"),
    ].join("\r\n"), context(), "en-US");
    expect(duplicate.summary.blocked).toBe(true);
    expect(duplicate.rows.every((item) => item.errors.some((error) => error.includes("Duplicate Sakurava Ref"))))
      .toBe(true);
  });

  it("blocks deleting a Glossary parent while a child remains", () => {
    const parent = glossary({ id: "glossary-parent", term: "Parent" });
    const child = glossary({ id: "glossary-child", term: "Child", parentId: parent.id });
    const csv = buildGlossaryCsv([parent]).replace("\r\nAuto,", "\r\nDelete,");
    const preview = buildCsvCatalogPreview(csv, { ...context(), glossary: [parent, child] }, "en-US");
    expect(preview.summary.blocked).toBe(true);
    expect(preview.rows[0].errors).toContain("Glossary record cannot be deleted while child records use it.");
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
