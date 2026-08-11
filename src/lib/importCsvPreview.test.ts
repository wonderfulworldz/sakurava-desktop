import { describe, expect, it, vi } from "vitest";
import type { Credit, GlossaryEntry, Image, ManagedCategory, Performer, Video } from "../backend/types";
import {
  buildImportCsvPreview,
  parseCsv,
  parseImportAction,
} from "./importCsvPreview";
import { buildNormalizedImportPatch } from "./importCsvApply";
import {
  buildImagesCsv,
  buildCategoriesCsv,
  buildGlossaryCsv,
  buildPerformersCsv,
  buildVideosCsv,
  sakuravaRef,
} from "./exportCsv";
import { SAKURAVA_CLEAR_VALUE } from "./importExportContract";

describe("import CSV preview", () => {
  it("parses commas, quotes, escaped quotes, newlines, and empty cells", () => {
    const parsed = parseCsv(
      'Action,Sakurava Ref,Title,Notes\r\nAuto,VID-1,"A, B","Line ""one""\nLine two"\r\nAuto,,Empty,',
    );

    expect(parsed.headers).toEqual(["Action", "Sakurava Ref", "Title", "Notes"]);
    expect(parsed.rows[0]).toEqual([
      "Auto",
      "VID-1",
      "A, B",
      'Line "one"\nLine two',
    ]);
    expect(parsed.rows[1]).toEqual(["Auto", "", "Empty", ""]);
  });

  it("detects Video, Image, and Performer CSV headers", () => {
    expect(buildImportCsvPreview(buildVideosCsv([]), context()).summary.entity).toBe(
      "videos",
    );
    expect(buildImportCsvPreview(buildImagesCsv([]), context()).summary.entity).toBe(
      "images",
    );
    expect(
      buildImportCsvPreview(buildPerformersCsv([]), context()).summary.entity,
    ).toBe("performers");
  });

  it("does not export package-local Import Ref or Import Resolution columns", () => {
    for (const csv of [
      buildVideosCsv([]),
      buildImagesCsv([]),
      buildPerformersCsv([]),
      buildCategoriesCsv([]),
      buildGlossaryCsv([]),
    ]) {
      const headers = parseCsv(csv).headers;
      expect(headers).not.toContain("Import Ref");
      expect(headers).not.toContain("Import Resolution");
    }
  });

  it("safely ignores an obsolete Import Resolution column", () => {
    const csv = `${buildVideosCsv([])},Import Resolution\r\n`;
    const preview = buildImportCsvPreview(csv, context());

    expect(preview.summary.blocked).toBe(false);
    expect(preview.headerErrors).toEqual([]);
  });

  it("rejects old technical JSON headers", () => {
    const preview = buildImportCsvPreview(
      "sakuravaUpdateKey,title,categoriesJson,ratingJson\r\nvideo:1,Old,[],{}",
      context(),
    );

    expect(preview.summary.blocked).toBe(true);
    expect(preview.headerErrors.join(" ")).toContain("Old technical export headers");
  });

  it("parses valid actions and treats empty as Auto", () => {
    expect(parseImportAction("")).toBe("Auto");
    expect(parseImportAction("auto")).toBe("Auto");
    expect(parseImportAction("Update")).toBe("Update");
    expect(parseImportAction("Add")).toBe("Add");
    expect(parseImportAction("Create")).toBe("Add");
    expect(parseImportAction("Delete")).toBe("Delete");
    expect(parseImportAction("Skip")).toBeNull();
    expect(parseImportAction("Bogus")).toBeNull();
  });

  it("reports an unknown Action as a non-blocking row warning", () => {
    const csv = withVideoRow({ Action: "Bogus", Title: "Video" });
    const row = buildImportCsvPreview(csv, context()).rows[0];

    expect(row.detectedResult).toBe("Error");
    expect(row.warnings.join(" ")).toContain("Action is not supported");
  });

  it("accepts stable and local dates and clears an impossible optional date", () => {
    const valid = buildImportCsvPreview(
      withVideoRow({ Action: "Create", Title: "Valid Date", "Release Date": "2026-05-20" }),
      context(),
    );
    const local = buildImportCsvPreview(
      withVideoRow({ Action: "Create", Title: "Local Date", "Release Date": "20/5/2026" }),
      context(),
      { locale: "en-GB" },
    );
    const impossible = buildImportCsvPreview(
      withVideoRow({ Action: "Create", Title: "Impossible Date", "Release Date": "29/02/2025" }),
      context(),
      { locale: "en-GB" },
    );

    expect(valid.rows[0].errors).toEqual([]);
    expect(local.rows[0].errors).toEqual([]);
    expect(local.rows[0].values["Release Date"]).toBe("2026-05-20");
    expect(impossible.rows[0].warnings).toContain("Release Date is invalid and will be left empty.");
    expect(impossible.rows[0].values["Release Date"]).toBe("");
  });

  it("does not apply Delete without a Sakurava Ref", () => {
    const csv = withVideoRow({ Action: "Delete", Title: "Video" });
    const row = buildImportCsvPreview(csv, context()).rows[0];

    expect(row.detectedResult).toBe("Error");
    expect(row.warnings.join(" ")).toContain("Delete requires a valid Sakurava Ref");
  });

  it("marks existing changed rows as Modified and unchanged rows as Unchanged", () => {
    const existing = video({ id: "video-1", title: "Original" });
    const ref = sakuravaRef("VID", existing.id);
    const modified = withVideoRow({
      Action: "Auto",
      "Sakurava Ref": ref,
      Title: "Changed",
    });
    const unchanged = buildVideosCsv([existing]);

    const modifiedPreview = buildImportCsvPreview(
      modified,
      context({ videos: [existing] }),
    );
    const unchangedPreview = buildImportCsvPreview(
      unchanged,
      context({ videos: [existing] }),
    );

    expect(modifiedPreview.rows[0].detectedResult).toBe("Modified");
    expect(modifiedPreview.rows[0].changes).toContain("Title");
    expect(unchangedPreview.rows[0].detectedResult).toBe("Unchanged");
  });

  it("resolves formatted, canonical, and lowercase contract-v3 references", () => {
    const existing = video({ id: "video-hidden-51", sakuravaRef: "V26070051", title: "Spook Shack" });
    for (const reference of ["V2607-0051", "V26070051", "v2607-0051", "v26070051"]) {
      const preview = buildImportCsvPreview(
        withVideoRow({ Action: "Auto", "Sakurava Ref": reference, Title: "Spook Shack Updated" }),
        context({ videos: [existing] }),
      );
      expect(preview.rows[0].errors).toEqual([]);
      expect(preview.rows[0].detectedResult).toBe("Modified");
      expect(preview.rows[0].target).toBe("Spook Shack Updated");
    }
  });

  it("round-trips formatted, canonical, and lowercase v3 identities for all sections", () => {
    const cases = [
      {
        formatted: "V2607-0051", canonical: "V26070051", label: "Spook Shack",
        csv: buildVideosCsv([video({ id: "video-hidden", sakuravaRef: "V26070051", title: "Spook Shack" })]),
        catalog: context({ videos: [video({ id: "video-hidden", sakuravaRef: "V26070051", title: "Spook Shack" })] }),
      },
      {
        formatted: "I2607-0018", canonical: "I26070018", label: "Gallery Set",
        csv: buildImagesCsv([image({ id: "image-hidden", sakuravaRef: "I26070018", title: "Gallery Set" })]),
        catalog: context({ images: [image({ id: "image-hidden", sakuravaRef: "I26070018", title: "Gallery Set" })] }),
      },
      {
        formatted: "P2607-0007", canonical: "P26070007", label: "Fictional Performer",
        csv: buildPerformersCsv([performer({ id: "performer-hidden", sakuravaRef: "P26070007", name: "Fictional Performer" })]),
        catalog: context({ performers: [performer({ id: "performer-hidden", sakuravaRef: "P26070007", name: "Fictional Performer" })] }),
      },
      {
        formatted: "C2607-0021", canonical: "C26070021", label: "Drama",
        csv: buildCategoriesCsv([category({ key: "category-hidden", sakuravaRef: "C26070021", name: "Drama" })]),
        catalog: context({ categories: [category({ key: "category-hidden", sakuravaRef: "C26070021", name: "Drama" })] }),
      },
      {
        formatted: "G2607-0104", canonical: "G26070104", label: "Citation",
        csv: buildGlossaryCsv([glossary({ id: "glossary-hidden", sakuravaRef: "G26070104", term: "Citation" })]),
        catalog: context({ glossary: [glossary({ id: "glossary-hidden", sakuravaRef: "G26070104", term: "Citation" })] }),
      },
    ];

    for (const item of cases) {
      for (const identity of [item.formatted, item.canonical, item.formatted.toLowerCase()]) {
        const preview = buildImportCsvPreview(item.csv.replace(item.formatted, identity), item.catalog);
        expect(preview.rows[0].errors).toEqual([]);
        expect(preview.rows[0].detectedResult).toBe("Unchanged");
        expect(preview.rows[0].target).toBe(item.label);
        expect(preview.rows[0].target).not.toContain(item.formatted);
        expect(preview.rows[0].target).not.toContain("hidden");
      }
    }
  });

  it("treats malformed and available primary Refs as non-blocking create identities", () => {
    const existing = video({ id: "video-hidden-51", sakuravaRef: "V26070051" });
    const malformed = buildImportCsvPreview(
      withVideoRow({ "Sakurava Ref": "V2607-051", Title: "Video" }),
      context({ videos: [existing] }),
    );
    const unknown = buildImportCsvPreview(
      withVideoRow({ "Sakurava Ref": "V2607-9999", Title: "Video" }),
      context({ videos: [existing] }),
    );
    expect(malformed.rows[0]).toMatchObject({ detectedResult: "Added" });
    expect(malformed.rows[0].values["Sakurava Ref"]).toBe("");
    expect(unknown.rows[0]).toMatchObject({ detectedResult: "Added" });
    expect(unknown.rows[0].values["Sakurava Ref"]).toBe("V2607-9999");
  });

  it("keeps explicit Add identity requests out of existing update targets", () => {
    const existing = video({ id: "video-existing", sakuravaRef: "V26070001", title: "Existing" });
    const preview = buildImportCsvPreview(
      withVideoRow({ Action: "Add", "Sakurava Ref": "V2607-0001", Title: "New owner request" }),
      context({ videos: [existing] }),
    );

    expect(preview.rows[0]).toMatchObject({ detectedResult: "Added" });
    expect(preview.rows[0].values["Sakurava Ref"]).toBe("V2607-0001");
  });

  it("keeps duplicate available create requests eligible for deterministic allocator handling", () => {
    const headers = buildVideosCsv([]).split("\r\n")[0].split(",");
    const row = (values: Record<string, string>) => headers.map((header) => values[header] ?? "").join(",");
    const csv = [
      headers.join(","),
      row({ Action: "Auto", "Sakurava Ref": "V2607-9999", Title: "First" }),
      row({ Action: "Auto", "Sakurava Ref": "V2607-9999", Title: "Second" }),
    ].join("\r\n");
    const preview = buildImportCsvPreview(csv, context());

    expect(preview.rows.map((row) => row.detectedResult)).toEqual(["Added", "Added"]);
    expect(preview.rows.every((row) => row.warnings.every((warning) => !warning.startsWith("Duplicate Sakurava Ref")))).toBe(true);
  });

  it("resolves current relationship references and never falls back to display names", () => {
    const related = performer({ id: "performer-hidden", sakuravaRef: "P26070007", name: "Same Name" });
    const currentRef = buildImportCsvPreview(
      withVideoRow({ Action: "Create", Title: "Related", "Related Performers": "P2607-0007 | Same Name" }),
      context({ performers: [related] }),
    );
    const displayOnly = buildImportCsvPreview(
      withVideoRow({ Action: "Create", Title: "Related", "Related Performers": "Same Name" }),
      context({ performers: [related] }),
    );
    expect(currentRef.rows[0].errors).toEqual([]);
    expect(currentRef.rows[0].warnings).toEqual([]);
    expect(displayOnly.rows[0].warnings.join(" ")).toContain("related Ref was not found");
  });

  it("ignores malformed relationship Refs without blocking or planning a phantom target", () => {
    const catalog = context();
    const preview = buildImportCsvPreview(
      withVideoRow({
        Action: "Create",
        Title: "Valid parent",
        "Related Performers": "ABCDE | Superman",
      }),
      catalog,
    );
    const row = preview.rows[0];
    const patch = buildNormalizedImportPatch("videos", row, catalog);

    expect(preview.summary.blocked).toBe(false);
    expect(row.errors).toEqual([]);
    expect(row.detectedResult).toBe("Added");
    expect(row.values["Related Performers"]).toBe("");
    expect(row.warnings.join(" ")).toContain("related Ref was not found");
    expect(JSON.parse(patch.relatedPerformersJson as string)).toEqual([]);
  });

  it("resolves public Category references to stored labels without display-name identity fallback", () => {
    const managed = category({ key: "category-hidden", sakuravaRef: "C26070004", name: "Drama" });
    const valid = buildImportCsvPreview(
      withVideoRow({ Action: "Create", Title: "Categorized", Categories: "C2607-0004 | Drama" }),
      context({ categories: [managed] }),
    );
    const unknownRefWithMatchingDisplay = buildImportCsvPreview(
      withVideoRow({ Action: "Create", Title: "Categorized", Categories: "C2607-9999 | Drama" }),
      context({ categories: [managed] }),
    );
    expect(valid.rows[0].errors).toEqual([]);
    expect(valid.rows[0].warnings).toEqual([]);
    expect(valid.rows[0].values.Categories).toBe("Drama");
    expect(unknownRefWithMatchingDisplay.rows[0].warnings).toEqual([]);
    expect(unknownRefWithMatchingDisplay.rows[0].values.Categories).toBe("C26079999");
  });

  it("canonicalizes equivalent booleans, enums, dates, numbers, and references before comparison", () => {
    const related = performer({ id: "performer-related", name: "Canonical Performer" });
    const existing = video({
      id: "video-canonical",
      favorite: true,
      availability: "Owned",
      releaseDate: "2026-07-14",
      durationMinutes: 90,
      relatedPerformersJson: JSON.stringify([{
        performerId: related.id,
        nameSnapshot: related.name,
      }]),
    });
    const preview = buildImportCsvPreview(
      withVideoRow({
        "Sakurava Ref": sakuravaRef("VID", existing.id),
        Title: existing.title,
        Favorite: "TRUE",
        Availability: "owned",
        "Release Date": "07/14/2026",
        "Duration (minutes)": "090",
        "Related Performers": `${sakuravaRef("PER", related.id)} | Changed display label`,
      }),
      context({ videos: [existing], performers: [related] }),
      { locale: "en-US" },
    );

    expect(preview.rows[0].errors).toEqual([]);
    expect(preview.rows[0].detectedResult).toBe("Unchanged");
    expect(preview.rows[0].changeDetails).toEqual([]);
  });

  it("marks blank ref with main field as Added and rejects obsolete Skip", () => {
    const added = buildImportCsvPreview(
      withVideoRow({ Action: "Auto", Title: "New Video" }),
      context(),
    );
    const skipped = buildImportCsvPreview(
      withVideoRow({ Action: "Skip", Title: "" }),
      context(),
    );

    expect(added.rows[0].detectedResult).toBe("Added");
    expect(skipped.rows[0].detectedResult).toBe("Error");
  });

  it("validates Delete by identity only and does not count ignored payload values as warnings", () => {
    const existing = video({ id: "video-1", title: "Delete Me" });
    const csv = withVideoRow({
      Action: "Delete",
      "Sakurava Ref": sakuravaRef("VID", existing.id),
      Title: "",
      "Release Date": "2/30/2026",
      "Duration (minutes)": "not-a-number",
    });
    const preview = buildImportCsvPreview(csv, context({ videos: [existing] }));
    const row = preview.rows[0];

    expect(row.detectedResult).toBe("Deleted");
    expect(row.warnings).toEqual([]);
    expect(preview.summary.warnings).toBe(0);
  });

  it("uses N/A for an empty required Add text value", () => {
    const csv = [
      buildGlossaryCsv([]),
      glossaryRow({ Action: "Add", Term: "New term", Definition: "" }),
    ].join("\r\n");
    const row = buildImportCsvPreview(csv, context()).rows[0];

    expect(row.detectedResult).toBe("Added");
    expect(row.values.Definition).toBe("N/A");
    expect(row.warnings).toContain("Definition was empty and will use N/A.");
  });

  it("detects category additions/removals and leaves blank Update cells unchanged", () => {
    const existing = video({
      id: "video-1",
      categoriesJson: JSON.stringify(["Favorite", "Genre > Drama"]),
    });
    const ref = sakuravaRef("VID", existing.id);
    const csv = withVideoRow({
      "Sakurava Ref": ref,
      Title: existing.title,
      Categories: "Favorite; Unknown",
    });
    const preview = buildImportCsvPreview(
      csv,
      context({
        videos: [existing],
        categories: [category({ name: "Favorite" })],
      }),
    );

    expect(preview.rows[0].changes.join(" ")).not.toContain("Categories +Unknown");
    expect(preview.rows[0].changes.join(" ")).toContain("Categories -Genre > Drama");
    expect(preview.rows[0].warnings).toContain("Category Ref was not found. Category will be empty.");

    const empty = buildImportCsvPreview(
      withVideoRow({ "Sakurava Ref": ref, Title: existing.title, Categories: "" }),
      context({ videos: [existing] }),
    );
    expect(empty.rows[0].detectedResult).toBe("Unchanged");
    expect(empty.rows[0].changes).not.toContain("Categories");
  });

  it("detects related additions/removals and never resolves display names", () => {
    const performerA = performer({ id: "performer-1", name: "Performer A" });
    const duplicateA = performer({ id: "performer-2", name: "Performer A" });
    const performerB = performer({ id: "performer-3", name: "Performer B" });
    const existing = video({
      id: "video-1",
      relatedPerformersJson: JSON.stringify([
        { performerId: performerA.id, nameSnapshot: performerA.name },
      ]),
    });
    const ref = sakuravaRef("VID", existing.id);

    const resolved = buildImportCsvPreview(
      withVideoRow({
        "Sakurava Ref": ref,
        Title: existing.title,
        "Related Performers": `${sakuravaRef("PER", performerB.id)} | Performer B`,
      }),
      context({ videos: [existing], performers: [performerA, performerB] }),
    );
    expect(resolved.rows[0].changes.join(" ")).toContain("Related Performers");

    const unresolved = buildImportCsvPreview(
      withVideoRow({
        "Sakurava Ref": ref,
        Title: existing.title,
        "Related Performers": "Missing Performer",
      }),
      context({ videos: [existing], performers: [performerA] }),
    );
    expect(unresolved.rows[0].warnings.join(" ")).toContain("related Ref was not found");

    const ambiguous = buildImportCsvPreview(
      withVideoRow({
        "Sakurava Ref": ref,
        Title: existing.title,
        "Related Performers": "Performer A",
      }),
      context({ videos: [existing], performers: [performerA, duplicateA] }),
    );
    expect(ambiguous.rows[0].warnings.join(" ")).toContain("related Ref was not found");
  });

  it("blocks an ambiguous visible identifier collision in the current catalog", () => {
    const first = video({ id: "record-1pvu", title: "First collision" });
    const second = video({ id: "record-g3ea", title: "Second collision" });
    expect(sakuravaRef("VID", first.id)).toBe("VID-0IY2FJF");
    expect(sakuravaRef("VID", second.id)).toBe("VID-0IY2FJF");

    const preview = buildImportCsvPreview(
      buildVideosCsv([first]),
      context({ videos: [first, second] }),
    );

    expect(preview.summary.blocked).toBe(true);
    expect(preview.headerErrors).toContain(
      "The catalog contains a conflicting Sakurava identifier: VID-0IY2FJF.",
    );
  });

  it("uses an explicit marker to clear only nullable editable fields", () => {
    const existing = video({ id: "video-clear", title: "Keep title", notes: "Remove me" });
    const ref = sakuravaRef("VID", existing.id);
    const clear = buildImportCsvPreview(
      withVideoRow({ "Sakurava Ref": ref, Title: "", Notes: SAKURAVA_CLEAR_VALUE }),
      context({ videos: [existing] }),
    );
    expect(clear.rows[0].detectedResult).toBe("Modified");
    expect(clear.rows[0].clearedFields).toEqual(["Notes"]);
    expect(clear.rows[0].changeDetails).toContainEqual({
      field: "Notes", before: "Remove me", after: "", cleared: true,
    });

    const required = buildImportCsvPreview(
      withVideoRow({ "Sakurava Ref": ref, Title: SAKURAVA_CLEAR_VALUE }),
      context({ videos: [existing] }),
    );
    expect(required.rows[0].warnings).toContain("Title cannot be cleared. The current value will be preserved.");

    const literal = buildImportCsvPreview(
      withVideoRow({ "Sakurava Ref": ref, Title: "", Notes: "[[SAKURAVA:CLEAR:v1]] extra" }),
      context({ videos: [existing] }),
    );
    expect(literal.rows[0].errors).toEqual([]);
    expect(literal.rows[0].clearedFields).toEqual([]);
  });

  it("leaves Managed Category dependency planning to the complete catalog Preview", () => {
    const parent = category({ key: "cat-parent", name: "Parent" });
    const child = category({ key: "cat-child", name: "Child", parentKey: parent.key });
    const csv = buildCategoriesCsv([parent]).replace("\r\nAuto,", "\r\nDelete,");
    const preview = buildImportCsvPreview(csv, context({
      videos: [video({ categoriesJson: '["Parent"]' })],
      categories: [parent, child],
      credits: [{ creditTypeCategoryId: parent.key, roleImportanceCategoryId: null } as any],
    }));
    expect(preview.rows[0].errors).toEqual([]);
    expect(preview.summary.blocked).toBe(false);
  });

  it("preview does not call mutation functions", () => {
    const update = vi.fn();
    buildImportCsvPreview(withVideoRow({ Title: "New Video" }), context());
    expect(update).not.toHaveBeenCalled();
  });

  it("round-trips Glossary CSV and resolves every approved action", () => {
    const updateTarget = glossary({ id: "glossary-update", term: "Alpha", definition: "Old" });
    const unchangedTarget = glossary({ id: "glossary-same", term: "Beta", definition: "Same" });
    const deleteTarget = glossary({ id: "glossary-delete", term: "Gamma", definition: "Delete" });
    const exported = buildGlossaryCsv([unchangedTarget]);
    expect(buildImportCsvPreview(exported, context({ glossary: [unchangedTarget] })).summary.entity).toBe("glossary");

    const csv = [
      buildGlossaryCsv([]),
      glossaryRow({ Action: "Auto", Term: "Created", Definition: "New definition" }),
      glossaryRow({ Action: "Auto", "Sakurava Ref": sakuravaRef("GLO", updateTarget.id), Term: "Alpha", Definition: "Changed", Favorite: "false" }),
      buildGlossaryCsv([unchangedTarget]).split("\r\n")[1],
      glossaryRow({ Action: "Delete", "Sakurava Ref": sakuravaRef("GLO", deleteTarget.id), Term: "Gamma", Definition: "Delete" }),
      glossaryRow({ Action: "Skip", Term: "Ignored", Definition: "Ignored" }),
      glossaryRow({ Action: "Auto", "Sakurava Ref": "GLO-UNKNOWN", Term: "Unknown", Definition: "Unknown" }),
      glossaryRow({ Action: "Replace", Term: "Bad action", Definition: "Bad action" }),
    ].join("\r\n");
    const preview = buildImportCsvPreview(csv, context({
      glossary: [updateTarget, unchangedTarget, deleteTarget],
    }));

    expect(preview.rows.map((row) => row.detectedResult)).toEqual([
      "Added", "Modified", "Unchanged", "Deleted", "Error", "Error", "Error",
    ]);
    expect(preview.rows[1].changeDetails).toEqual([
      { field: "Definition", before: "Old", after: "Changed" },
    ]);
    expect(preview.rows[5].warnings.join(" ")).toContain("Sakurava Ref was not found");
    expect(preview.rows[6].warnings.join(" ")).toContain("Action is not supported");
  });
});

