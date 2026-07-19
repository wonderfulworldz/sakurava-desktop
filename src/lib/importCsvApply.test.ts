import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryEntry, Image, ManagedCategory, Performer, Video } from "../backend/types";
import {
  buildCategoriesCsv,
  buildGlossaryCsv,
  buildImagesCsv,
  buildPerformersCsv,
  buildVideosCsv,
  sakuravaRef,
} from "./exportCsv";
import { applyImportCsvPreview, buildNormalizedImportPatch } from "./importCsvApply";
import { buildImportCsvPreview } from "./importCsvPreview";

describe("import CSV apply", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("requires confirmation before applying rows", async () => {
    const mutations = mutationMocks();
    const preview = buildImportCsvPreview(
      withVideoRow({ Action: "Create", Title: "New Video" }),
      context({ categories: [category({ name: "Favorite" })] }),
    );

    const report = await applyImportCsvPreview({
      preview,
      context: context(),
      mutations,
      confirmed: false,
    });

    expect(report.failed).toBe(1);
    expect(mutations.createVideo).not.toHaveBeenCalled();
  });

  it("excludes unsupported legacy Skip while applying valid Glossary CRUD rows", async () => {
    const updateTarget = glossaryEntry({ id: "glossary-update", term: "Alpha", definition: "Old" });
    const deleteTarget = glossaryEntry({ id: "glossary-delete", term: "Delete", definition: "Delete" });
    const unchangedTarget = glossaryEntry({ id: "glossary-same", term: "Same", definition: "Same" });
    const csv = [
      buildGlossaryCsv([]),
      glossaryRow({ Action: "Auto", Term: "Created", Definition: "Created definition" }),
      glossaryRow({ Action: "Auto", "Sakurava Ref": sakuravaRef("GLO", updateTarget.id), Term: "Alpha", Definition: "Changed" }),
      glossaryRow({ Action: "Delete", "Sakurava Ref": sakuravaRef("GLO", deleteTarget.id), Term: "Delete", Definition: "Delete" }),
      glossaryRow({ Action: "Skip", Term: "Ignored", Definition: "Ignored" }),
      buildGlossaryCsv([unchangedTarget]).split("\r\n")[1],
    ].join("\r\n");
    const currentContext = context({ glossary: [updateTarget, deleteTarget, unchangedTarget] });
    const mutations = mutationMocks();
    const report = await applyImportCsvPreview({
      preview: buildImportCsvPreview(csv, currentContext),
      context: currentContext,
      mutations,
      confirmed: true,
    });

    expect(report).toMatchObject({ appliedAdded: 1, appliedModified: 1, appliedDeleted: 1, skipped: 0, failed: 1, unchanged: 1 });
    expect(mutations.createGlossaryEntry).toHaveBeenCalledWith(expect.objectContaining({ term: "Created", definition: "Created definition" }));
    expect(mutations.updateGlossaryEntry).toHaveBeenCalledWith(updateTarget.id, expect.objectContaining({ definition: "Changed" }));
    expect(mutations.deleteGlossaryEntry).toHaveBeenCalledWith(deleteTarget.id);
    expect(mutations.createGlossaryEntry).not.toHaveBeenCalledWith(
      expect.objectContaining({ term: "Ignored" }),
    );
  });

  it("excludes unsupported legacy Skip while applying valid Video CRUD rows", async () => {
    const existing = video({
      id: "video-1",
      title: "Original",
      code: "KEEP-CODE",
      categoriesJson: '["Favorite"]',
      ratingJson: '{"story":2,"rewatch":5}',
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
      mediaPath: "D:/media/original.mp4",
    });
    const deleteTarget = video({ id: "video-delete", title: "Delete Me" });
    const unchanged = video({ id: "video-2", title: "Same" });
    const performer = performerRecord({ id: "performer-2", name: "Performer Two" });
    const csv = [
      videoHeader(),
      videoRow({
        Action: "Auto",
        "Sakurava Ref": sakuravaRef("VID", existing.id),
        Code: "KEEP-CODE",
        Title: "Changed",
        Favorite: "TRUE",
        "Rating - Story": "4",
        "Related Performers": `${sakuravaRef("PER", performer.id)} | Performer Two`,
        Notes: "Changed notes",
      }),
      videoRow({ Action: "Create", Title: "New Video", Categories: "Favorite" }),
      videoRow({
        Action: "Delete",
        "Sakurava Ref": sakuravaRef("VID", deleteTarget.id),
        Title: "Delete Me",
      }),
      videoRow({ Action: "Skip", Title: "Ignored" }),
      buildVideosCsv([unchanged]).split("\r\n")[1],
    ].join("\r\n");
    const currentContext = context({
      videos: [existing, deleteTarget, unchanged],
      performers: [performer],
      categories: [category({ name: "Favorite" })],
    });
    const preview = buildImportCsvPreview(csv, currentContext);
    const mutations = mutationMocks();

    const report = await applyImportCsvPreview({
      preview,
      context: currentContext,
      mutations,
      confirmed: true,
    });

    expect(report.appliedAdded).toBe(1);
    expect(report.appliedModified).toBe(1);
    expect(report.appliedDeleted).toBe(1);
    expect(report.skipped).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.unchanged).toBe(1);
    expect(mutations.createVideo).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New Video", categoriesJson: '["Favorite"]' }),
    );
    expect(mutations.updateVideo).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({
        title: "Changed",
        favorite: true,
        notes: "Changed notes",
        ratingJson: '{"story":4,"rewatch":5}',
        relatedPerformersJson:
          '[{"performerId":"performer-2","nameSnapshot":"Performer Two"}]',
      }),
    );
    expect(mutations.updateVideo.mock.calls[0][1]).not.toHaveProperty("code");
    expect(mutations.updateVideo.mock.calls[0][1]).not.toHaveProperty(
      "durationMinutes",
    );
    expect(mutations.deleteVideo).toHaveBeenCalledWith(deleteTarget.id);
  });

  it("does not apply error, unknown category, unresolved related, or ambiguous rows", async () => {
    const existing = video({ id: "video-1", title: "Original" });
    const duplicateA = performerRecord({ id: "performer-1", name: "Same Name" });
    const duplicateB = performerRecord({ id: "performer-2", name: "Same Name" });
    const ref = sakuravaRef("VID", existing.id);
    const csv = [
      videoHeader(),
      videoRow({ Action: "Update", Title: "Missing Ref" }),
      videoRow({ "Sakurava Ref": ref, Title: "Bad Category", Categories: "Unknown" }),
      videoRow({
        "Sakurava Ref": ref,
        Title: "Missing Related",
        "Related Performers": "Missing Performer",
      }),
      videoRow({
        "Sakurava Ref": ref,
        Title: "Ambiguous Related",
        "Related Performers": "Same Name",
      }),
    ].join("\r\n");
    const currentContext = context({
      videos: [existing],
      performers: [duplicateA, duplicateB],
      categories: [category({ name: "Favorite" })],
    });
    const preview = buildImportCsvPreview(csv, currentContext);
    const mutations = mutationMocks();

    const report = await applyImportCsvPreview({
      preview,
      context: currentContext,
      mutations,
      confirmed: true,
    });

    expect(report.failed).toBe(4);
    expect(mutations.updateVideo).not.toHaveBeenCalled();
    expect(mutations.createVideo).not.toHaveBeenCalled();
    expect(mutations.deleteVideo).not.toHaveBeenCalled();
  });

  it("leaves empty Update category and related cells unchanged", async () => {
    const existing = video({
      id: "video-1",
      title: "Original",
      categoriesJson: '["Favorite"]',
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
    });
    const csv = withVideoRow({
      "Sakurava Ref": sakuravaRef("VID", existing.id),
      Title: "Original",
      Categories: "",
      "Related Performers": "",
    });
    const currentContext = context({
      videos: [existing],
      categories: [category({ name: "Favorite" })],
    });
    const preview = buildImportCsvPreview(csv, currentContext);
    const mutations = mutationMocks();

    const report = await applyImportCsvPreview({
      preview,
      context: currentContext,
      mutations,
      confirmed: true,
    });

    expect(report.unchanged).toBe(1);
    expect(mutations.updateVideo).not.toHaveBeenCalled();
  });

  it("prepares every current public relationship Ref as its hidden storage key", () => {
    const relatedVideo = video({ id: "video-hidden", sakuravaRef: "V26070001", title: "Video" });
    const relatedImage = image({ id: "image-hidden", sakuravaRef: "I26070002", title: "Image" });
    const relatedPerformer = performerRecord({ id: "performer-hidden", sakuravaRef: "P26070003", name: "Performer" });
    const managed = category({ key: "category-hidden", sakuravaRef: "C26070004", name: "Drama" });
    const parentCategory = category({ key: "parent-hidden", sakuravaRef: "C26070005", name: "Parent" });
    const childCategory = category({ key: "child-hidden", sakuravaRef: "C26070006", name: "Child" });
    const parentTerm = glossaryEntry({ id: "term-parent-hidden", sakuravaRef: "G26070007", term: "Parent Term" });
    const childTerm = glossaryEntry({ id: "term-child-hidden", sakuravaRef: "G26070008", term: "Child Term" });
    const currentContext = context({
      videos: [relatedVideo], images: [relatedImage], performers: [relatedPerformer],
      categories: [managed, parentCategory, childCategory], glossary: [parentTerm, childTerm],
    });

    const cases = [
      {
        entity: "videos" as const,
        csv: entityRow(buildVideosCsv, {
          Action: "Create", Title: "New Video", Categories: "C2607-0004 | Drama",
          "Related Performers": "P2607-0003 | Performer", "Related Images": "I2607-0002 | Image",
        }),
        expected: {
          categoriesJson: '["Drama"]',
          relatedPerformersJson: '[{"performerId":"performer-hidden","nameSnapshot":"Performer"}]',
          relatedImagesJson: '[{"recordId":"image-hidden","titleSnapshot":"Image"}]',
        },
      },
      {
        entity: "images" as const,
        csv: entityRow(buildImagesCsv, {
          Action: "Create", Title: "New Image", Categories: "C2607-0004 | Drama",
          "Related Performers": "P2607-0003 | Performer", "Related Videos": "V2607-0001 | Video",
        }),
        expected: {
          categoriesJson: '["Drama"]',
          relatedPerformersJson: '[{"performerId":"performer-hidden","nameSnapshot":"Performer"}]',
          relatedVideosJson: '[{"recordId":"video-hidden","titleSnapshot":"Video"}]',
        },
      },
      {
        entity: "performers" as const,
        csv: entityRow(buildPerformersCsv, {
          Action: "Create", Name: "New Performer", Categories: "C2607-0004 | Drama",
          "Related Videos": "V2607-0001 | Video", "Related Images": "I2607-0002 | Image",
        }),
        expected: {
          categoriesJson: '["Drama"]',
          relatedVideosJson: '[{"recordId":"video-hidden","titleSnapshot":"Video"}]',
          relatedImagesJson: '[{"recordId":"image-hidden","titleSnapshot":"Image"}]',
        },
      },
    ];

    for (const item of cases) {
      const row = buildImportCsvPreview(item.csv, currentContext).rows[0];
      expect(row.errors).toEqual([]);
      expect(row.warnings).toEqual([]);
      expect(buildNormalizedImportPatch(item.entity, row, currentContext)).toMatchObject(item.expected);
    }

    const categoryRowPreview = buildImportCsvPreview(entityRow(buildCategoriesCsv, {
      Action: "Update", "Sakurava Ref": "C2607-0006", "Category Name": "Child",
      "Parent Ref": "C2607-0005",
    }), currentContext).rows[0];
    expect(buildNormalizedImportPatch("categories", categoryRowPreview, currentContext))
      .toMatchObject({ parentKey: "parent-hidden" });

    const glossaryRowPreview = buildImportCsvPreview(entityRow(buildGlossaryCsv, {
      Action: "Update", "Sakurava Ref": "G2607-0008", Term: "Child Term",
      Definition: "Definition", "Parent Ref": "G2607-0007",
    }), currentContext).rows[0];
    expect(buildNormalizedImportPatch("glossary", glossaryRowPreview, currentContext))
      .toMatchObject({ parentId: "term-parent-hidden" });
  });

  it("does not export or apply source media paths", async () => {
    const mutations = mutationMocks();
    const unlink = vi.fn();
    const preview = buildImportCsvPreview(
      withVideoRow({ Action: "Create", Title: "Path Text", "Media Path": "D:/media/file.mp4" }),
      context(),
    );

    await applyImportCsvPreview({
      preview,
      context: context(),
      mutations,
      confirmed: true,
    });

    expect(unlink).not.toHaveBeenCalled();
    expect(mutations.createVideo).toHaveBeenCalledWith(
      expect.not.objectContaining({ mediaPath: "D:/media/file.mp4" }),
    );
    expect(videoHeader()).not.toContain("Media Path");
  });

  it("does not infer a same-file category parent from a display name", async () => {
    const mutations = mutationMocks();
    const preview = buildImportCsvPreview(
      [
        categoryHeader(),
        categoryRow({ Action: "Create", "Category Name": "Genre" }),
        categoryRow({
          Action: "Create",
          "Parent Category": "Genre",
          "Category Name": "Drama",
          Description: "Child",
        }),
      ].join("\r\n"),
      context(),
    );

    const report = await applyImportCsvPreview({
      preview,
      context: context(),
      mutations,
      confirmed: true,
    });

    expect(report.appliedAdded).toBe(2);
    expect(report.failed).toBe(0);
    expect(mutations.createManagedCategory).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: "Genre", parentKey: null }),
    );
    expect(mutations.createManagedCategory).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: "Drama", parentKey: null }),
    );
    expect(mutations.createManagedCategory).toHaveBeenCalledTimes(2);
    expect(report.rows.find((row) => row.target.includes("Drama"))?.warnings.join(" "))
      .toContain("stable Parent Ref");
    expect(window.localStorage.getItem("sakurava.managedCategories.v1"))
      .toBe('["Genre","Drama"]');
  });

  it("applies a valid category parent and safely omits an unknown parent", async () => {
    const parent = category({ key: "cat_format", name: "Format" });
    const mutations = mutationMocks();
    const preview = buildImportCsvPreview(
      [
        currentCategoryHeader(),
        currentCategoryRow({
          Action: "Create",
          "Parent Ref": sakuravaRef("CAT", parent.key),
          "Category Name": "Short",
        }),
        currentCategoryRow({
          Action: "Create",
          "Parent Ref": "CAT-MISSING",
          "Category Name": "Blocked Child",
        }),
      ].join("\r\n"),
      context({ categories: [parent] }),
    );

    const report = await applyImportCsvPreview({
      preview,
      context: context({ categories: [parent] }),
      mutations,
      confirmed: true,
    });

    expect(report.appliedAdded).toBe(2);
    expect(report.failed).toBe(0);
    expect(mutations.createManagedCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Short", parentKey: "cat_format" }),
    );
    expect(mutations.createManagedCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Blocked Child", parentKey: null }),
    );
    expect(report.rows.find((row) => row.target.includes("Blocked Child"))?.warnings.join(" "))
      .toContain("Parent Category Ref was not found");
  });

  it("blocks child-of-child category hierarchy", async () => {
    const parent = category({ key: "cat_parent", name: "Parent" });
    const child = category({
      key: "cat_child",
      name: "Child",
      parentKey: "cat_parent",
    });
    const preview = buildImportCsvPreview(
      withCurrentCategoryRow({
        Action: "Create",
        "Parent Ref": sakuravaRef("CAT", child.key),
        "Category Name": "Grandchild",
      }),
      context({ categories: [parent, child] }),
    );
    const mutations = mutationMocks();

    const report = await applyImportCsvPreview({
      preview,
      context: context({ categories: [parent, child] }),
      mutations,
      confirmed: true,
    });

    expect(report.failed).toBe(1);
    expect(mutations.createManagedCategory).not.toHaveBeenCalled();
    expect(report.rows[0].message).toContain("Only root categories");
  });

  it("persists unused category deletion and blocks in-use category deletion", async () => {
    const unused = category({ key: "cat_unused", name: "Unused" });
    const used = category({ key: "cat_used", name: "Used" });
    window.localStorage.setItem(
      "sakurava.managedCategories.v1",
      JSON.stringify(["Unused", "Used"]),
    );
    const contextWithUsage = context({
      categories: [unused, used],
      videos: [video({ categoriesJson: '["Used"]' })],
    });
    const preview = buildImportCsvPreview(
      [
        categoryHeader(),
        categoryRow({
          Action: "Delete",
          "Sakurava Ref": sakuravaRef("CAT", unused.key),
          "Category Name": "Unused",
        }),
        categoryRow({
          Action: "Delete",
          "Sakurava Ref": sakuravaRef("CAT", used.key),
          "Category Name": "Used",
        }),
      ].join("\r\n"),
      contextWithUsage,
    );
    const mutations = mutationMocks();

    const report = await applyImportCsvPreview({
      preview,
      context: contextWithUsage,
      mutations,
      confirmed: true,
    });

    expect(report.appliedDeleted).toBe(1);
    expect(report.failed).toBe(1);
    expect(mutations.deleteManagedCategory).toHaveBeenCalledWith("cat_unused");
    expect(mutations.deleteManagedCategory).not.toHaveBeenCalledWith("cat_used");
    expect(window.localStorage.getItem("sakurava.managedCategories.v1"))
      .toBe('["Used"]');
    expect(report.rows.find((row) => row.target.includes("Used"))?.message)
      .toContain("Category is still used by records");
  });
});

