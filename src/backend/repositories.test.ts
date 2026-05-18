import {
  RepositoryNotConnectedError,
  createRepositorySkeletons,
} from "./repositories";

describe("repository foundation", () => {
  it("creates isolated repositories for each entity", () => {
    const repositories = createRepositorySkeletons();

    expect(Object.keys(repositories)).toEqual([
      "videos",
      "images",
      "performers",
      "managedCategories",
    ]);
    expect(repositories.videos).not.toBe(repositories.images);
    expect(repositories.images).not.toBe(repositories.performers);
    expect(repositories.performers).not.toBe(repositories.managedCategories);
  });

  it("fails explicitly until a SQLite adapter is connected", async () => {
    const repositories = createRepositorySkeletons();

    await expect(repositories.videos.list()).rejects.toThrow(
      RepositoryNotConnectedError,
    );
    await expect(repositories.images.count()).rejects.toThrow(
      "images repository is not connected to SQLite yet.",
    );
    await expect(repositories.performers.getById("sample-id")).rejects.toThrow(
      "performers repository is not connected to SQLite yet.",
    );
    await expect(repositories.managedCategories.list()).rejects.toThrow(
      "managedCategories repository is not connected to SQLite yet.",
    );
  });
});
