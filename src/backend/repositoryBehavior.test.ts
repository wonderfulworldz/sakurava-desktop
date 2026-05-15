import {
  RepositoryRecordNotFoundError,
  RepositoryValidationError,
} from "./repositories";
import { parseRatingObject, parseTextLabelArray } from "./json";
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
  publisherLabel: "",
  coverPath: "",
  mediaPath: "",
  categoriesJson: '["Favorite","Classic"]',
  relatedPerformersJson:
    '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
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
  categoriesJson: '["Pictorial","Favorite"]',
  relatedPerformersJson:
    '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
  ratingJson: '{"memorability":4,"visual":5}',
  notes: "",
  favorite: false,
} satisfies NewImage;

const basePerformer = {
  name: " Sample Performer ",
  originalName: "",
  aliasesJson: '["Alias A","Alias B"]',
  status: "",
  birthDate: "",
  coverPath: "",
  filmographyCount: null,
  pictorialsCount: null,
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
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
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

    expect(await repository.list()).toEqual([created]);
    expect(await repository.getById(created.id)).toEqual(created);
    expect(await repository.count()).toBe(1);

    const updated = await repository.update(created.id, {
      title: "Updated Image",
      imageCount: null,
      categoriesJson: '["Updated Image Label"]',
      relatedPerformersJson: "{bad json",
      ratingJson: "",
      favorite: true,
    });

    expect(updated).toMatchObject({
      id: created.id,
      title: "Updated Image",
      favorite: true,
      imageCount: null,
      categoriesJson: '["Updated Image Label"]',
      relatedPerformersJson: "[]",
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

    expect(await repository.list()).toEqual([created]);
    expect(await repository.getById(created.id)).toEqual(created);
    expect(await repository.count()).toBe(1);

    const updated = await repository.update(created.id, {
      name: "Updated Performer",
      aliasesJson: '["Updated Alias"]',
      categoriesJson: '["Updated Performer Label"]',
      ratingJson: "{bad json",
      favorite: true,
      filmographyCount: 10,
      pictorialsCount: 4,
    });

    expect(updated).toMatchObject({
      id: created.id,
      name: "Updated Performer",
      favorite: true,
      aliasesJson: '["Updated Alias"]',
      categoriesJson: '["Updated Performer Label"]',
      ratingJson: "{}",
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
