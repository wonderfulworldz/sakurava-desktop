import {
  RepositoryRecordNotFoundError,
  RepositoryValidationError,
} from "../repositories";
import { createInMemoryRepositories } from "../testing/inMemoryRepositories";
import {
  RUNTIME_COMMAND_NAMES,
  UnknownRuntimeCommandError,
  createRepositoryRuntimeCommandInvoker,
  createRuntimeCommandClient,
  executeRepositoryRuntimeCommand,
  executeRuntimeCommandByName,
  isRuntimeCommandName,
} from "./commands";

describe("runtime command contracts", () => {
  it("defines the approved CRUD command names in a stable order", () => {
    expect(RUNTIME_COMMAND_NAMES).toEqual([
      "video_create",
      "video_list",
      "video_get",
      "video_update",
      "video_delete",
      "image_create",
      "image_list",
      "image_get",
      "image_update",
      "image_delete",
      "performer_create",
      "performer_list",
      "performer_get",
      "performer_update",
      "performer_delete",
    ]);
  });

  it("recognizes only defined runtime command names", () => {
    expect(isRuntimeCommandName("video_create")).toBe(true);
    expect(isRuntimeCommandName("performer_delete")).toBe(true);
    expect(isRuntimeCommandName("category_create")).toBe(false);
    expect(isRuntimeCommandName("video_related_add")).toBe(false);
  });
});

