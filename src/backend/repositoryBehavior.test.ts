import {
  RepositoryRecordNotFoundError,
  RepositoryValidationError,
} from "./repositories";
import {
  parseGalleryImagePathArray,
  parsePerformerThumbnailPathArray,
  parseRatingObject,
  parseTextLabelArray,
} from "./json";
import type { NewImage, NewPerformer, NewVideo } from "./types";
import {
  createInMemoryImageRepository,
  createInMemoryPerformerRepository,
  createInMemoryRepositories,
  createInMemoryVideoRepository,
} from "./testing/inMemoryRepositories";

function clock(...timestamps: string[]) {
  let index = 0;

  return () => timestamps[index++] ?? timestamps[timestamps.length - 1];
}

const baseVideo = {
  title: " Sample Video ",
  originalTitle: "",
  code: "SV-001",
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
  categoriesJson: '["Favorite","Classic"]',
  relatedPerformersJson:
    '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
  relatedImagesJson:
    '[{"recordId":"image-1","titleSnapshot":"Image One"}]',
  ratingJson: '{"rewatch":4,"visual":5}',
  notes: "",
  favorite: false,
} satisfies NewVideo;

const baseImage = {
  title: " Sample Image ",
  originalTitle: "",
  code: "SI-001",
  censorship: "",
  availability: "",
  releaseDate: "",
  publisherLabel: "",
  coverPath: "",
  folderPath: "D:/images/sample",
  imageCount: 24,
  mainResolution: "",
  totalFileSizeBytes: null,
  mainFileType: "",
  galleryImagePathsJson:
    '[" D:/images/sample/one.jpg ","","D:/images/sample/two.jpg","D:/images/sample/one.jpg",7]',
  categoriesJson: '["Pictorial","Favorite"]',
  relatedPerformersJson:
    '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
  relatedVideosJson:
    '[{"recordId":"video-1","titleSnapshot":"Video One"}]',
  ratingJson: '{"memorability":4,"visual":5}',
  notes: "",
  favorite: false,
} satisfies NewImage;

const basePerformer = {
  name: " Sample Performer ",
  originalName: "",
  aliasesJson: '["Alias A","Alias B"]',
  status: "",
  debutDate: "",
  retiredDate: "",
  birthDate: "",
  gender: "",
  birthplace: "",
  nationality: "",
  bloodType: "",
  heightCm: null,
  weightKg: null,
  measurements: "",
  cupSize: "",
  coverPath: "",
  performerThumbnailPathsJson: '["D:/thumbs/one.jpg","D:/thumbs/two.jpg"]',
  filmographyCount: null,
  pictorialsCount: null,
  relatedVideosJson: "[]",
  relatedImagesJson: "[]",
  categoriesJson: '["Featured","Classic"]',
  ratingJson: '{"visual":5}',
  notes: "",
  favorite: false,
} satisfies NewPerformer;

describe("in-memory repository adapter", () => {
  it("creates isolated repositories for tests only", async () => {
    const repositories = createInMemoryRepositories();

    await repositories.videos.create(baseVideo);
    await repositories.images.create(baseImage);
    await repositories.performers.create(basePerformer);

    expect(await repositories.videos.count()).toBe(1);
    expect(await repositories.images.count()).toBe(1);
    expect(await repositories.performers.count()).toBe(1);
  });
});

