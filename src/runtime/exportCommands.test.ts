import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import {
  defaultExportCsvFileName,
  localFileTimestamp,
  writeExportArtifact,
  writeExportArtifactSet,
  writeTranslationRecoveryJson,
} from "./exportCommands";
import {
  createTranslationRecoveryExport,
  translationStorageKeys,
  type RawTranslationSnapshot,
} from "../lib/translationStorage";

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

  it("writes deterministic UTF-8 Translation recovery JSON through the safe no-overwrite writer", async () => {
    const invoke = vi.fn().mockResolvedValue({
      destinationPath: "D:/Recovery/translation.json",
      displayName: "translation.json",
      bytesWritten: 10,
      success: true,
    });
    (globalThis as any).__TAURI_INTERNALS__ = { invoke };
    const snapshot: RawTranslationSnapshot = {
      state: {
        [translationStorageKeys.selectedLanguage]: "id",
        [translationStorageKeys.customLanguages]: '[{"code":"id","label":"Bahasa"}]',
        [translationStorageKeys.languageOverrides]: '{"id":{"nav.home":"Beranda"}}',
      },
      journal: null,
    };
    const recovery = createTranslationRecoveryExport(snapshot);
    await expect(writeTranslationRecoveryJson("D:/Recovery/translation.json", recovery))
      .resolves.toMatchObject({ cancelled: false, success: true });
    expect(invoke).toHaveBeenCalledTimes(1);
    const [, args] = invoke.mock.calls[0];
    expect(invoke).toHaveBeenCalledWith("export_file_write", expect.objectContaining({
      destinationPath: "D:/Recovery/translation.json",
      expectedExtension: "json",
    }), undefined);
    const decoded = new TextDecoder().decode(new Uint8Array(args.bytes));
    expect(decoded.endsWith("\n")).toBe(true);
    expect(JSON.parse(decoded)).toMatchObject({
      schemaVersion: 1,
      snapshot: { state: { [translationStorageKeys.selectedLanguage]: "id" } },
    });
    expect(decoded).not.toContain("catalog");
  });

  it("does not invoke the writer when Translation recovery export is cancelled", async () => {
    const invoke = vi.fn();
    (globalThis as any).__TAURI_INTERNALS__ = { invoke };
    const snapshot: RawTranslationSnapshot = {
      state: {
        [translationStorageKeys.selectedLanguage]: null,
        [translationStorageKeys.customLanguages]: null,
        [translationStorageKeys.languageOverrides]: null,
      },
      journal: null,
    };
    await expect(writeTranslationRecoveryJson(null, createTranslationRecoveryExport(snapshot)))
      .resolves.toEqual({ cancelled: true });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("propagates Translation recovery JSON write failures", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("destination exists"));
    (globalThis as any).__TAURI_INTERNALS__ = { invoke };
    const snapshot: RawTranslationSnapshot = {
      state: {
        [translationStorageKeys.selectedLanguage]: null,
        [translationStorageKeys.customLanguages]: null,
        [translationStorageKeys.languageOverrides]: null,
      },
      journal: null,
    };
    await expect(writeTranslationRecoveryJson(
      "D:/Recovery/translation.json",
      createTranslationRecoveryExport(snapshot),
    )).rejects.toThrow("destination exists");
  });
});
