import { describe, expect, it, vi } from "vitest";
import type { GlossaryEntry, Image, ManagedCategory, Performer, Video } from "../backend/types";
import {
  buildImportCsvPreview,
  parseCsv,
  parseImportAction,
} from "./importCsvPreview";
import {
  buildImagesCsv,
  buildGlossaryCsv,
  buildPerformersCsv,
  buildVideosCsv,
  sakuravaRef,
} from "./exportCsv";

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
    expect(parseImportAction("Create")).toBe("Create");
    expect(parseImportAction("Delete")).toBe("Delete");
    expect(parseImportAction("Skip")).toBe("Skip");
    expect(parseImportAction("Bogus")).toBeNull();
  });

  it("reports unknown Action as a row error", () => {
    const csv = withVideoRow({ Action: "Bogus", Title: "Video" });
    const row = buildImportCsvPreview(csv, context()).rows[0];

    expect(row.detectedResult).toBe("Error");
    expect(row.errors.join(" ")).toContain("Unknown Action");
  });

  it("accepts stable and local dates and blocks impossible dates with local guidance", () => {
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
    expect(impossible.rows[0].errors).toContain(
      "Release Date: Enter a valid date using this computer's format: DD/MM/YYYY.",
    );
    expect(impossible.rows[0].errors.join(" ")).not.toContain("must use YYYY-MM-DD");
  });

  it("blocks Delete without Sakurava Ref", () => {
    const csv = withVideoRow({ Action: "Delete", Title: "Video" });
    const row = buildImportCsvPreview(csv, context()).rows[0];

    expect(row.detectedResult).toBe("Error");
    expect(row.errors).toContain("Delete requires a Sakurava Ref.");
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

  it("marks blank ref with main field as Added and Skip as Skipped", () => {
    const added = buildImportCsvPreview(
      withVideoRow({ Action: "Auto", Title: "New Video" }),
      context(),
    );
    const skipped = buildImportCsvPreview(
      withVideoRow({ Action: "Skip", Title: "" }),
      context(),
    );

    expect(added.rows[0].detectedResult).toBe("Added");
    expect(skipped.rows[0].detectedResult).toBe("Skipped");
  });

  it("marks Delete preview only and includes catalog delete warning", () => {
    const existing = video({ id: "video-1", title: "Delete Me" });
    const csv = withVideoRow({
      Action: "Delete",
      "Sakurava Ref": sakuravaRef("VID", existing.id),
      Title: "Delete Me",
    });
    const row = buildImportCsvPreview(csv, context({ videos: [existing] })).rows[0];

    expect(row.detectedResult).toBe("Deleted");
    expect(row.warnings.join(" ")).toContain("Original media files are not deleted");
  });

  it("detects category additions/removals, unknown categories, and empty category warning", () => {
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

    expect(preview.rows[0].changes.join(" ")).toContain("Categories +Unknown");
    expect(preview.rows[0].changes.join(" ")).toContain("Categories -Genre > Drama");
    expect(preview.rows[0].warnings).toContain("Unknown category: Unknown.");

    const empty = buildImportCsvPreview(
      withVideoRow({ "Sakurava Ref": ref, Title: existing.title, Categories: "" }),
      context({ videos: [existing] }),
    );
    expect(empty.rows[0].warnings).toContain(
      "This will remove all categories from this record if applied.",
    );
  });

  it("detects related additions/removals, unresolved warnings, and ambiguous display errors", () => {
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
    expect(unresolved.rows[0].warnings.join(" ")).toContain("Unresolved related value");

    const ambiguous = buildImportCsvPreview(
      withVideoRow({
        "Sakurava Ref": ref,
        Title: existing.title,
        "Related Performers": "Performer A",
      }),
      context({ videos: [existing], performers: [performerA, duplicateA] }),
    );
    expect(ambiguous.rows[0].errors.join(" ")).toContain(
      "Ambiguous related display name",
    );
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
      "Added", "Modified", "Unchanged", "Deleted", "Skipped", "Error", "Error",
    ]);
    expect(preview.rows[1].changeDetails).toEqual([
      { field: "Definition", before: "Old", after: "Changed" },
    ]);
    expect(preview.rows[5].errors.join(" ")).toContain("Sakurava Ref was not found");
    expect(preview.rows[6].errors.join(" ")).toContain("Unknown Action");
  });
});

function withVideoRow(overrides: Record<string, string>) {
  const headers = buildVideosCsv([]).split(",");
  const row = headers.map((header) => overrides[header] ?? "");
  return `${headers.join(",")}\r\n${row.join(",")}`;
}

function glossaryRow(overrides: Record<string, string>) {
  return buildGlossaryCsv([]).split(",").map((header) => overrides[header] ?? "").join(",");
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