describe("video repository behavior", () => {
  it("creates, lists, gets, updates, counts, and deletes videos", async () => {
    const repository = createInMemoryVideoRepository(
      clock("2026-05-11T00:00:00.000Z", "2026-05-11T00:01:00.000Z"),
    );

    const created = await repository.create({ ...baseVideo, favorite: undefined });

    expect(created).toMatchObject({
      id: "video-1",
      title: "Sample Video",
      favorite: false,
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
      relatedImagesJson:
        '[{"recordId":"image-1","titleSnapshot":"Image One"}]',
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
    });
    expect(parseTextLabelArray(created.categoriesJson)).toEqual([
      "Favorite",
      "Classic",
    ]);
    expect(parseRatingObject(created.ratingJson)).toEqual({
      rewatch: 4,
      visual: 5,
    });

    expect(await repository.list()).toEqual([created]);
    expect(await repository.getById(created.id)).toEqual(created);
    expect(await repository.count()).toBe(1);

    const updated = await repository.update(created.id, {
      title: "Updated Video",
      categoriesJson: '["Updated Label"]',
      relatedPerformersJson:
        '[{"performerId":"performer-2","nameSnapshot":"Performer Two"}]',
      relatedImagesJson:
        '[{"recordId":"image-2","titleSnapshot":"Image Two"}]',
      ratingJson: "{bad json",
      favorite: true,
    });

    expect(updated).toMatchObject({
      id: created.id,
      title: "Updated Video",
      favorite: true,
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:01:00.000Z",
      categoriesJson: '["Updated Label"]',
      relatedPerformersJson:
        '[{"performerId":"performer-2","nameSnapshot":"Performer Two"}]',
      relatedImagesJson:
        '[{"recordId":"image-2","titleSnapshot":"Image Two"}]',
      ratingJson: "{}",
    });

    await repository.delete(created.id);
    expect(await repository.getById(created.id)).toBeNull();
    expect(await repository.list()).toEqual([]);
    expect(await repository.count()).toBe(0);
  });

  it("rejects videos without a title", async () => {
    const repository = createInMemoryVideoRepository();

    await expect(
      repository.create({ ...baseVideo, title: " " }),
    ).rejects.toThrow(RepositoryValidationError);
  });

  it("rejects updates for missing videos", async () => {
    const repository = createInMemoryVideoRepository();

    await expect(repository.update("missing", { title: "Nope" })).rejects.toThrow(
      RepositoryRecordNotFoundError,
    );
  });
});

describe("related Video/Image storage behavior", () => {
  it("does not mutate target records when saving current record relations", async () => {
    const repositories = createInMemoryRepositories(
      clock(
        "2026-05-11T03:00:00.000Z",
        "2026-05-11T03:01:00.000Z",
        "2026-05-11T03:02:00.000Z",
        "2026-05-11T03:03:00.000Z",
      ),
    );

    const image = await repositories.images.create({
      ...baseImage,
      relatedVideosJson: "[]",
    });
    const video = await repositories.videos.create({
      ...baseVideo,
      relatedImagesJson: "[]",
    });

    await repositories.videos.update(video.id, {
      relatedImagesJson: `[{"recordId":"${image.id}","titleSnapshot":"${image.title}"}]`,
    });

    expect(await repositories.images.getById(image.id)).toEqual(image);

    await repositories.images.update(image.id, {
      relatedVideosJson: `[{"recordId":"${video.id}","titleSnapshot":"${video.title}"}]`,
    });

    const videoAfterImageSave = await repositories.videos.getById(video.id);
    expect(videoAfterImageSave?.relatedImagesJson).toBe(
      `[{"recordId":"${image.id}","titleSnapshot":"${image.title}"}]`,
    );
  });
});

describe("image repository behavior", () => {
  it("creates, lists, gets, updates, counts, and deletes images", async () => {
    const repository = createInMemoryImageRepository(
      clock("2026-05-11T01:00:00.000Z", "2026-05-11T01:01:00.000Z"),
    );

    const created = await repository.create({ ...baseImage, favorite: undefined });

    expect(created).toMatchObject({
      id: "image-1",
      title: "Sample Image",
      favorite: false,
      imageCount: 24,
      galleryImagePathsJson:
        '["D:/images/sample/one.jpg","D:/images/sample/two.jpg"]',
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
      relatedVideosJson:
        '[{"recordId":"video-1","titleSnapshot":"Video One"}]',
      createdAt: "2026-05-11T01:00:00.000Z",
      updatedAt: "2026-05-11T01:00:00.000Z",
    });
    expect(parseTextLabelArray(created.categoriesJson)).toEqual([
      "Pictorial",
      "Favorite",
    ]);
    expect(parseRatingObject(created.ratingJson)).toEqual({
      memorability: 4,
      visual: 5,
    });
    expect(parseGalleryImagePathArray(created.galleryImagePathsJson)).toEqual([
      "D:/images/sample/one.jpg",
      "D:/images/sample/two.jpg",
    ]);

    expect(await repository.list()).toEqual([created]);
    expect(await repository.getById(created.id)).toEqual(created);
    expect(await repository.count()).toBe(1);

    const updated = await repository.update(created.id, {
      title: "Updated Image",
      imageCount: null,
      galleryImagePathsJson: "{bad json",
      categoriesJson: '["Updated Image Label"]',
      relatedPerformersJson: "{bad json",
      relatedVideosJson:
        '[{"recordId":"video-2","titleSnapshot":"Video Two"}]',
      ratingJson: "",
      favorite: true,
    });

    expect(updated).toMatchObject({
      id: created.id,
      title: "Updated Image",
      favorite: true,
      imageCount: null,
      galleryImagePathsJson: "[]",
      categoriesJson: '["Updated Image Label"]',
      relatedPerformersJson: "[]",
      relatedVideosJson:
        '[{"recordId":"video-2","titleSnapshot":"Video Two"}]',
      ratingJson: "{}",
      createdAt: "2026-05-11T01:00:00.000Z",
      updatedAt: "2026-05-11T01:01:00.000Z",
    });

    await repository.delete(created.id);
    expect(await repository.getById(created.id)).toBeNull();
    expect(await repository.count()).toBe(0);
  });

  it("rejects images without a title", async () => {
    const repository = createInMemoryImageRepository();

    await expect(
      repository.create({ ...baseImage, title: "" }),
    ).rejects.toThrow(RepositoryValidationError);
  });
});

