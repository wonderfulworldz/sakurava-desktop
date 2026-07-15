import { describe, expect, it, vi } from "vitest";
import { runCatalogExport } from "./catalogExport";

const date = new Date(2026, 6, 14, 5, 38, 25);

describe("catalog export orchestration", () => {
  it("returns a structured cancelled result without writing", async () => {
    const writeOne = vi.fn();
    const result = await runCatalogExport({
      format: "xlsx",
      selections: [{ dataType: "videos", records: [] }],
      locale: "en-US",
      date,
      dependencies: {
        selectFile: vi.fn().mockResolvedValue(null),
        selectFolder: vi.fn(),
        writeOne,
        writeMany: vi.fn(),
      },
    });
    expect(result).toMatchObject({
      cancelled: true,
      format: "xlsx",
      selectedDataTypes: ["videos"],
      exportedFileCount: 0,
      recordCounts: { videos: 0 },
      errors: [],
    });
    expect(writeOne).not.toHaveBeenCalled();
  });

  it("returns structured multi-CSV success from one trusted folder", async () => {
    const selectFolder = vi.fn().mockResolvedValue("D:/Exports");
    const writeMany = vi.fn().mockResolvedValue({
      destinationPath: "D:/Exports",
      displayNames: ["skv-vid-20261407-053825.csv", "skv-img-20261407-053825.csv"],
      filesWritten: 2,
      bytesWritten: 10,
      success: true,
    });
    const result = await runCatalogExport({
      format: "csv",
      selections: [
        { dataType: "videos", records: [] },
        { dataType: "images", records: [] },
      ],
      locale: "en-US",
      date,
      dependencies: {
        selectFile: vi.fn(), selectFolder, writeOne: vi.fn(), writeMany,
      },
    });
    expect(selectFolder).toHaveBeenCalledOnce();
    expect(writeMany).toHaveBeenCalledWith("D:/Exports", expect.arrayContaining([
      expect.objectContaining({ fileName: "skv-vid-20261407-053825.csv" }),
      expect.objectContaining({ fileName: "skv-img-20261407-053825.csv" }),
    ]));
    expect(result).toMatchObject({
      cancelled: false,
      format: "csv",
      selectedDataTypes: ["videos", "images"],
      exportedFileCount: 2,
      errors: [],
    });
  });

  it("returns a structured error without pretending files were exported", async () => {
    const result = await runCatalogExport({
      format: "csv",
      selections: [{ dataType: "videos", records: [] }],
      locale: "en-US",
      date,
      dependencies: {
        selectFile: vi.fn().mockResolvedValue("D:/Exports/existing.csv"),
        selectFolder: vi.fn(),
        writeOne: vi.fn().mockRejectedValue(new Error("Export file already exists")),
        writeMany: vi.fn(),
      },
    });
    expect(result).toMatchObject({
      cancelled: false,
      exportedFileCount: 0,
      errors: ["Export file already exists"],
    });
  });
});
