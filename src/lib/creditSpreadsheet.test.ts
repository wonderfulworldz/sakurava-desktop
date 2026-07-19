import { describe, expect, it } from "vitest";
import type { Credit, Image, ManagedCategory, Performer, Video } from "../backend/types";
import { buildCsvExportArtifacts, buildXlsxExportArtifact, prepareSelectionsWithPublicRefs } from "./exportArtifacts";
import { creditCsvSchema, exportRowsFor, type CreditCsvRecord } from "./exportCsv";
import { buildCsvCatalogPreview } from "./importCatalog";
import { buildImportOperationPlan } from "./importOperationPlan";
import { buildXlsxWorkbook } from "./exportWorkbook";

const headers = [
  "Action", "Sakurava Ref", "Work Type", "Work Ref", "Performer Ref", "Character / Role",
  "Original Character", "Credited As Mode", "Credited As", "Credit Type", "Role Importance",
  "Character Mode", "Billing Order", "Note",
];

describe("Credits spreadsheet contract", () => {
  it("uses the stable cre code for single-category XLSX filenames without changing content", async () => {
    const artifact = await buildXlsxExportArtifact({
      selections: [{ dataType: "credits", records: [creditCsv({ id: "credit-a", sakuravaRef: "R26070001" })] }],
      locale: "en-US",
      date: new Date(2026, 6, 18, 10, 0, 0),
    });
    expect(artifact.fileName).toMatch(/^skv-cre-\d{8}-\d{6}\.xlsx$/);
    expect(artifact.fileName).not.toContain("credits");
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(artifact.bytes as unknown as ArrayBuffer);
    const headerValues = workbook.getWorksheet("Credits")?.getRow(1).values as unknown as unknown[];
    expect(headerValues.slice(1)).toEqual(headers);
  });

  it("exports the exact public headers, a timestamped cre artifact, and one row per Credit", () => {
    const rows: CreditCsvRecord[] = [creditCsv({ id: "credit-b", sakuravaRef: "R26070002" }), creditCsv({ id: "credit-a", sakuravaRef: "R26070001" })];
    const artifacts = buildCsvExportArtifacts({
      selections: [{ dataType: "credits", records: rows }],
      locale: "en-US",
      date: new Date(2026, 6, 18, 10, 0, 0),
    });
    expect(creditCsvSchema.map((column) => column.header)).toEqual(headers);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].fileName).toMatch(/^skv-cre-\d{8}-\d{6}\.csv$/);
    expect(artifacts[0].fileName).not.toContain("credits");
    const csv = new TextDecoder().decode(artifacts[0].bytes);
    const lines = csv.split("\r\n");
    expect(lines[0].split(",")).toEqual(headers);
    expect(lines).toHaveLength(3);
    // Canonical public R identity is exported and the technical id is not.
    expect(lines[1]).toContain("R2607-0001");
    expect(lines.join("\n")).not.toContain("credit-a");
  });

  it("writes a separate Credits XLSX sheet with public relationship Refs and no technical ids", async () => {
    const context = fixtureContext();
    const prepared = prepareSelectionsWithPublicRefs([
      { dataType: "videos", records: context.videos },
      { dataType: "performers", records: context.performers },
      { dataType: "categories", records: context.categories },
      { dataType: "credits", records: context.credits },
    ]);
    const workbookBytes = await buildXlsxWorkbook({ selections: prepared, locale: "en-US" });
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBytes.bytes as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Credits")!;
    expect(sheet.getRow(1).values).toEqual(expect.arrayContaining(headers));
    expect(sheet.getCell(2, 2).value).toBe("R2607-0001");
    expect(sheet.getCell(2, 4).value).toBe("V2607-0001");
    expect(sheet.getCell(2, 5).value).toBe("P2607-0001");
    expect(sheet.getCell(2, 10).value).toBe("Original");
    expect(sheet.getCell(2, 9).value).toBe("");
    expect(JSON.stringify(sheet.getRow(2).values)).not.toContain("credit-a");
    expect(JSON.stringify(sheet.getRow(2).values)).not.toContain("video-a");
    expect(JSON.stringify(sheet.getRow(2).values)).not.toContain("performer-a");
  });

  it("exports same-Performer Credits independently in deterministic R Ref order", () => {
    const records = [
      creditCsv({ id: "credit-c", sakuravaRef: "R26070003", creditTypeText: "Credit A" }),
      creditCsv({ id: "credit-a", sakuravaRef: "R26070001", creditTypeText: "Credit A" }),
      creditCsv({ id: "credit-b", sakuravaRef: "R26070002", creditTypeText: "Credit B" }),
      creditCsv({ id: "credit-d", sakuravaRef: "R26070004", creditTypeText: "Credit A" }),
      creditCsv({ id: "credit-e", sakuravaRef: "R26070005", creditTypeText: "Credit B" }),
    ];
    const rows = exportRowsFor("credits", records) as CreditCsvRecord[];
    expect(rows.map((record) => record.sakuravaRef)).toEqual([
      "R26070001", "R26070002", "R26070003", "R26070004", "R26070005",
    ]);
    expect(rows.filter((record) => record.performerRef === "P2607-0001")).toHaveLength(5);
    expect(rows.filter((record) => record.creditTypeText === "Credit A")).toHaveLength(3);
  });

  it("plans one independent Credit Update, Delete, and duplicate Add through the real Preview mapper", () => {
    const context = fixtureContext();
    const csv = [
      headers.join(","),
      row({ Action: "Update", "Sakurava Ref": "R2607-0001", "Credit Type": "Changed" }),
      row({ Action: "Delete", "Sakurava Ref": "R2607-0002" }),
      row({ Action: "Add", "Work Type": "Video", "Work Ref": "V2607-0001", "Performer Ref": "P2607-0001", "Character / Role": "Role", "Credited As Mode": "Auto", "Credit Type": "Original", "Character Mode": "Text", "Billing Order": "1" }),
    ].join("\r\n");
    const preview = buildCsvCatalogPreview(csv, context, "en-US");
    expect(preview.summary).toMatchObject({ create: 1, update: 1, delete: 1, blocked: false });
    expect(preview.rows[2].warnings).toContain("A logically duplicate Credit will be added as a separate record.");

    const plan = buildImportOperationPlan(preview, context, new TextEncoder().encode(csv), "2607");
    expect(plan.operations.filter((operation) => operation.action === "create")).toHaveLength(1);
    expect(plan.operations.filter((operation) => operation.action === "update")).toHaveLength(1);
    expect(plan.operations.filter((operation) => operation.action === "delete")).toHaveLength(1);
    const update = plan.operations.find((operation) => operation.action === "update");
    expect(update).toMatchObject({ section: "credits", recordId: "credit-a", proposedValues: { creditTypeText: "Changed" } });
    const create = plan.operations.find((operation) => operation.action === "create");
    expect(create?.proposedValues).toMatchObject({ workType: "video", workId: "video-a", performerId: "performer-a", creditTypeText: "Original" });
  });

  it("keeps an Add Ref non-authoritative while planning exactly one new Credit", () => {
    const context = fixtureContext();
    const csv = [
      headers.join(","),
      row({ Action: "Add", "Sakurava Ref": "R2607-9999", "Work Type": "Video", "Work Ref": "V2607-0001", "Performer Ref": "P2607-0001", "Character / Role": "New role", "Credited As Mode": "Auto", "Character Mode": "Text" }),
    ].join("\r\n");
    const preview = buildCsvCatalogPreview(csv, context, "en-US");
    expect(preview.rows[0]).toMatchObject({ detectedResult: "Added" });
    expect(preview.rows[0].warnings.join(" ")).toContain("entered Sakurava Ref will be ignored");
    const plan = buildImportOperationPlan(preview, context, new TextEncoder().encode(csv), "2607");
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]).toMatchObject({ action: "create", section: "credits", recordId: null });
  });

  it("keeps unknown public Work references out of the operation plan", () => {
    const context = fixtureContext();
    const csv = [
      headers.join(","),
      row({ Action: "Add", "Work Type": "Video", "Work Ref": "V2607-9999", "Performer Ref": "P2607-0001", "Character / Role": "Role", "Credited As Mode": "Auto", "Character Mode": "Text" }),
    ].join("\r\n");
    const preview = buildCsvCatalogPreview(csv, context, "en-US");
    expect(preview.rows[0].detectedResult).toBe("Error");
    expect(preview.rows[0].errors).toContain("Work Ref was not found for the selected Work Type.");
    expect(buildImportOperationPlan(preview, context, new TextEncoder().encode(csv), "2607").operations).toHaveLength(0);
  });

  it.each([
    ["malformed Credit Ref", { Action: "Update", "Sakurava Ref": "R-invalid" }, "Sakurava Ref is not valid"],
    ["unknown Credit Ref", { Action: "Delete", "Sakurava Ref": "R2607-9999" }, "Sakurava Ref was not found"],
    ["wrong Credit Ref section", { Action: "Update", "Sakurava Ref": "V2607-0001" }, "Sakurava Ref is not valid"],
    ["unknown Performer Ref", { Action: "Add", "Work Type": "Video", "Work Ref": "V2607-0001", "Performer Ref": "P2607-9999" }, "Performer Ref was not found"],
    ["invalid Role Importance", { Action: "Add", "Work Type": "Video", "Work Ref": "V2607-0001", "Performer Ref": "P2607-0001", "Role Importance": "C2607-9999" }, "Role Importance Ref was not found"],
    ["invalid Credited As Mode", { Action: "Add", "Work Type": "Video", "Work Ref": "V2607-0001", "Performer Ref": "P2607-0001", "Credited As Mode": "Linked" }, "Credited As Mode is not supported"],
    ["invalid Character Mode", { Action: "Add", "Work Type": "Video", "Work Ref": "V2607-0001", "Performer Ref": "P2607-0001", "Character Mode": "Linked" }, "Character Mode is not supported"],
    ["invalid Billing Order", { Action: "Add", "Work Type": "Video", "Work Ref": "V2607-0001", "Performer Ref": "P2607-0001", "Billing Order": "0" }, "Billing Order must be a positive whole number"],
  ])("keeps %s out of the Credit operation plan", (_name, values, expectedError) => {
    const context = fixtureContext();
    const csv = [headers.join(","), row(values as Record<string, string>)].join("\r\n");
    const preview = buildCsvCatalogPreview(csv, context, "en-US");
    expect(preview.rows[0].detectedResult).toBe("Error");
    expect([...preview.rows[0].errors, ...preview.rows[0].warnings].join(" ")).toContain(expectedError);
    expect(buildImportOperationPlan(preview, context, new TextEncoder().encode(csv), "2607").operations).toHaveLength(0);
  });

  it("allows an explicit Credit Delete to free final-state capacity for one Add", () => {
    const context = fixtureContext();
    context.credits = Array.from({ length: 5 }, (_, index) => credit({
      id: `credit-${index + 1}`,
      sakuravaRef: `R2607000${index + 1}`,
      billingOrder: index + 1,
    }));
    const csv = [
      headers.join(","),
      row({ Action: "Delete", "Sakurava Ref": "R2607-0001" }),
      row({ Action: "Add", "Work Type": "Video", "Work Ref": "V2607-0001", "Performer Ref": "P2607-0001", "Character / Role": "Replacement", "Credited As Mode": "Auto", "Character Mode": "Text" }),
    ].join("\r\n");
    const preview = buildCsvCatalogPreview(csv, context, "en-US");
    expect(preview.rows.map((previewRow) => previewRow.detectedResult)).toEqual(["Deleted", "Added"]);
    expect(preview.rows.flatMap((previewRow) => previewRow.errors)).toEqual([]);
    const plan = buildImportOperationPlan(preview, context, new TextEncoder().encode(csv), "2607");
    expect(plan.operations.filter((operation) => operation.action === "delete")).toHaveLength(1);
    expect(plan.operations.filter((operation) => operation.action === "create")).toHaveLength(1);
  });

  it("rejects a sixth final-state Credit for the same Work and Performer", () => {
    const context = fixtureContext();
    context.credits = Array.from({ length: 5 }, (_, index) => credit({
      id: `credit-${index + 1}`,
      sakuravaRef: `R2607000${index + 1}`,
      billingOrder: index + 1,
    }));
    const csv = [
      headers.join(","),
      row({ Action: "Add", "Work Type": "Video", "Work Ref": "V2607-0001", "Performer Ref": "P2607-0001", "Character / Role": "Overflow", "Credited As Mode": "Auto", "Character Mode": "Text" }),
    ].join("\r\n");
    const preview = buildCsvCatalogPreview(csv, context, "en-US");
    expect(preview.rows[0].detectedResult).toBe("Error");
    expect(preview.rows[0].errors).toContain("A Work may have at most five Credits for the same Performer.");
    expect(buildImportOperationPlan(preview, context, new TextEncoder().encode(csv), "2607").operations).toEqual([]);
  });

  it("keeps an untouched public Credit export neutral when re-imported", () => {
    const context = fixtureContext();
    const prepared = prepareSelectionsWithPublicRefs([
      { dataType: "videos", records: context.videos },
      { dataType: "performers", records: context.performers },
      { dataType: "credits", records: context.credits },
    ]);
    const credits = prepared.find((selection) => selection.dataType === "credits")!.records as CreditCsvRecord[];
    const csv = buildCsvExportArtifacts({ selections: [{ dataType: "credits", records: credits }], locale: "en-US" })[0];
    const preview = buildCsvCatalogPreview(new TextDecoder().decode(csv.bytes), context, "en-US");
    expect(preview.rows.map((previewRow) => previewRow.detectedResult)).toEqual(["Unchanged", "Unchanged"]);
    expect(buildImportOperationPlan(preview, context, csv.bytes, "2607").operations).toEqual([]);
  });
});

