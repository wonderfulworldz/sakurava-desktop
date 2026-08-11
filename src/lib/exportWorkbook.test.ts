import { describe, expect, it } from "vitest";
import type { GlossaryEntry, Video } from "../backend/types";
import {
  buildXlsxWorkbook,
  excelDateNumberFormat,
  excelDateTimeNumberFormat,
} from "./exportWorkbook";
import {
  buildWorkbookMetadata,
  SAKURAVA_METADATA_SHEET,
  stableContractJson,
} from "./importExportContract";
import { EXPORT_EXAMPLE_SENTINEL } from "./exportCsv";

describe("XLSX export", () => {
  it("builds a single-type workbook with Instructions and the correct data sheet", async () => {
    const result = await buildXlsxWorkbook({
      selections: [{ dataType: "videos", records: [video()] }],
      locale: "en-GB",
    });
    const workbook = await parseWorkbook(result.bytes);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["__SakuravaMetadata", "Instructions", "Videos"]);
    expect(workbook.getWorksheet("__SakuravaMetadata")!.state).toBe("veryHidden");
    const sheet = workbook.getWorksheet("Videos")!;
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(1).values).toEqual(expect.arrayContaining(["Action", "Sakurava Ref", "Title"]));
    expect(sheet.getCell("A2").value).toBe("Auto");
    expect(sheet.getCell("B2").numFmt).toBe("@");
    expect(sheet.getCell(2, columnNumber(sheet, "Release Date")).value).toBeInstanceOf(Date);
    expect(sheet.getCell("A2").dataValidation.formulae?.[0]).toContain("Add");
  });

  it("builds a multi-type workbook with only selected data sheets", async () => {
    const result = await buildXlsxWorkbook({
      selections: [
        { dataType: "videos", records: [video()] },
        { dataType: "performers", records: [] },
      ],
      locale: "en-US",
    });
    const workbook = await parseWorkbook(result.bytes);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "__SakuravaMetadata", "Instructions", "Videos", "Performers",
    ]);
    expect(workbook.getWorksheet("Images")).toBeUndefined();
    expect(workbook.getWorksheet("Managed Categories")).toBeUndefined();
    const performers = workbook.getWorksheet("Performers")!;
    expect(performers.rowCount).toBe(2);
    expect(performers.getRow(1).values).toEqual(expect.arrayContaining([
      "Action", "Sakurava Ref", "Name",
    ]));
  });

  it("builds a selected empty worksheet with normal headers and one ignored example row", async () => {
    const result = await buildXlsxWorkbook({
      selections: [{ dataType: "images", records: [] }],
      locale: "en-US",
    });
    const workbook = await parseWorkbook(result.bytes);
    const images = workbook.getWorksheet("Images")!;
    expect(images.rowCount).toBe(2);
    expect(images.getRow(1).values).toEqual(expect.arrayContaining([
      "Action", "Sakurava Ref", "Title",
    ]));
    expect(images.getCell("A2").value).toBe(EXPORT_EXAMPLE_SENTINEL);
  });

  it("omits sensitive schema columns from a Safe export workbook", async () => {
    const workbook = await parseWorkbook((await buildXlsxWorkbook({
      selections: [{ dataType: "performers", records: [] }],
      locale: "en-US",
      safeExport: true,
    })).bytes);
    const headers = workbook.getWorksheet("Performers")!.getRow(1).values;
    expect(headers).not.toEqual(expect.arrayContaining(["R+", "Measurements", "Cup Size"]));
  });

  it("preserves deterministic very-hidden metadata through edit and save/read-back", async () => {
    const generatedAt = new Date("2026-07-15T01:02:03.000Z");
    const result = await buildXlsxWorkbook({
      selections: [{ dataType: "videos", records: [video()] }],
      locale: "en-US",
      generatedAt,
    });
    const workbook = await parseWorkbook(result.bytes);
    const expectedMetadata = stableContractJson(buildWorkbookMetadata({
      dataTypes: ["videos"],
      generatedAt,
      template: false,
    }));
    expect(workbook.getWorksheet(SAKURAVA_METADATA_SHEET)!.state).toBe("veryHidden");
    expect(workbook.getWorksheet(SAKURAVA_METADATA_SHEET)!.getCell("A1").value)
      .toBe(expectedMetadata);

    workbook.getWorksheet("Videos")!.getCell(2, columnNumber(workbook.getWorksheet("Videos")!, "Title")).value = "User-edited title";
    const reloaded = await parseWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
    );
    expect(reloaded.getWorksheet(SAKURAVA_METADATA_SHEET)!.state).toBe("veryHidden");
    expect(reloaded.getWorksheet(SAKURAVA_METADATA_SHEET)!.getCell("A1").value)
      .toBe(expectedMetadata);
    expect(reloaded.getWorksheet("Videos")!.getCell(2, columnNumber(reloaded.getWorksheet("Videos")!, "Title")).value)
      .toBe("User-edited title");
  });

  it("writes catalog metadata for populated and empty workbooks", async () => {
    const generatedAt = new Date("2026-07-15T01:02:03.000Z");
    const multi = await parseWorkbook((await buildXlsxWorkbook({
      selections: [
        { dataType: "videos", records: [video()] },
        { dataType: "glossary", records: [glossary()] },
      ],
      locale: "en-US",
      generatedAt,
    })).bytes);
    const multiMetadata = JSON.parse(String(
      multi.getWorksheet(SAKURAVA_METADATA_SHEET)!.getCell("A1").value,
    ));
    expect(multiMetadata).toMatchObject({
      applicationId: "app.sakurava.desktop",
      contractVersion: 3,
      exportFormatVersion: 3,
      includedDataTypes: ["videos", "glossary"],
      workbookType: "catalog",
    });
    expect(multi.getWorksheet(SAKURAVA_METADATA_SHEET)!.state).toBe("veryHidden");

    const empty = await parseWorkbook((await buildXlsxWorkbook({
      selections: [{ dataType: "videos", records: [] }],
      locale: "en-US",
      generatedAt,
    })).bytes);
    const emptyMetadata = JSON.parse(String(
      empty.getWorksheet(SAKURAVA_METADATA_SHEET)!.getCell("A1").value,
    ));
    expect(emptyMetadata).toMatchObject({
      contractVersion: 3,
      includedDataTypes: ["videos"],
      workbookType: "catalog",
    });
    expect(empty.getWorksheet(SAKURAVA_METADATA_SHEET)!.state).toBe("veryHidden");
  });

  it("builds a Glossary worksheet through the shared workbook contract", async () => {
    const result = await buildXlsxWorkbook({
      selections: [{ dataType: "glossary", records: [glossary()] }],
      locale: "en-US",
    });
    const workbook = await parseWorkbook(result.bytes);
    const sheet = workbook.getWorksheet("Glossary")!;
    expect(sheet.getRow(1).values).toEqual(expect.arrayContaining([
      "Action", "Sakurava Ref", "Term", "Definition", "Synonyms",
    ]));
    expect(sheet.getCell("A2").value).toBe("Auto");
    expect(sheet.getCell("B2").value).toMatch(/^GLO-/);
  });

  it("keeps populated worksheets free of example rows", async () => {
    const result = await buildXlsxWorkbook({
      selections: [{ dataType: "videos", records: [video()] }],
      locale: "en-US",
    });
    const workbook = await parseWorkbook(result.bytes);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "__SakuravaMetadata", "Instructions", "Videos",
    ]);
    expect(workbook.getWorksheet("Videos")!.rowCount).toBe(2);
    expect(workbook.getWorksheet("Videos")!.getCell("A2").value).toBe("Auto");
  });

  it("keeps empty dates empty and invalid values as visible text", async () => {
    const result = await buildXlsxWorkbook({
      selections: [{
        dataType: "videos",
        records: [video({ releaseDate: "" }), video({ id: "video-2", releaseDate: "invalid" })],
      }],
      locale: "en-US",
    });
    const workbook = await parseWorkbook(result.bytes);
    const sheet = workbook.getWorksheet("Videos")!;
    const releaseDateColumn = columnNumber(sheet, "Release Date");
    expect(sheet.getCell(2, releaseDateColumn).value).toBe("");
    expect(sheet.getCell(3, releaseDateColumn).value).toBe("invalid");
  });

  it("derives local Excel date and time formats for day/month and 12/24-hour locales", () => {
    expect(excelDateNumberFormat("en-GB")).toBe("d/m/yyyy");
    expect(excelDateNumberFormat("en-US")).toBe("m/d/yyyy");
    expect(excelDateTimeNumberFormat("en-US")).toContain("AM/PM");
    expect(excelDateTimeNumberFormat("en-GB")).not.toContain("AM/PM");
  });
});

async function parseWorkbook(bytes: Uint8Array) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  return workbook;
}

function columnNumber(sheet: import("exceljs").Worksheet, header: string) {
  const values = sheet.getRow(1).values as unknown[];
  const index = values.findIndex((value) => value === header);
  if (index < 1) throw new Error(`Missing header: ${header}`);
  return index;
}

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "video-1", title: "Fictional Video", originalTitle: "", code: "VID-001",
    censorship: "", availability: "", releaseDate: "2026-02-01",
    durationMinutes: null, resolution: "", fileSizeBytes: null, fileType: "",
    publisherLabel: "", coverPath: "", mediaPath: "", categoriesJson: "[]",
    relatedPerformersJson: "[]", relatedImagesJson: "[]", sourceLinksJson: "[]",
    ratingJson: "{}", notes: "", favorite: false, createdAt: "", updatedAt: "",
    ...overrides,
  };
}

function glossary(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: "glossary-1", term: "Fictional term", definition: "Fictional definition",
    synonymsJson: '["Alias"]', category: "", parentId: "", thumbnailPath: "",
    favorite: false, sourceTitle: "", sourceUrl: "", createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}
