import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Image, ManagedCategory, Performer, Video } from "../backend/types";
import { buildVideosCsv, sakuravaRef } from "./exportCsv";
import { applyImportCsvPreview } from "./importCsvApply";
import { buildImportCsvPreview } from "./importCsvPreview";

describe("import CSV apply", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("requires confirmation before applying rows", async () => {
    const mutations = mutationMocks();
    const preview = buildImportCsvPreview(
      withVideoRow({ Action: "Add", Title: "New Video" }),
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

  it("adds, modifies, deletes, skips, and leaves unchanged rows safely", async () => {
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
      [
        "Auto",
        sakuravaRef("VID", existing.id),
        "KEEP-CODE",
        "Changed",
        "",
        "",
        "",
        "",
        "",
        "",
        "4",
        "",
        "",
        "",
        "",
        "D:/media/changed.mp4",
        "",
        `${sakuravaRef("PER", performer.id)} | Performer Two`,
        "",
        "Changed notes",
      ].join(","),
      videoRow({ Action: "Add", Title: "New Video", Categories: "Favorite" }),
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
    expect(report.skipped).toBe(1);
    expect(report.unchanged).toBe(1);
    expect(mutations.createVideo).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New Video", categoriesJson: '["Favorite"]' }),
    );
    expect(mutations.updateVideo).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({
        title: "Changed",
        mediaPath: "D:/media/changed.mp4",
        notes: "Changed notes",
        categoriesJson: "[]",
        ratingJson: '{"story":4}',
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

  it("applies empty category and related cells as explicit removals", async () => {
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

    expect(report.appliedModified).toBe(1);
    expect(mutations.updateVideo).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({
        categoriesJson: "[]",
        relatedPerformersJson: "[]",
      }),
    );
  });

  it("does not touch source media files", async () => {
    const mutations = mutationMocks();
    const unlink = vi.fn();
    const preview = buildImportCsvPreview(
      withVideoRow({ Action: "Add", Title: "Path Text", "Media Path": "D:/media/file.mp4" }),
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
      expect.objectContaining({ mediaPath: "D:/media/file.mp4" }),
    );
  });

  it("adds root and child categories in parent-first order and syncs managed storage", async () => {
    const mutations = mutationMocks();
    const preview = buildImportCsvPreview(
      [
        categoryHeader(),
        categoryRow({ Action: "Add", "Category Name": "Genre" }),
        categoryRow({
          Action: "Add",
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
    expect(mutations.createManagedCategory).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: "Genre", parentKey: null }),
    );
    expect(mutations.createManagedCategory).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: "Drama", parentKey: "cat-genre" }),
    );
    expect(window.localStorage.getItem("sakurava.managedCategories.v1"))
      .toBe('["Genre","Drama"]');
  });

  it("applies child category when parent exists and blocks missing parent", async () => {
    const parent = category({ key: "cat_format", name: "Format" });
    const mutations = mutationMocks();
    const preview = buildImportCsvPreview(
      [
        categoryHeader(),
        categoryRow({
          Action: "Add",
          "Parent Category": "Format",
          "Category Name": "Short",
        }),
        categoryRow({
          Action: "Add",
          "Parent Category": "Missing",
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

    expect(report.appliedAdded).toBe(1);
    expect(report.failed).toBe(1);
    expect(mutations.createManagedCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Short", parentKey: "cat_format" }),
    );
    expect(report.rows.find((row) => row.target.includes("Blocked Child"))?.message)
      .toContain("Parent Category could not be found");
  });

  it("blocks child-of-child category hierarchy", async () => {
    const parent = category({ key: "cat_parent", name: "Parent" });
    const child = category({
      key: "cat_child",
      name: "Child",
      parentKey: "cat_parent",
    });
    const preview = buildImportCsvPreview(
      withCategoryRow({
        Action: "Add",
        "Parent Category": "Child",
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
      .toContain("still used by records");
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

function context(overrides: Partial<ReturnType<typeof contextBase>> = {}) {
  return { ...contextBase(), ...overrides };
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
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}
