import { describe, expect, it, vi } from "vitest";
import type { Image, ManagedCategory, Performer, Video } from "../backend/types";
import {
  buildImportCsvPreview,
  parseCsv,
  parseImportAction,
} from "./importCsvPreview";
import {
  buildImagesCsv,
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
    expect(parseImportAction("Add")).toBe("Add");
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
});

function withVideoRow(overrides: Record<string, string>) {
  const headers = buildVideosCsv([]).split(",");
  const row = headers.map((header) => overrides[header] ?? "");
  return `${headers.join(",")}\r\n${row.join(",")}`;
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
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}