function row(values: Record<string, string>) {
  return headers.map((header) => values[header] ?? "").join(",");
}

function fixtureContext() {
  const video: Video = {
    id: "video-a", sakuravaRef: "V26070001", title: "Smoke Video", originalTitle: "", code: "", censorship: "", availability: "", releaseDate: "", durationMinutes: null, resolution: "", fileSizeBytes: null, fileType: "", publisherLabel: "", coverPath: "", mediaPath: "", categoriesJson: "[]", ratingJson: "{}", sourceLinksJson: "[]", notes: "", favorite: false, relatedPerformersJson: "[]", relatedImagesJson: "[]", createdAt: "", updatedAt: "",
  };
  const performer: Performer = {
    id: "performer-a", sakuravaRef: "P26070001", name: "Smoke Performer", originalName: "", aliasesJson: "[]", categoriesJson: "[]", ratingJson: "{}", sourceLinksJson: "[]", notes: "", favorite: false, status: "Unknown", debutDate: "", retiredDate: "", birthDate: "", birthplace: "", nationality: "", bloodType: "", heightCm: null, weightKg: null, measurements: "", cupSize: "", coverPath: "", performerThumbnailPathsJson: "[]", filmographyCount: null, pictorialsCount: null, relatedVideosJson: "[]", relatedImagesJson: "[]", createdAt: "", updatedAt: "",
  };
  return {
    videos: [video], images: [] as Image[], performers: [performer], categories: [] as ManagedCategory[], glossary: [],
    credits: [credit({ id: "credit-a", sakuravaRef: "R26070001" }), credit({ id: "credit-b", sakuravaRef: "R26070002", billingOrder: 2 })],
  };
}

function credit(overrides: Partial<Credit> = {}): Credit {
  return {
    id: "credit-a", sakuravaRef: "R26070001", workType: "video", workId: "video-a", performerId: "performer-a", characterName: "Role", characterOriginalName: null, creditedAs: null, creditTypeText: "Original", creditedAsMode: "auto", creditTypeCategoryId: null, roleImportanceCategoryId: null, characterMode: "text", characterId: null, billingOrder: 1, note: null, legacySourceKey: null, createdAt: "", updatedAt: "", ...overrides,
  };
}

function creditCsv(overrides: Partial<CreditCsvRecord> = {}): CreditCsvRecord {
  return {
    ...credit(), workType: "Video", creditedAsMode: "Auto", characterMode: "Text", workRef: "V2607-0001", performerRef: "P2607-0001", roleImportanceRef: "", ...overrides,
  };
}
