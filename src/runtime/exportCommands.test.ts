import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import {
  defaultExportCsvFileName,
  localFileTimestamp,
  writeExportArtifact,
  writeExportArtifactSet,
} from "./exportCommands";

describe("export command filenames", () => {
  it("uses local PC date components for skv CSV export names", () => {
    const localDate = new Date(2026, 4, 20, 14, 30, 12);

    expect(localFileTimestamp(localDate)).toBe("20262005-143012");
    expect(defaultExportCsvFileName("videos", localDate)).toBe(
      "skv-vid-20262005-143012.csv",
    );
    expect(defaultExportCsvFileName("images", localDate)).toBe(
      "skv-img-20262005-143012.csv",
    );
    expect(defaultExportCsvFileName("performers", localDate)).toBe(
      "skv-per-20262005-143012.csv",
    );
    expect(defaultExportCsvFileName("categories", localDate)).toBe(
      "skv-cat-20262005-143012.csv",
    );
  });

  afterEach(() => {
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("writes one artifact through the no-overwrite runtime command", async () => {
    const invoke = vi.fn().mockResolvedValue({
      destinationPath: "D:/Exports/skv-vid.xlsx",
      displayName: "skv-vid.xlsx",
      bytesWritten: 3,
      success: true,
    });
    (globalThis as any).__TAURI_INTERNALS__ = { invoke };
    await writeExportArtifact("D:/Exports/skv-vid.xlsx", {
      dataTypes: ["videos"], format: "xlsx", fileName: "skv-vid.xlsx",
      bytes: new Uint8Array([1, 2, 3]), recordCounts: { videos: 1 }, template: false,
    });
    expect(invoke).toHaveBeenCalledWith("export_file_write", {
      destinationPath: "D:/Exports/skv-vid.xlsx",
      bytes: [1, 2, 3],
      expectedExtension: "xlsx",
    }, undefined);
  });

  it("writes a multi-type CSV set to one selected folder", async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    (globalThis as any).__TAURI_INTERNALS__ = { invoke };
    await writeExportArtifactSet("D:/Exports", [
      { dataTypes: ["videos"], format: "csv", fileName: "one.csv", bytes: new Uint8Array([1]), recordCounts: { videos: 0 }, template: true },
      { dataTypes: ["images"], format: "csv", fileName: "two.csv", bytes: new Uint8Array([2]), recordCounts: { images: 0 }, template: true },
    ]);
    expect(invoke).toHaveBeenCalledWith("export_file_set_write", {
      destinationFolder: "D:/Exports",
      files: [
        { fileName: "one.csv", bytes: [1] },
        { fileName: "two.csv", bytes: [2] },
      ],
    }, undefined);
  });
});
