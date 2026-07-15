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

describe("XLSX export and templates", () => {
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
    expect(sheet.getCell("F2").value).toBeInstanceOf(Date);
    expect(sheet.getCell("A2").dataValidation.formulae?.[0]).toContain("Create");
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

    workbook.getWorksheet("Videos")!.getCell("D2").value = "User-edited title";
    const reloaded = await parseWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
    );
    expect(reloaded.getWorksheet(SAKURAVA_METADATA_SHEET)!.state).toBe("veryHidden");
    expect(reloaded.getWorksheet(SAKURAVA_METADATA_SHEET)!.getCell("A1").value)
      .toBe(expectedMetadata);
    expect(reloaded.getWorksheet("Videos")!.getCell("D2").value)
      .toBe("User-edited title");
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

  it("isolates template examples from the headers-only Data sheet", async () => {
    const result = await buildXlsxWorkbook({
      selections: [{ dataType: "videos", records: [] }],
      locale: "en-US",
      template: true,
    });
    const workbook = await parseWorkbook(result.bytes);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "__SakuravaMetadata", "Instructions", "Data", "Examples",
    ]);
    expect(workbook.getWorksheet("Data")!.rowCount).toBe(1);
    const examples = workbook.getWorksheet("Examples")!;
    expect(examples.getCell("A1").value).toContain("EXAMPLES ONLY");
    expect([3, 4, 5, 6].map((row) => examples.getCell(row, 1).value))
      .toEqual(["Auto", "Auto", "Delete", "Skip"]);
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
    expect(sheet.getCell("F2").value).toBe("");
    expect(sheet.getCell("F3").value).toBe("invalid");
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
