import { describe, expect, it } from "vitest";
import type { Video } from "../backend/types";
import { buildCsvCatalogPreview } from "./importCatalog";
import { buildVideosCsv, sakuravaRef } from "./exportCsv";
import { SAKURAVA_CLEAR_VALUE } from "./importExportContract";
import { buildImportOperationPlan } from "./importOperationPlan";
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
});

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