function mutationMocks() {
  const categoryByName = (input: Partial<ManagedCategory>) =>
    category({
      key:
        input.key ??
        `cat-${String(input.name ?? "category")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`,
      ...input,
    });

  return {
    createVideo: vi.fn(async (input) => video(input)),
    updateVideo: vi.fn(async (id, patch) => video({ id, ...patch })),
    deleteVideo: vi.fn(async (id) => ({ id, deleted: true })),
    createImage: vi.fn(async (input) => image(input)),
    updateImage: vi.fn(async (id, patch) => image({ id, ...patch })),
    deleteImage: vi.fn(async (id) => ({ id, deleted: true })),
    createPerformer: vi.fn(async (input) => performerRecord(input)),
    updatePerformer: vi.fn(async (id, patch) => performerRecord({ id, ...patch })),
    deletePerformer: vi.fn(async (id) => ({ id, deleted: true })),
    createManagedCategory: vi.fn(async (input) => categoryByName(input)),
    updateManagedCategory: vi.fn(async (key, patch) =>
      categoryByName({ key, ...patch }),
    ),
    deleteManagedCategory: vi.fn(async (key) => ({ key, deleted: true })),
    createGlossaryEntry: vi.fn(async (input) => glossaryEntry(input)),
    updateGlossaryEntry: vi.fn(async (id, patch) => glossaryEntry({ id, ...patch })),
    deleteGlossaryEntry: vi.fn(async (id) => ({ id, deleted: true })),
  };
}