describe("repository runtime command invoker", () => {
  it("routes video commands to the video repository", async () => {
    const repositories = createInMemoryRepositories(() => "2026-05-11T00:00:00.000Z");
    const invoker = createRepositoryRuntimeCommandInvoker(repositories);

    const created = await invoker.invoke("video_create", {
      title: " Video Runtime ",
      categoriesJson: '["Favorite","Runtime"]',
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
      relatedImagesJson:
        '[{"recordId":"image-1","titleSnapshot":"Image One"}]',
      ratingJson: '{"rewatch":4}',
    });

    expect(created).toMatchObject({
      id: "video-1",
      title: "Video Runtime",
      categoriesJson: '["Favorite","Runtime"]',
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
      relatedImagesJson:
        '[{"recordId":"image-1","titleSnapshot":"Image One"}]',
      ratingJson: '{"rewatch":4}',
      favorite: false,
    });
    expect(await invoker.invoke("video_list", undefined)).toEqual([created]);
    expect(await invoker.invoke("video_get", { id: created.id })).toEqual(created);

    const updated = await invoker.invoke("video_update", {
      id: created.id,
      patch: {
        title: "Updated Runtime Video",
        favorite: true,
        relatedImagesJson:
          '[{"recordId":"image-2","titleSnapshot":"Image Two"}]',
      },
    });

    expect(updated).toMatchObject({
      id: created.id,
      title: "Updated Runtime Video",
      favorite: true,
      relatedImagesJson:
        '[{"recordId":"image-2","titleSnapshot":"Image Two"}]',
    });

    expect(await invoker.invoke("video_delete", { id: created.id })).toEqual({
      id: created.id,
      deleted: true,
    });
    expect(await invoker.invoke("video_get", { id: created.id })).toBeNull();
  });

  it("routes image commands to the image repository", async () => {
    const repositories = createInMemoryRepositories(() => "2026-05-11T00:00:00.000Z");
    const invoker = createRepositoryRuntimeCommandInvoker(repositories);

    const created = await invoker.invoke("image_create", {
      title: "Image Runtime",
      folderPath: "D:/images/runtime",
      imageCount: 24,
      galleryImagePathsJson:
        '[" D:/images/runtime/one.jpg ","","D:/images/runtime/two.jpg","D:/images/runtime/one.jpg"]',
      categoriesJson: '["Pictorial"]',
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
      relatedVideosJson:
        '[{"recordId":"video-1","titleSnapshot":"Video One"}]',
      ratingJson: '{"visual":5}',
    });

    expect(created).toMatchObject({
      id: "image-1",
      title: "Image Runtime",
      imageCount: 24,
      galleryImagePathsJson:
        '["D:/images/runtime/one.jpg","D:/images/runtime/two.jpg"]',
      categoriesJson: '["Pictorial"]',
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
      relatedVideosJson:
        '[{"recordId":"video-1","titleSnapshot":"Video One"}]',
      ratingJson: '{"visual":5}',
    });
    expect(await invoker.invoke("image_list", undefined)).toEqual([created]);

    const updated = await invoker.invoke("image_update", {
      id: created.id,
      patch: {
        imageCount: null,
        galleryImagePathsJson: "{bad json",
        categoriesJson: '["Updated Image"]',
        relatedVideosJson:
          '[{"recordId":"video-2","titleSnapshot":"Video Two"}]',
      },
    });

    expect(updated).toMatchObject({
      id: created.id,
      imageCount: null,
      galleryImagePathsJson: "[]",
      categoriesJson: '["Updated Image"]',
      relatedVideosJson:
        '[{"recordId":"video-2","titleSnapshot":"Video Two"}]',
    });
    expect(await invoker.invoke("image_delete", { id: created.id })).toEqual({
      id: created.id,
      deleted: true,
    });
  });

  it("routes performer commands to the performer repository", async () => {
    const repositories = createInMemoryRepositories(() => "2026-05-11T00:00:00.000Z");
    const invoker = createRepositoryRuntimeCommandInvoker(repositories);

    const created = await invoker.invoke("performer_create", {
      name: "Performer Runtime",
      aliasesJson: '["Alias A","Alias B"]',
      performerThumbnailPathsJson:
        '[" D:/thumbs/runtime-1.jpg ","","D:/thumbs/runtime-2.jpg","D:/thumbs/runtime-1.jpg"]',
      categoriesJson: '["Featured"]',
      ratingJson: '{"visual":5}',
    });

    expect(created).toMatchObject({
      id: "performer-1",
      name: "Performer Runtime",
      aliasesJson: '["Alias A","Alias B"]',
      performerThumbnailPathsJson:
        '["D:/thumbs/runtime-1.jpg","D:/thumbs/runtime-2.jpg"]',
      categoriesJson: '["Featured"]',
      ratingJson: '{"visual":5}',
    });
    expect(await invoker.invoke("performer_list", undefined)).toEqual([created]);

    const updated = await invoker.invoke("performer_update", {
      id: created.id,
      patch: {
        aliasesJson: '["Updated Alias"]',
        performerThumbnailPathsJson: "{bad json",
        favorite: true,
      },
    });

    expect(updated).toMatchObject({
      id: created.id,
      aliasesJson: '["Updated Alias"]',
      performerThumbnailPathsJson: "[]",
      favorite: true,
    });
    expect(await invoker.invoke("performer_delete", { id: created.id })).toEqual({
      id: created.id,
      deleted: true,
    });
  });

  it("reuses repository validation and not-found errors", async () => {
    const repositories = createInMemoryRepositories();
    const invoker = createRepositoryRuntimeCommandInvoker(repositories);

    await expect(invoker.invoke("video_create", { title: "" })).rejects.toThrow(
      RepositoryValidationError,
    );
    await expect(
      invoker.invoke("performer_update", {
        id: "missing-id",
        patch: { name: "Nope" },
      }),
    ).rejects.toThrow(RepositoryRecordNotFoundError);
  });

  it("supports direct repository command execution", async () => {
    const repositories = createInMemoryRepositories();

    const created = await executeRepositoryRuntimeCommand(
      repositories,
      "image_create",
      { title: "Direct Image" },
    );

    expect(created).toMatchObject({
      id: "image-1",
      title: "Direct Image",
    });
  });
});

describe("runtime command client boundary", () => {
  it("delegates to an injected invoker without importing Tauri", async () => {
    const calls: Array<{ command: string; payload: unknown }> = [];
    const client = createRuntimeCommandClient({
      async invoke(command, payload) {
        calls.push({ command, payload });
        return { id: "video-1", title: "From Invoker" } as never;
      },
    });

    await expect(client.invoke("video_get", { id: "video-1" })).resolves.toEqual({
      id: "video-1",
      title: "From Invoker",
    });
    expect(calls).toEqual([
      { command: "video_get", payload: { id: "video-1" } },
    ]);
  });

  it("rejects unknown command names before invoking runtime transport", async () => {
    const client = createRuntimeCommandClient({
      async invoke() {
        throw new Error("Should not be called");
      },
    });

    await expect(
      executeRuntimeCommandByName(client, "category_create", {}),
    ).rejects.toThrow(UnknownRuntimeCommandError);
  });
});
