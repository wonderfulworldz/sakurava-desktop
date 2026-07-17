import { describe, expect, it } from "vitest";
import type { Video } from "../backend/types";
import { buildCsvCatalogPreview } from "./importCatalog";
import {
  buildCategoriesCsv,
  buildGlossaryCsv,
  buildImagesCsv,
  buildPerformersCsv,
  buildVideosCsv,
  sakuravaRef,
} from "./exportCsv";
import { SAKURAVA_CLEAR_VALUE } from "./importExportContract";
import { operationFingerprint } from "./importExportContract";
import { assertImportOperationPlanIntegrity, buildImportOperationPlan } from "./importOperationPlan";
import { parseCsv } from "./importCsvPreview";

describe("immutable import operation plan", () => {
  it("uses the exact normalized clear operation displayed by Preview", () => {
    const existing = video({ notes: "Current note" });
    const parsed = parseCsv(buildVideosCsv([existing]));
    const notes = parsed.headers.indexOf("Notes");
    parsed.rows[0][notes] = SAKURAVA_CLEAR_VALUE;
    const csv = [parsed.headers, ...parsed.rows].map((row) => row.join(",")).join("\r\n");
    const context = { videos: [existing], images: [], performers: [], categories: [], glossary: [] };
    const preview = buildCsvCatalogPreview(csv, context, "en-US");
    const sourceBytes = new TextEncoder().encode(csv);
    const plan = buildImportOperationPlan(preview, context, sourceBytes);

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]).toMatchObject({
      action: "update",
      recordId: existing.id,
      stableRecordIdentifier: sakuravaRef("VID", existing.id),
      clearedFields: ["Notes"],
      proposedValues: { notes: "" },
    });
    expect(plan.operations[0].fieldDifferences[0]).toMatchObject({
      field: "Notes", oldValue: "Current note", newValue: "", cleared: true,
    });
    expect(plan.operationFingerprint).toMatch(/^skv1-[0-9a-f]{8}$/);
    expect(plan.sourceFingerprint).toMatch(/^skvf1-[0-9a-f]{8}$/);
    expect(buildImportOperationPlan(preview, context, sourceBytes).operationFingerprint)
      .toBe(plan.operationFingerprint);
    const changedSourcePlan = buildImportOperationPlan(
      preview,
      context,
      new TextEncoder().encode(`${csv}\r\n`),
    );
    expect(changedSourcePlan.sourceFingerprint).not.toBe(plan.sourceFingerprint);
    expect(changedSourcePlan.operationFingerprint).not.toBe(plan.operationFingerprint);
  });

  it.each([
    ["videos", buildVideosCsv([]), { Title: "New Video" }],
    ["images", buildImagesCsv([]), { Title: "New Image" }],
    ["performers", buildPerformersCsv([]), { Name: "New Performer" }],
    ["categories", buildCategoriesCsv([]), { "Category Name": "New Category" }],
    ["glossary", buildGlossaryCsv([]), { Term: "New Term", Definition: "New definition" }],
  ] as const)("uses deterministic source identity for blank-ID %s Creates", (_, header, values) => {
    const csv = csvWithRow(header, { Action: "Auto", ...values });
    const context = emptyContext();
    const bytes = new TextEncoder().encode(csv);
    const first = buildImportOperationPlan(
      buildCsvCatalogPreview(csv, context, "en-US"),
      context,
      bytes,
    );
    const second = buildImportOperationPlan(
      buildCsvCatalogPreview(csv, context, "en-US"),
      context,
      bytes,
    );

    expect(first.operations).toHaveLength(1);
    expect(first.operations[0]).toMatchObject({
      action: "create",
      stableRecordIdentifier: "",
      recordId: null,
      temporaryIdentifier: null,
    });
    expect(second.operations[0].sourceIdentity).toBe(first.operations[0].sourceIdentity);
    expect(second.operationFingerprint).toBe(first.operationFingerprint);
  });

  it("does not use a temporary same-file Glossary identity as a relationship", () => {
    const header = buildGlossaryCsv([]);
    const csv = [
      header,
      csvRow(header, {
        Action: "Create",
        "Sakurava Ref": "GLO-NEW-PARENT",
        Term: "Parent",
        Definition: "Parent definition",
      }),
      csvRow(header, {
        Action: "Create",
        "Sakurava Ref": "GLO-NEW-CHILD",
        Term: "Child",
        Definition: "Child definition",
        "Parent Ref": "GLO-NEW-PARENT",
      }),
    ].join("\r\n");
    const context = emptyContext();
    const bytes = new TextEncoder().encode(csv);
    const preview = buildCsvCatalogPreview(csv, context, "en-US");
    const first = buildImportOperationPlan(preview, context, bytes);
    const second = buildImportOperationPlan(preview, context, bytes);

    expect(first.operationFingerprint).toBe(second.operationFingerprint);
    expect(first.operations).toHaveLength(1);
    expect(preview.rows[1].detectedResult).toBe("Error");
    expect(preview.rows[1].warnings.join(" ")).toContain("will be ignored");
  });

  it("serializes a Delete with no editable spreadsheet payload", () => {
    const existing = video({ id: "video-delete", sakuravaRef: "V26070001" });
    const header = buildVideosCsv([]);
    const csv = [
      header,
      csvRow(header, {
        Action: "Delete",
        "Sakurava Ref": "V2607-0001",
        Title: "",
        "Duration (minutes)": "-25",
      }),
    ].join("\r\n");
    const context = { ...emptyContext(), videos: [existing] };
    const plan = buildImportOperationPlan(
      buildCsvCatalogPreview(csv, context, "en-US"),
      context,
      new TextEncoder().encode(csv),
    );

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]).toMatchObject({
      action: "delete",
      recordId: existing.id,
      proposedValues: {},
    });
    expect(plan.operations[0].sourceRowNumber).toBe(2);
  });

  it("canonicalizes automatic cleanup operations and rejects a mutated stored plan", () => {
    const context = emptyContext();
    const preview = {
      headerErrors: [],
      rows: [],
      automaticCleanupOperations: [
        {
          sourceIdentity: "cleanup:videos:video-b:update",
          section: "videos",
          action: "update",
          recordId: "video-b",
          currentRecord: { id: "video-b" },
          proposedValues: { categoriesJson: "[]" },
          detail: "Category relationship will be cleared",
        },
        {
          sourceIdentity: "cleanup:categories:category-a:update",
          section: "categories",
          action: "update",
          recordId: "category-a",
          currentRecord: { key: "category-a" },
          proposedValues: { parentKey: null },
          detail: "Child Category parent relationship will be cleared",
        },
      ],
    } as any;
    const plan = buildImportOperationPlan(preview, context, new Uint8Array([1]));

    expect(plan.operations.map((operation) => operation.sourceIdentity)).toEqual([
      "cleanup:categories:category-a:update",
      "cleanup:videos:video-b:update",
    ]);
    expect(() => assertImportOperationPlanIntegrity(plan)).not.toThrow();

    plan.operations[0].proposedValues.parentKey = "changed-after-preview";
    expect(() => assertImportOperationPlanIntegrity(plan))
      .toThrowError("The import plan could not be processed.");
  });

  it("uses JSON transport semantics for undefined Preview values", () => {
    expect(operationFingerprint({ record: { id: "video", optional: undefined } }))
      .toBe(operationFingerprint({ record: { id: "video" } }));
    expect(operationFingerprint([undefined])).toBe(operationFingerprint([null]));
  });
});

function emptyContext() {
  return { videos: [], images: [], performers: [], categories: [], glossary: [], credits: [] };
}

function csvWithRow(header: string, values: Record<string, string>) {
  return `${header}\r\n${csvRow(header, values)}`;
}

function csvRow(header: string, values: Record<string, string>) {
  return header.split(",").map((column) => values[column] ?? "").join(",");
}

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "video-plan", title: "Video", originalTitle: "", code: "", censorship: "",
    availability: "", releaseDate: "", durationMinutes: null, resolution: "",
    fileSizeBytes: null, fileType: "", publisherLabel: "", coverPath: "",
    mediaPath: "", categoriesJson: "[]", relatedPerformersJson: "[]",
    relatedImagesJson: "[]", sourceLinksJson: "[]", ratingJson: "{}",
    notes: "", favorite: false, createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z", ...overrides,
  };
}
