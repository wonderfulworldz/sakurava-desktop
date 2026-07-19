import { describe, expect, it } from "vitest";
import type { Credit, GlossaryEntry, Image, ManagedCategory, Performer, Video } from "../backend/types";
import { buildCsvCatalogPreview, buildXlsxCatalogPreview } from "./importCatalog";
import { buildCategoriesCsv, buildGlossaryCsv, buildVideosCsv, sakuravaRef } from "./exportCsv";
import { buildXlsxWorkbook, EXPORT_CONTRACT_VERSION } from "./exportWorkbook";
import { SAKURAVA_METADATA_SHEET } from "./importExportContract";
import { buildImportOperationPlan } from "./importOperationPlan";

describe("catalog CSV/XLSX import preview", () => {
  // This intentionally exercises the full XLSX write → load → Preview route
  // with 278 rows. Cold ExcelJS startup can take longer than Vitest's default
  // five seconds, while the scenario itself completes deterministically.
  it("builds the deterministic 278/273/5 Delete-all Preview plan", async () => {
    const categories = Array.from({ length: 5 }, (_, index) => managedCategory({
      key: `category-${index + 1}`,
      sakuravaRef: `C2607000${index + 1}`,
      name: index === 0 ? "Credit category" : `Category ${index + 1}`,
      // Category 1 remains referenced by the Credit-protected Video while
      // Category 2 is deleted. This matches the parent-cleanup shape that
      // previously emitted a duplicate child update plus Delete operation.
      parentKey: index === 1 ? "category-1" : null,
    }));
    const videos = Array.from({ length: 100 }, (_, index) => video({
      id: `video-${index + 1}`,
      sakuravaRef: `V2607${String(index + 1).padStart(4, "0")}`,
      categoriesJson: index === 0 ? '["Credit category"]' : "[]",
    }));
    const images = Array.from({ length: 100 }, (_, index) => image({
      id: `image-${index + 1}`,
      sakuravaRef: `I2607${String(index + 1).padStart(4, "0")}`,
    }));
    // The Credit-protected Video survives while this related Image is deleted.
    // The full plan must emit a cleanup update before final Rust validation.
    videos[0].relatedImagesJson = JSON.stringify([
      { recordId: images[1].id, titleSnapshot: images[1].title },
    ]);
    const performers = Array.from({ length: 70 }, (_, index) => performer({
      id: `performer-${index + 1}`,
      sakuravaRef: `P2607${String(index + 1).padStart(4, "0")}`,
    }));
    const glossary = Array.from({ length: 3 }, (_, index) => makeGlossary({
      id: `glossary-${index + 1}`,
      sakuravaRef: `G2607${String(index + 1).padStart(4, "0")}`,
    }));
    const credits: Credit[] = [
      credit({ id: "credit-video-performer-1", workType: "video", workId: videos[0].id, performerId: performers[0].id }),
      credit({ id: "credit-image-performer-2", workType: "image", workId: images[0].id, performerId: performers[1].id }),
      credit({ id: "credit-video-performer-3", workType: "video", workId: videos[0].id, performerId: performers[2].id }),
    ];
    const context = { videos, images, performers, categories, glossary, credits };
    const initial = await buildXlsxWorkbook({
      selections: [
        { dataType: "videos", records: videos },
        { dataType: "images", records: images },
        { dataType: "performers", records: performers },
        { dataType: "categories", records: categories },
        { dataType: "glossary", records: glossary },
      ],
      locale: "en-US",
    });
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(initial.bytes as unknown as ArrayBuffer);
    for (const sheet of workbook.worksheets) {
      const actionColumn = (sheet.getRow(1).values as unknown[]).findIndex((value) => value === "Action");
      if (actionColumn < 1) continue;
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        sheet.getCell(rowNumber, actionColumn).value = "Delete";
      }
    }
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    const preview = await buildXlsxCatalogPreview(bytes, context, "en-US");
    const plan = buildImportOperationPlan(preview, context, bytes);

    expect(preview.rows).toHaveLength(278);
    expect(preview.rows.filter((row) => row.detectedResult === "Deleted")).toHaveLength(273);
    expect(preview.rows.filter((row) => row.detectedResult === "Error")).toHaveLength(5);
    expect(preview.rows.filter((row) => row.warnings.length > 0)).toHaveLength(5);
    expect(plan.operations.filter((operation) => operation.action === "delete")).toHaveLength(273);
    expect(plan.operations.filter((operation) => operation.sourceIdentity.startsWith("cleanup:"))).toHaveLength(1);
    const protectedVideoCleanup = plan.operations.find((operation) =>
      operation.sourceIdentity === `cleanup:videos:${videos[0].id}:update`,
    );
    expect(protectedVideoCleanup?.proposedValues.categoriesJson).toBe("[]");
    expect(protectedVideoCleanup?.proposedValues.relatedImagesJson).toBe("[]");
    expect(plan.skippedCount).toBe(5);
    const targetedRecords = plan.operations
      .filter((operation) => operation.action !== "create" && operation.recordId)
      .map((operation) => `${operation.section}:${operation.recordId}`);
    expect(new Set(targetedRecords)).toHaveLength(targetedRecords.length);
  }, 10_000);

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
    data.addRow(workbookRow(data, {
      Action: "Create",
      Code: "V-001",
      Title: "New Video",
      "Release Date": new Date(2026, 6, 14),
    }));
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
    expect(invalid.rows[0].warnings[0]).toContain("Release Date is invalid");
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

  it("keeps legacy Skip neutral and non-destructive with CSV/XLSX parity", async () => {
    const csv = buildVideosCsv([video({ title: "Legacy Skip" })])
      .replace("\r\nAuto,", "\r\nSkip,");
    const csvPreview = buildCsvCatalogPreview(csv, context(), "en-US");
    const bytes = await videoWorkbookRow({ Action: "Skip", Title: "Legacy Skip" });
    const xlsxPreview = await buildXlsxCatalogPreview(bytes, context(), "en-US");

    for (const preview of [csvPreview, xlsxPreview]) {
      expect(preview.rows[0].detectedResult).toBe("Error");
      expect(preview.rows[0].warnings.join(" ")).toContain("Action is not supported");
      expect(preview.summary.blocked).toBe(false);
      expect(buildImportOperationPlan(preview, context(), new Uint8Array())).toMatchObject({
        operations: [],
        skippedCount: 1,
      });
    }
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

  it.each([1, 2] as const)("keeps contract v%s as an explicitly versioned compatibility input", async (version) => {
    const built = await buildXlsxWorkbook({
      selections: [{ dataType: "videos", records: [] }],
      locale: "en-US",
      generatedAt: new Date("2026-07-15T01:02:03Z"),
    });
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(built.bytes as unknown as ArrayBuffer);
    const metadataSheet = workbook.getWorksheet(SAKURAVA_METADATA_SHEET)!;
    const metadata = JSON.parse(String(metadataSheet.getCell("A1").value));
    metadata.contractVersion = version;
    metadata.exportFormatVersion = version;
    metadataSheet.getCell("A1").value = JSON.stringify(metadata);
    workbook.description = `sakurava-bulk-edit-v${version}; dataTypes=videos`;

    const preview = await buildXlsxCatalogPreview(
      new Uint8Array(await workbook.xlsx.writeBuffer()), context(), "en-US",
    );
    expect(preview.headerErrors).toEqual([]);
    expect(preview.summary.blocked).toBe(false);
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
    expect(circular.summary.blocked).toBe(false);
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
    expect(permanentCollision.summary.blocked).toBe(false);
    expect(permanentCollision.rows[0].errors).toContain(
      "Temporary Glossary identifier conflicts with an existing permanent record.",
    );

    const duplicate = buildCsvCatalogPreview([
      headers.join(","),
      row("GLO-NEW-DUPLICATE", "First"),
      row("GLO-NEW-DUPLICATE", "Second"),
    ].join("\r\n"), context(), "en-US");
    expect(duplicate.summary.blocked).toBe(false);
    expect(duplicate.rows.every((item) => item.detectedResult === "Error"))
      .toBe(true);
  });

  it("automatically clears a surviving Glossary child parent relationship", () => {
    const parent = glossary({ id: "glossary-parent", term: "Parent" });
    const child = glossary({ id: "glossary-child", term: "Child", parentId: parent.id });
    const csv = buildGlossaryCsv([parent]).replace("\r\nAuto,", "\r\nDelete,");
    const preview = buildCsvCatalogPreview(csv, { ...context(), glossary: [parent, child] }, "en-US");
    expect(preview.summary.blocked).toBe(false);
    expect(preview.rows[0].errors).toEqual([]);
    expect(preview.rows[0].dependencyPlan).toMatchObject({
      requiresDecision: false,
      detail: "1 child terms remain",
    });
  });

  it("plans Glossary descendants before their deleted parent", () => {
    const parent = glossary({ id: "glossary-parent", term: "Parent" });
    const child = glossary({ id: "glossary-child", term: "Child", parentId: parent.id });
    const csv = buildGlossaryCsv([parent, child]).split("\r\nAuto,").join("\r\nDelete,");
    const preview = buildCsvCatalogPreview(csv, { ...context(), glossary: [parent, child] }, "en-US");
    expect(preview.summary.blocked).toBe(false);
    expect(preview.rows.map((row) => row.dependencyPlan?.requiresDecision)).toEqual([false, false]);
    expect(preview.rows[0].dependencyPlan?.detail).toBe("1 child terms will be deleted first");
    const plan = buildImportOperationPlan(
      preview,
      { ...context(), glossary: [parent, child] },
      new TextEncoder().encode(csv),
    );
    expect(plan.operations.map((operation) => operation.recordId)).toEqual([child.id, parent.id]);
  });

  it.each([
    ["videos", "Video"],
    ["images", "Image"],
    ["performers", "Performer"],
  ] as const)("makes a Category Ready when its %s dependency is also deleted", async (entity, label) => {
    const category = managedCategory({ key: `category-${entity}`, name: `${label} Category` });
    const records = entity === "videos"
      ? { videos: [video({ categoriesJson: JSON.stringify([category.name]) })] }
      : entity === "images"
        ? { images: [image({ categoriesJson: JSON.stringify([category.name]) })] }
        : { performers: [performer({ categoriesJson: JSON.stringify([category.name]) })] };
    const built = await buildXlsxWorkbook({
      selections: [
        { dataType: entity, records: records[entity] as never[] },
        { dataType: "categories", records: [category] },
      ],
      locale: "en-US",
    });
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(built.bytes as unknown as ArrayBuffer);
    workbook.getWorksheet(entity === "videos" ? "Videos" : entity === "images" ? "Images" : "Performers")!.getCell(2, 1).value = "Delete";
    workbook.getWorksheet("Managed Categories")!.getCell(2, 1).value = "Delete";
    const preview = await buildXlsxCatalogPreview(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      { ...context(), ...records, categories: [category] },
      "en-US",
    );
    const categoryRow = preview.rows.find((row) => row.dataType === "categories")!;
    expect(preview.summary.blocked).toBe(false);
    expect(categoryRow.dependencyPlan).toMatchObject({ requiresDecision: false, detail: "Used only by records that are also being deleted" });
  });

  it("automatically clears a surviving Credit Category reference", () => {
    const category = managedCategory({ key: "category-credit", name: "Credit Category" });
    const csv = buildCategoriesCsv([category]).replace("\r\nAuto,", "\r\nDelete,");
    const preview = buildCsvCatalogPreview(csv, {
      ...context(),
      categories: [category],
      credits: [{ creditTypeCategoryId: category.key, roleImportanceCategoryId: null } as never],
    }, "en-US");
    expect(preview.summary.blocked).toBe(false);
    expect(preview.rows[0].dependencyPlan).toMatchObject({ requiresDecision: false, detail: "Used by 1 Credits that will be preserved" });
  });

  it("plans automatic Category cleanup updates that preserve Credits", () => {
    const category = managedCategory({ key: "category-resolution", name: "Resolution Category" });
    const record = video({ categoriesJson: JSON.stringify([category.name]) });
    const credit = { id: "credit-resolution", creditTypeCategoryId: category.key, roleImportanceCategoryId: null } as never;
    const csv = buildCategoriesCsv([category]).replace("\r\nAuto,", "\r\nDelete,");
    const contextValue = { ...context(), categories: [category], videos: [record], credits: [credit] };
    const preview = buildCsvCatalogPreview(csv, contextValue, "en-US");
    expect(preview.summary.blocked).toBe(false);
    expect(preview.automaticCleanupOperations?.map((operation) => operation.section).sort()).toEqual(["credits", "videos"]);
    expect(preview.automaticCleanupOperations?.every((operation) => operation.action === "update")).toBe(true);
    const plan = buildImportOperationPlan(
      preview,
      contextValue,
      new TextEncoder().encode(csv),
    );
    expect(plan.skippedCount).toBe(0);
    expect(plan.operations.every((operation) => operation.sourceRowNumber >= 0)).toBe(true);
  });

  it("cleans a preserved Credit work's Category before deleting that Category", async () => {
    const category = managedCategory({ key: "category-preserved-work", name: "Preserved Work Category" });
    const record = video({ id: "video-preserved-work", categoriesJson: JSON.stringify([category.name]) });
    const built = await buildXlsxWorkbook({
      selections: [
        { dataType: "videos", records: [record] },
        { dataType: "categories", records: [category] },
      ],
      locale: "en-US",
    });
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(built.bytes as unknown as ArrayBuffer);
    workbook.getWorksheet("Videos")!.getCell(2, 1).value = "Delete";
    workbook.getWorksheet("Managed Categories")!.getCell(2, 1).value = "Delete";
    const contextValue = {
      ...context(),
      videos: [record],
      categories: [category],
      credits: [{ workType: "video", workId: record.id, performerId: "preserved-performer" } as never],
    };
    const preview = await buildXlsxCatalogPreview(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      contextValue,
      "en-US",
    );
    const videoRow = preview.rows.find((row) => row.dataType === "videos")!;
    const categoryRow = preview.rows.find((row) => row.dataType === "categories")!;

    expect(videoRow.detectedResult).toBe("Error");
    expect(categoryRow.detectedResult).toBe("Deleted");
    expect(preview.automaticCleanupOperations).toContainEqual(expect.objectContaining({
      section: "videos",
      recordId: record.id,
      proposedValues: { categoriesJson: "[]" },
    }));
  });

  it("clears surviving Category parent relationships without replacement decisions", () => {
    const category = managedCategory({ key: "category-invalid-replacement", name: "Replace me" });
    const child = managedCategory({ key: "category-child", name: "Child", parentKey: category.key });
    const csv = buildCategoriesCsv([category]).replace("\r\nAuto,", "\r\nDelete,");
    const contextValue = { ...context(), categories: [category, child] };
    const preview = buildCsvCatalogPreview(csv, contextValue, "en-US");
    expect(preview.summary.blocked).toBe(false);
    expect(preview.automaticCleanupOperations?.some((operation) => operation.section === "categories")).toBe(true);
  });

  it("does not expose obsolete Skip as an executable operation", () => {
    const parent = glossary({ id: "glossary-skip-parent", term: "Parent" });
    const child = glossary({ id: "glossary-skip-child", term: "Child", parentId: parent.id });
    const csv = buildGlossaryCsv([parent]).replace("\r\nAuto,", "\r\nDelete,");
    const preview = buildCsvCatalogPreview(csv, { ...context(), glossary: [parent, child] }, "en-US");
    expect(preview.summary.blocked).toBe(false);
    expect(preview.rows[0].detectedResult).toBe("Deleted");
  });

  it("does not apply a Video Delete when a Credit work relationship cannot be cleared", () => {
    const record = video({ id: "video-credit", sakuravaRef: "V26070001", title: "Credited Video" });
    const csv = buildVideosCsv([record]).replace("\r\nAuto,", "\r\nDelete,");
    const preview = buildCsvCatalogPreview(csv, {
      ...context(),
      videos: [record],
      credits: [{ workType: "video", workId: record.id, performerId: "performer-credit" } as never],
    }, "en-US");
    expect(preview.summary.blocked).toBe(false);
    expect(preview.rows[0].detectedResult).toBe("Error");
    expect(preview.rows[0].warnings.join(" ")).toContain("cannot be cleared safely");
  });
});

async function numericDateWorkbook(numberFormat: string) {
  const bytes = await videoWorkbookRow({
    Action: "Create",
    Code: "V-001",
    Title: "Numeric Date",
    "Release Date": 46205,
  });
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Videos")!;
  const releaseDateColumn = (sheet.getRow(1).values as unknown[])
    .findIndex((value) => value === "Release Date");
  sheet.getCell(2, releaseDateColumn).numFmt = numberFormat;
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function videoWorkbookRow(overrides: Record<string, string | number | Date>) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.description = `${EXPORT_CONTRACT_VERSION}; dataTypes=videos`;
  const sheet = workbook.addWorksheet("Videos");
  sheet.addRow(buildVideosCsv([]).split(","));
  sheet.addRow(workbookRow(sheet, overrides));
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function workbookRow(
  sheet: import("exceljs").Worksheet,
  overrides: Record<string, string | number | Date>,
) {
  return (sheet.getRow(1).values as unknown[])
    .slice(1)
    .map((header) => overrides[String(header)] ?? "");
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

function makeGlossary(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return glossary(overrides);
}

function credit(overrides: Partial<Credit> = {}): Credit {
  return {
    id: "credit-1", workType: "video", workId: "video-1", performerId: "performer-1",
    characterName: "", characterOriginalName: null, creditedAs: null, creditTypeText: null, creditedAsMode: "auto",
    creditTypeCategoryId: null, roleImportanceCategoryId: null, characterMode: "text",
    characterId: null, billingOrder: null, note: null, legacySourceKey: null,
    createdAt: "", updatedAt: "", ...overrides,
  };
}

function managedCategory(overrides: Partial<ManagedCategory> = {}): ManagedCategory {
  return {
    key: "category-1", name: "Category", parentKey: null, description: "", thumbnailPath: "",
    showInVideos: true, showInImages: true, showInPerformers: true, showInCredits: true,
    createdAt: "", updatedAt: "", ...overrides,
  };
}

function image(overrides: Partial<Image> = {}): Image {
  return {
    id: "image-1", title: "Image", originalTitle: "", code: "", censorship: "", availability: "", releaseDate: "", publisherLabel: "", coverPath: "", folderPath: "", imageCount: null, mainResolution: "", totalFileSizeBytes: null, mainFileType: "", galleryImagePathsJson: "[]", relatedPerformersJson: "[]", relatedVideosJson: "[]", categoriesJson: "[]", sourceLinksJson: "[]", ratingJson: "{}", notes: "", favorite: false, createdAt: "", updatedAt: "", ...overrides,
  };
}

function performer(overrides: Partial<Performer> = {}): Performer {
  return {
    id: "performer-1", name: "Performer", originalName: "", aliasesJson: "[]", status: "", debutDate: "", retiredDate: "", birthDate: "", gender: "", birthplace: "", nationality: "", bloodType: "", heightCm: null, weightKg: null, measurements: "", cupSize: "", coverPath: "", performerThumbnailPathsJson: "[]", filmographyCount: null, pictorialsCount: null, relatedVideosJson: "[]", relatedImagesJson: "[]", categoriesJson: "[]", sourceLinksJson: "[]", ratingJson: "{}", notes: "", favorite: false, createdAt: "", updatedAt: "", ...overrides,
  };
}
