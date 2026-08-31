import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLOBAL_OUTPUT_PREFERENCES,
  GLOBAL_OUTPUT_STORAGE_KEY,
  loadGlobalOutputPreferences,
  parseGlobalOutputPreferences,
  saveGlobalOutputPreferences,
} from "./globalOutputPreferences";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe("globalOutputPreferences", () => {
  it("uses an unconfigured machine-local default and rejects unsupported shapes", () => {
    expect(parseGlobalOutputPreferences(null)).toEqual(DEFAULT_GLOBAL_OUTPUT_PREFERENCES);
    expect(parseGlobalOutputPreferences({ version: 2, parentPath: "D:\\old" }))
      .toEqual(DEFAULT_GLOBAL_OUTPUT_PREFERENCES);
  });

  it("persists only an explicitly selected parent", () => {
    const storage = memoryStorage();
    expect(saveGlobalOutputPreferences({ version: 1, parentPath: " D:\\Outputs " }, storage)).toBe(true);
    expect(loadGlobalOutputPreferences(storage)).toEqual({ version: 1, parentPath: "D:\\Outputs" });
    expect(JSON.parse(storage.values.get(GLOBAL_OUTPUT_STORAGE_KEY)!)).toEqual({
      version: 1,
      parentPath: "D:\\Outputs",
    });
  });

  it("falls back safely when stored JSON is corrupt", () => {
    const storage = memoryStorage({ [GLOBAL_OUTPUT_STORAGE_KEY]: "{" });
    expect(loadGlobalOutputPreferences(storage)).toEqual(DEFAULT_GLOBAL_OUTPUT_PREFERENCES);
  });
});
