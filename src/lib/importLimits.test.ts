import { describe, expect, it } from "vitest";
import { buildXlsxCatalogPreview } from "./importCatalog";
import { buildVideosCsv } from "./exportCsv";
import { buildImportCsvPreview } from "./importCsvPreview";
import {
  IMPORT_MAX_CELL_CHARACTERS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_PREVIEW_ROWS,
  IMPORT_MAX_ROWS_PER_SECTION,
  IMPORT_MAX_TOTAL_ROWS,
  IMPORT_MAX_WORKSHEETS,
} from "./importLimits";

describe("catalog import bounds", () => {
  it("rejects files before workbook parsing when they exceed 25 MB", async () => {
    const preview = await buildXlsxCatalogPreview(
      new Uint8Array(IMPORT_MAX_FILE_BYTES + 1),
      context(),
      "en-US",
    );
    expect(preview.summary.blocked).toBe(true);
    expect(preview.headerErrors).toContain("Choose a Sakurava import file no larger than 25 MB.");
  });

  it("rejects workbooks with more than 16 worksheets", async () => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    for (let index = 0; index < IMPORT_MAX_WORKSHEETS + 1; index += 1) {
      workbook.addWorksheet(index === 0 ? "Videos" : `Extra ${index}`)
        .addRow(buildVideosCsv([]).split(","));
    }
    const preview = await buildXlsxCatalogPreview(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      context(),
      "en-US",
    );
    expect(preview.summary.blocked).toBe(true);
    expect(preview.headerErrors).toContain("This workbook has too many worksheets. Use 16 or fewer.");
  });

  it("rejects oversized cells with concise guidance", () => {
    const headers = buildVideosCsv([]).split(",");
    const row = headers.map((header) => header === "Title"
      ? "x".repeat(IMPORT_MAX_CELL_CHARACTERS + 1)
      : header === "Action" ? "Create" : "");
    const preview = buildImportCsvPreview(
      `${headers.join(",")}\r\n${row.join(",")}`,
      context(),
    );
    expect(preview.summary.blocked).toBe(true);
    expect(preview.headerErrors).toContain(
      "A cell exceeds Excel's 32,767-character limit. Shorten that value and review the file again.",
    );
  });

  it("rejects rows beyond the per-section bound without retaining Preview rows", () => {
    const header = "Action,Sakurava Ref,Title";
    const rows = Array.from(
      { length: IMPORT_MAX_ROWS_PER_SECTION + 1 },
      (_, index) => `Create,,Video ${index}`,
    );
    const preview = buildImportCsvPreview([header, ...rows].join("\n"), context());
    expect(preview.summary.blocked).toBe(true);
    expect(preview.rows).toHaveLength(0);
    expect(preview.headerErrors).toContain(
      "A data section exceeds 25,000 rows. Split it into smaller imports.",
    );
  });

  it("keeps total and retained Preview limits explicit and bounded", () => {
    expect(IMPORT_MAX_TOTAL_ROWS).toBe(50_000);
    expect(IMPORT_MAX_PREVIEW_ROWS).toBe(IMPORT_MAX_TOTAL_ROWS);
    expect(IMPORT_MAX_ROWS_PER_SECTION).toBeLessThanOrEqual(IMPORT_MAX_PREVIEW_ROWS);
  });
});

function context() {
  return { videos: [], images: [], performers: [], categories: [], glossary: [], credits: [] };
}
