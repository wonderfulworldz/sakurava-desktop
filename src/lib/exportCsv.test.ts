import { describe, expect, it } from "vitest";
import type { Image, ManagedCategory, Performer, Video } from "../backend/types";
import {
  buildCategoriesCsv,
  buildImagesCsv,
  buildPerformersCsv,
  buildVideosCsv,
  escapeCsvValue,
  imageCsvSchema,
  performerCsvSchema,
  sakuravaRef,
  videoCsvSchema,
} from "./exportCsv";

const rawInternalHeaders = [
  "sakuravaUpdateKey",
  "id",
  "uuid",
  "ratingJson",
  "categoriesJson",
  "relatedVideosJson",
  "relatedImagesJson",
  "relatedPerformersJson",
  "galleryImagePathsJson",
  "performerThumbnailPathsJson",
];

const calculatedHeaders = [
  "Availability",
  "Duration",
  "Resolution",
  "File Size",
  "File Type",
  "Image Count",
  "Main Resolution",
  "Total File Size",
  "Main File Type",
  "Status",
  "Filmography",
  "Pictorials",
  "Astrological Sign",
  "Years Active",
];

describe("export CSV helpers", () => {
  it("escapes commas, quotes, newlines, semicolon lists, and pipe text", () => {
    expect(escapeCsvValue('Title, "quoted"\nA; B | C')).toBe(
      '"Title, ""quoted""\nA; B | C"',
    );
  });

  it("exports Videos with locked Bulk Manual Edit header order", () => {
    expect(buildVideosCsv([])).toBe(
      [
        "Action",
        "Sakurava Ref",
        "Code",
        "Title",
        "Original Title",
        "Release Date",
        "Publisher / Label",
        "Censorship",
        "Categories",
        "Rating - Visual",
        "Rating - Story",
        "Rating - Performance",
        "Rating - Chemistry",
        "Rating - Intensity",
        "Rating - Rewatch",
        "Media Path",
        "Cover Path",
        "Related Performers",
        "Related Images",
        "Notes",
      ].join(","),
    );
  });

  it("exports Images with locked Bulk Manual Edit header order", () => {
    expect(buildImagesCsv([])).toBe(
      [
        "Action",
        "Sakurava Ref",
        "Code",
        "Title",
        "Original Title",
        "Release Date",
        "Publisher / Label",
        "Censorship",
        "Categories",
        "Rating - Visual",
        "Rating - Posing",
        "Rating - Atmosphere",
        "Rating - Flow",
        "Rating - Memorability",
        "Rating - Signature",
        "Cover Path",
        "Gallery Folder Path",
        "Gallery Image 1",
        "Gallery Image 2",
        "Gallery Image 3",
        "Gallery Image 4",
        "Related Performers",
        "Related Videos",
        "Notes",
      ].join(","),
    );
  });

  it("exports Performers with locked Bulk Manual Edit header order", () => {
    expect(buildPerformersCsv([])).toBe(
      [
        "Action",
        "Sakurava Ref",
        "Name",
        "Original Name",
        "Aliases",
        "Birth Date",
        "Debut Date",
        "Retired Date",
        "Birthplace",
        "Nationality",
        "Blood Type",
        "Height (cm)",
        "Weight (kg)",
        "Measurements",
        "Cup Size",
        "Categories",
        "Rating - Visual",
        "Rating - Performance",
        "Rating - Popularity",
        "Rating - Versatility",
        "Rating - Attraction",
        "Rating - Exceptional",
        "Cover Path",
        "Mini Thumbnail 1",
        "Mini Thumbnail 2",
        "Mini Thumbnail 3",
        "Mini Thumbnail 4",
        "Related Videos",
        "Related Images",
        "Notes",
      ].join(","),
    );
  });

  it("exports Categories with locked Bulk Manual Edit header order", () => {
    expect(buildCategoriesCsv([])).toBe(
      [
        "Action",
        "Sakurava Ref",
        "Parent Category",
        "Category Name",
        "Description",
        "Thumbnail Path",
        "Show in Videos",
        "Show in Images",
        "Show in Performers",
        "Visibility",
        "Notes",
      ].join(","),
    );
  });

  it("defaults Action to Auto and emits stable prefixed Sakurava Refs", () => {
    const videoRow = dataRow(buildVideosCsv([video({ id: "video-1" })]));
    const imageRow = dataRow(buildImagesCsv([image({ id: "image-1" })]));
    const performerRow = dataRow(
      buildPerformersCsv([performer({ id: "performer-1" })]),
    );
    const categoryRow = dataRow(
      buildCategoriesCsv([category({ key: "cat_drama", name: "Drama" })]),
    );

    expect(videoRow).toMatch(/^Auto,VID-[0-9A-Z]{7},/);
    expect(imageRow).toMatch(/^Auto,IMG-[0-9A-Z]{7},/);
    expect(performerRow).toMatch(/^Auto,PER-[0-9A-Z]{7},/);
    expect(categoryRow).toMatch(/^Auto,CAT-[0-9A-Z]{7},/);
    expect(sakuravaRef("VID", "video-1")).toBe(sakuravaRef("VID", "video-1"));
    expect(videoRow).not.toContain("video-1");
  });

  it("exports Video and Image Code columns without raw id or uuid leakage", () => {
    const videoCsv = buildVideosCsv([
      video({ id: "raw-video-uuid", code: "V-CODE-001" }),
    ]);
    const imageCsv = buildImagesCsv([
      image({ id: "raw-image-uuid", code: "I-CODE-001" }),
    ]);

    expect(buildVideosCsv([]).split(",").slice(0, 4)).toEqual([
      "Action",
      "Sakurava Ref",
      "Code",
      "Title",
    ]);
    expect(buildImagesCsv([]).split(",").slice(0, 4)).toEqual([
      "Action",
      "Sakurava Ref",
      "Code",
      "Title",
    ]);
    expect(dataRow(videoCsv)).toContain(",V-CODE-001,");
    expect(dataRow(imageCsv)).toContain(",I-CODE-001,");
    expect(videoCsv).not.toContain("raw-video-uuid");
    expect(imageCsv).not.toContain("raw-image-uuid");
  });

  it("does not export internal update keys, IDs, UUIDs, raw JSON names, or calculated headers", () => {
    const headers = [
      ...buildVideosCsv([]).split(","),
      ...buildImagesCsv([]).split(","),
      ...buildPerformersCsv([]).split(","),
      ...buildCategoriesCsv([]).split(","),
    ];

    for (const header of [...rawInternalHeaders, ...calculatedHeaders]) {
      expect(headers).not.toContain(header);
    }
  });

  it("keeps a reusable friendly header to internal field mapping", () => {
    expect(videoCsvSchema.find((column) => column.header === "Action"))
      .toMatchObject({ internalField: "bulkAction" });
    expect(videoCsvSchema.find((column) => column.header === "Sakurava Ref"))
      .toMatchObject({ internalField: "sakuravaRef" });
    expect(videoCsvSchema.find((column) => column.header === "Rating - Visual"))
      .toMatchObject({ internalField: "ratingJson.visual" });
    expect(imageCsvSchema.find((column) => column.header === "Gallery Image 1"))
      .toMatchObject({ internalField: "galleryImagePathsJson.1" });
    expect(performerCsvSchema.find((column) => column.header === "Mini Thumbnail 1"))
      .toMatchObject({ internalField: "performerThumbnailPathsJson.1" });
  });

  it("splits rating JSON into readable columns", () => {
    const videoCsv = buildVideosCsv([
      video({ ratingJson: '{"visual":4,"story":5,"rewatch":2}' }),
    ]);
    const imageCsv = buildImagesCsv([
      image({ ratingJson: '{"posing":3,"memorability":4}' }),
    ]);
    const performerCsv = buildPerformersCsv([
      performer({ ratingJson: '{"attraction":5,"exceptional":"4"}' }),
    ]);

    expect(dataRow(videoCsv)).toContain("4,5,,,,2");
    expect(dataRow(imageCsv)).toContain(",3,,,4,");
    expect(dataRow(performerCsv)).toContain(",,,,5,4");
    expect(videoCsv).not.toContain('"{""visual""');
  });

  it("exports categories as semicolon-separated readable values", () => {
    const csv = buildVideosCsv([
      video({
        categoriesJson:
          '["Genre > Drama","Format > Short","Favorite"]',
      }),
    ]);

    expect(csv).toContain("Genre > Drama; Format > Short; Favorite");
  });

  it("exports all CSV date fields as YYYY-MM-DD without M/D/YYYY output", () => {
    const videoCsv = buildVideosCsv([
      video({ releaseDate: "5/7/2026" }),
    ]);
    const imageCsv = buildImagesCsv([
      image({ releaseDate: "05/08/2026" }),
    ]);
    const performerCsv = buildPerformersCsv([
      performer({
        birthDate: "2026-05-09T10:30:00Z",
        debutDate: "5/10/2026",
        retiredDate: "05/11/2026",
      }),
    ]);

    expect(videoCsv).toContain("2026-05-07");
    expect(imageCsv).toContain("2026-05-08");
    expect(performerCsv).toContain("2026-05-09,2026-05-10,2026-05-11");
    expect(`${videoCsv}\n${imageCsv}\n${performerCsv}`).not.toMatch(
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,
    );
  });

  it("exports related values as REF pipe display text where possible", () => {
    const performerId = "performer-1";
    const videoId = "video-1";
    const imageId = "image-1";
    const videoCsv = buildVideosCsv([
      video({
        relatedPerformersJson: JSON.stringify([
          { performerId, nameSnapshot: "Performer A" },
        ]),
        relatedImagesJson: JSON.stringify([
          { recordId: imageId, titleSnapshot: "Image Set A" },
        ]),
      }),
    ]);
    const imageCsv = buildImagesCsv([
      image({
        relatedVideosJson: JSON.stringify([
          { recordId: videoId, titleSnapshot: "Video A" },
        ]),
      }),
    ]);

    expect(videoCsv).toContain(`${sakuravaRef("PER", performerId)} | Performer A`);
    expect(videoCsv).toContain(`${sakuravaRef("IMG", imageId)} | Image Set A`);
    expect(imageCsv).toContain(`${sakuravaRef("VID", videoId)} | Video A`);
    expect(videoCsv).not.toContain(performerId);
    expect(videoCsv).not.toContain(imageId);
  });

  it("splits path arrays into limited editable path columns", () => {
    const imageCsv = buildImagesCsv([
      image({
        galleryImagePathsJson: JSON.stringify([
          "D:/Images/one.jpg",
          "D:/Images/two.jpg",
          "D:/Images/three.jpg",
          "D:/Images/four.jpg",
          "D:/Images/five.jpg",
        ]),
      }),
    ]);
    const performerCsv = buildPerformersCsv([
      performer({
        performerThumbnailPathsJson: JSON.stringify([
          "D:/Thumbs/one.jpg",
          "D:/Thumbs/two.jpg",
        ]),
      }),
    ]);

    expect(dataRow(imageCsv)).toContain(
      "D:/Images/one.jpg,D:/Images/two.jpg,D:/Images/three.jpg,D:/Images/four.jpg",
    );
    expect(imageCsv).not.toContain("D:/Images/five.jpg");
    expect(dataRow(performerCsv)).toContain("D:/Thumbs/one.jpg,D:/Thumbs/two.jpg,,,");
  });

  it("exports category parent names without raw keys", () => {
    const csv = buildCategoriesCsv([
      category({ key: "cat_parent", name: "Genre" }),
      category({
        key: "cat_child",
        parentKey: "cat_parent",
        name: "Drama",
        description: "Story category",
        thumbnailPath: "D:/Thumbs/drama.jpg",
      }),
    ]);

    expect(csv).toContain(`${sakuravaRef("CAT", "cat_child")},Genre,Drama`);
    expect(csv).not.toContain("cat_parent");
    expect(csv).not.toContain("cat_child");
  });

  it("keeps CSV escaping for exported rows", () => {
    const csv = buildVideosCsv([
      video({
        title: 'Clip, "One"',
        notes: "Line one\nLine two",
        categoriesJson: '["Drama, Featured","Quoted \\"Category\\""]',
      }),
    ]);

    expect(csv).toContain('"Clip, ""One"""');
    expect(csv).toContain('"Drama, Featured; Quoted ""Category"""');
    expect(csv).toContain('"Line one\nLine two"');
  });
});

function dataRow(csv: string) {
  return csv.split("\r\n")[1] ?? "";
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
    showInImages: true,
    showInPerformers: true,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}
