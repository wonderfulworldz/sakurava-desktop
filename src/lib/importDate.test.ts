import { describe, expect, it } from "vitest";
import {
  isClearlyExcelDateFormat,
  localDateFormatHint,
  normalizeImportDate,
} from "./importDate";

describe("import date normalization", () => {
  it("parses day-first and month-first local numeric dates", () => {
    expect(normalizeImportDate("1/2/2026", { locale: "en-GB" }))
      .toEqual({ state: "valid", value: "2026-02-01" });
    expect(normalizeImportDate("1/2/2026", { locale: "en-US" }))
      .toEqual({ state: "valid", value: "2026-01-02" });
  });

  it("accepts local textual months and the stable fallback", () => {
    expect(normalizeImportDate("14 July 2026", { locale: "en-GB" }).value)
      .toBe("2026-07-14");
    expect(normalizeImportDate("July 14, 2026", { locale: "en-US" }).value)
      .toBe("2026-07-14");
    expect(normalizeImportDate("2026-07-14", { locale: "id-ID" }).value)
      .toBe("2026-07-14");
  });

  it("uses Date calendar parts without a UTC string conversion", () => {
    const date = new Date(2026, 6, 14, 23, 45);
    expect(normalizeImportDate(date, { locale: "en-US" }).value)
      .toBe("2026-07-14");
  });

  it("parses Excel serials only when the cell is date-formatted", () => {
    expect(normalizeImportDate(46205, {
      locale: "en-US",
      excelDateFormatted: true,
    }).value).toBe("2026-07-02");
    expect(normalizeImportDate(46205, {
      locale: "en-US",
      excelDateFormatted: false,
    }).state).toBe("invalid");
    expect(isClearlyExcelDateFormat("m/d/yyyy")).toBe(true);
    expect(isClearlyExcelDateFormat("0.00")).toBe(false);
  });

  it("supports the Excel 1904 date system", () => {
    expect(normalizeImportDate(0, {
      locale: "en-US",
      excelDateFormatted: true,
      excelDate1904: true,
    }).value).toBe("1904-01-01");
  });

  it("keeps empty values empty and rejects impossible dates", () => {
    expect(normalizeImportDate("", { locale: "en-GB" }))
      .toEqual({ state: "empty", value: "" });
    expect(normalizeImportDate("32/01/2026", { locale: "en-GB" }).state)
      .toBe("invalid");
    expect(normalizeImportDate("29/02/2025", { locale: "en-GB" }).state)
      .toBe("invalid");
  });

  it("describes the current computer date order", () => {
    expect(localDateFormatHint("en-GB")).toBe("DD/MM/YYYY");
    expect(localDateFormatHint("en-US")).toBe("MM/DD/YYYY");
  });
});