function withVideoRow(overrides: Record<string, string>) {
  return `${videoHeader()}\r\n${videoRow(overrides)}`;
}

function videoHeader() {
  return buildVideosCsv([]).split("\r\n")[0];
}

function videoRow(overrides: Record<string, string>) {
  const headers = videoHeader().split(",");
  return headers.map((header) => overrides[header] ?? "").join(",");
}

function withCategoryRow(overrides: Record<string, string>) {
  return `${categoryHeader()}\r\n${categoryRow(overrides)}`;
}

function categoryHeader() {
  return "Action,Sakurava Ref,Parent Category,Category Name,Description,Thumbnail Path,Visibility,Notes";
}

function categoryRow(overrides: Record<string, string>) {
  const headers = categoryHeader().split(",");
  return headers.map((header) => overrides[header] ?? "").join(",");
}

function entityRow<T>(builder: (records: T[]) => string, overrides: Record<string, string>) {
  const headers = builder([]).split("\r\n")[0].split(",");
  return `${headers.join(",")}\r\n${headers.map((header) => overrides[header] ?? "").join(",")}`;
}

function currentCategoryHeader() {
  return buildCategoriesCsv([]).split("\r\n")[0];
}

function currentCategoryRow(overrides: Record<string, string>) {
  return currentCategoryHeader().split(",").map((header) => overrides[header] ?? "").join(",");
}

function withCurrentCategoryRow(overrides: Record<string, string>) {
  return `${currentCategoryHeader()}\r\n${currentCategoryRow(overrides)}`;
}

function context(overrides: Partial<ReturnType<typeof contextBase>> = {}) {
  return { ...contextBase(), ...overrides };
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

function glossaryRow(overrides: Record<string, string>) {
  return buildGlossaryCsv([]).split(",").map((header) => overrides[header] ?? "").join(",");
}

function glossaryEntry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: "glossary-1",
    term: "Term",
    definition: "Definition",
    synonymsJson: "[]",
    category: "",
    parentId: "",
    thumbnailPath: "",
    favorite: false,
    sourceTitle: "",
    sourceUrl: "",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
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

function performerRecord(overrides: Partial<Performer> = {}): Performer {
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
    key: "cat-1",
    name: "Favorite",
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