describe("performer repository behavior", () => {
  it("creates, lists, gets, updates, counts, and deletes performers", async () => {
    const repository = createInMemoryPerformerRepository(
      clock("2026-05-11T02:00:00.000Z", "2026-05-11T02:01:00.000Z"),
    );

    const created = await repository.create({
      ...basePerformer,
      favorite: undefined,
    });

    expect(created).toMatchObject({
      id: "performer-1",
      name: "Sample Performer",
      favorite: false,
      gender: "",
      performerThumbnailPathsJson:
        '["D:/thumbs/one.jpg","D:/thumbs/two.jpg"]',
      createdAt: "2026-05-11T02:00:00.000Z",
      updatedAt: "2026-05-11T02:00:00.000Z",
    });
    expect(parseTextLabelArray(created.aliasesJson)).toEqual([
      "Alias A",
      "Alias B",
    ]);
    expect(parseTextLabelArray(created.categoriesJson)).toEqual([
      "Featured",
      "Classic",
    ]);
    expect(parseRatingObject(created.ratingJson)).toEqual({ visual: 5 });
    expect(
      parsePerformerThumbnailPathArray(created.performerThumbnailPathsJson),
    ).toEqual(["D:/thumbs/one.jpg", "D:/thumbs/two.jpg"]);

    expect(await repository.list()).toEqual([created]);
    expect(await repository.getById(created.id)).toEqual(created);
    expect(await repository.count()).toBe(1);

    const updated = await repository.update(created.id, {
      name: "Updated Performer",
      aliasesJson: '["Updated Alias"]',
      performerThumbnailPathsJson:
        '[" D:/thumbs/three.jpg ","","D:/thumbs/three.jpg","D:/thumbs/four.jpg","D:/thumbs/five.jpg","D:/thumbs/six.jpg","D:/thumbs/seven.jpg"]',
      categoriesJson: '["Updated Performer Label"]',
      ratingJson: "{bad json",
      favorite: true,
      debutDate: "2020-01-02",
      retiredDate: "2024-03-04",
      gender: "Woman",
      birthplace: "Tokyo",
      nationality: "Japanese",
      bloodType: "A",
      heightCm: 160,
      weightKg: 48,
      measurements: "80 / 58 / 84 cm",
      cupSize: "C",
      filmographyCount: 10,
      pictorialsCount: 4,
    });

    expect(updated).toMatchObject({
      id: created.id,
      name: "Updated Performer",
      favorite: true,
      aliasesJson: '["Updated Alias"]',
      performerThumbnailPathsJson:
        '["D:/thumbs/three.jpg","D:/thumbs/four.jpg","D:/thumbs/five.jpg","D:/thumbs/six.jpg"]',
      categoriesJson: '["Updated Performer Label"]',
      ratingJson: "{}",
      debutDate: "2020-01-02",
      retiredDate: "2024-03-04",
      gender: "Woman",
      birthplace: "Tokyo",
      nationality: "Japanese",
      bloodType: "A",
      heightCm: 160,
      weightKg: 48,
      measurements: "80 / 58 / 84 cm",
      cupSize: "C",
      filmographyCount: 10,
      pictorialsCount: 4,
      createdAt: "2026-05-11T02:00:00.000Z",
      updatedAt: "2026-05-11T02:01:00.000Z",
    });

    await repository.delete(created.id);
    expect(await repository.getById(created.id)).toBeNull();
    expect(await repository.count()).toBe(0);
  });

  it("rejects performers without a name", async () => {
    const repository = createInMemoryPerformerRepository();

    await expect(
      repository.create({ ...basePerformer, name: " " }),
    ).rejects.toThrow(RepositoryValidationError);
  });
});