function withVideoRow(overrides: Record<string, string>) {
  const headers = buildVideosCsv([]).split("\r\n")[0].split(",");
  const row = headers.map((header) => overrides[header] ?? "");
  return `${headers.join(",")}\r\n${row.join(",")}`;
}

function glossaryRow(overrides: Record<string, string>) {
  return buildGlossaryCsv([]).split("\r\n")[0].split(",").map((header) => overrides[header] ?? "").join(",");
}

function context(overrides: Partial<ReturnType<typeof contextBase>> = {}) {
  return {
    ...contextBase(),
    ...overrides,
  };
}

function contextBase() {
  return {
    videos: [] as Video[],
    images: [] as Image[],
    performers: [] as Performer[],
    categories: [] as ManagedCategory[],
    glossary: [] as GlossaryEntry[],
    credits: [] as Credit[],
  };
}

function glossary(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: "glossary-1", term: "Term", definition: "Definition", synonymsJson: "[]",
    category: "", parentId: "", thumbnailPath: "", favorite: false,
    sourceTitle: "", sourceUrl: "", createdAt: 1, updatedAt: 1, ...overrides,
  };
}

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "video-1",
    title: "Video",
    originalTitle: "",
    code: "",
    censorship: "",
    availability: "",
    releaseDate: "",
    durationMinutes: null,
    resolution: "",
    fileSizeBytes: null,
    fileType: "",
    publisherLabel: "",
    coverPath: "",
    mediaPath: "",
    categoriesJson: "[]",
    relatedPerformersJson: "[]",
    relatedImagesJson: "[]",
    sourceLinksJson: "[]",
    ratingJson: "{}",
    notes: "",
    favorite: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function image(overrides: Partial<Image> = {}): Image {
  return {
    id: "image-1",
    title: "Image",
    originalTitle: "",
    code: "",
    censorship: "",
    availability: "",
    releaseDate: "",
    publisherLabel: "",
    coverPath: "",
    folderPath: "",
    imageCount: null,
    mainResolution: "",
    totalFileSizeBytes: null,
    mainFileType: "",
    galleryImagePathsJson: "[]",
    categoriesJson: "[]",
    relatedPerformersJson: "[]",
    relatedVideosJson: "[]",
    sourceLinksJson: "[]",
    ratingJson: "{}",
    notes: "",
    favorite: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function performer(overrides: Partial<Performer> = {}): Performer {
  return {
    id: "performer-1",
    name: "Performer",
    originalName: "",
    aliasesJson: "[]",
    status: "",
    debutDate: "",
    retiredDate: "",
    birthDate: "",
    birthplace: "",
    nationality: "",
    bloodType: "",
    heightCm: null,
    weightKg: null,
    measurements: "",
    cupSize: "",
    coverPath: "",
    performerThumbnailPathsJson: "[]",
    filmographyCount: null,
    pictorialsCount: null,
    relatedVideosJson: "[]",
    relatedImagesJson: "[]",
    sourceLinksJson: "[]",
    categoriesJson: "[]",
    ratingJson: "{}",
    notes: "",
    favorite: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function category(overrides: Partial<ManagedCategory> = {}): ManagedCategory {
  return {
    key: "cat_test",
    name: "Category",
    parentKey: null,
    description: "",
    thumbnailPath: "",
    showInVideos: true,
    showInCredits: false,
    showInImages: true,
    showInPerformers: true,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}
