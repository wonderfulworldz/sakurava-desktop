import {
  RepositoryRecordNotFoundError,
  RepositoryValidationError,
} from "../repositories";
import { ADD_PERFORMER_GENDER_COLUMN_SQL, SCHEMA_SQL } from "../schema";
import type { SqliteDatabase, SqliteValue } from "./database";
import { initializeSakuravaSchema } from "./database";
import {
  createSqliteImageRepository,
  createSqliteManagedCategoryRepository,
  createSqlitePerformerRepository,
  createSqliteRepositories,
  createSqliteVideoRepository,
} from "./adapter";

type SqliteRow = Record<string, SqliteValue>;

class FakeSqliteDatabase implements SqliteDatabase {
  readonly executed: Array<{ sql: string; params: readonly SqliteValue[] }> = [];
  private readonly tables = new Map<string, Map<string, SqliteRow>>();

  async execute(sql: string, params: readonly SqliteValue[] = []) {
    this.executed.push({ sql, params });

    const trimmed = sql.trim();

    if (trimmed.startsWith("CREATE TABLE")) {
      return;
    }

    if (trimmed.startsWith("INSERT INTO")) {
      this.insert(trimmed, params);
      return;
    }

    if (trimmed.startsWith("UPDATE")) {
      this.update(trimmed, params);
      return;
    }

    if (trimmed.startsWith("DELETE FROM")) {
      this.delete(trimmed, params);
    }
  }

  async queryOne<TRecord>(sql: string, params: readonly SqliteValue[] = []) {
    this.executed.push({ sql, params });
    const trimmed = sql.trim();

    if (trimmed.startsWith("SELECT COUNT(*)")) {
      const tableName = this.matchTable(trimmed, /FROM ([A-Za-z_]+)/);
      return { count: this.table(tableName).size } as TRecord;
    }

    if (trimmed.startsWith("SELECT *")) {
      const tableName = this.matchTable(trimmed, /FROM ([A-Za-z_]+)/);
      const id = String(params[0]);
      const row = this.table(tableName).get(id);
      return row ? (structuredClone(row) as TRecord) : null;
    }

    return null;
  }

  async queryAll<TRecord>(sql: string, params: readonly SqliteValue[] = []) {
    this.executed.push({ sql, params });
    const trimmed = sql.trim();

    if (trimmed.startsWith("PRAGMA table_info")) {
      return [] as TRecord[];
    }

    const tableName = this.matchTable(trimmed, /FROM ([A-Za-z_]+)/);

    if (trimmed.includes("WHERE parentKey = ?")) {
      return Array.from(this.table(tableName).values())
        .filter((row) => row.parentKey === params[0])
        .map((row) => structuredClone(row) as TRecord);
    }

    return Array.from(this.table(tableName).values())
      .sort((first, second) =>
        String(second.createdAt).localeCompare(String(first.createdAt)),
      )
      .map((row) => structuredClone(row) as TRecord);
  }

  private insert(sql: string, params: readonly SqliteValue[]) {
    const tableName = this.matchTable(sql, /INSERT INTO ([A-Za-z_]+)/);
    const columns = this.matchColumns(sql);
    const row = Object.fromEntries(
      columns.map((column, index) => [column, params[index] ?? null]),
    );

    this.table(tableName).set(String(row.id ?? row.key), row);
  }

  private update(sql: string, params: readonly SqliteValue[]) {
    const tableName = this.matchTable(sql, /UPDATE ([A-Za-z_]+)/);
    const key = String(params[params.length - 1]);
    const existing = this.table(tableName).get(key);

    if (!existing) {
      return;
    }

    const setColumns = sql
      .slice(sql.indexOf("SET") + 3, sql.indexOf("WHERE"))
      .split(",")
      .map((part) => part.trim().split(" = ")[0]);

    for (const [index, column] of setColumns.entries()) {
      existing[column] = params[index] ?? null;
    }
  }

  private delete(sql: string, params: readonly SqliteValue[]) {
    const tableName = this.matchTable(sql, /DELETE FROM ([A-Za-z_]+)/);
    this.table(tableName).delete(String(params[0]));
  }

  private matchTable(sql: string, pattern: RegExp) {
    const tableName = sql.match(pattern)?.[1];

    if (!tableName) {
      throw new Error(`Could not parse table from SQL: ${sql}`);
    }

    return tableName;
  }

  private matchColumns(sql: string) {
    const columns = sql.match(/\(([^)]+)\)/)?.[1];

    if (!columns) {
      throw new Error(`Could not parse columns from SQL: ${sql}`);
    }

    return columns.split(",").map((column) => column.trim());
  }

  private table(name: string) {
    const existing = this.tables.get(name);

    if (existing) {
      return existing;
    }

    const created = new Map<string, SqliteRow>();
    this.tables.set(name, created);
    return created;
  }
}

function sequence(values: string[]) {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1];
}

describe("SQLite schema initialization", () => {
  it("executes the MVP schema statements in order", async () => {
    const database = new FakeSqliteDatabase();

    await initializeSakuravaSchema(database);

    expect(database.executed.map((entry) => entry.sql)).toEqual([
      ...SCHEMA_SQL,
      "PRAGMA table_info(performers)",
      ADD_PERFORMER_GENDER_COLUMN_SQL,
      "PRAGMA table_info(managedCategories)",
      "ALTER TABLE managedCategories ADD COLUMN showInCredits INTEGER NOT NULL DEFAULT 0 CHECK (showInCredits IN (0, 1))",
    ]);
  });
});

describe("SQLite repository adapter foundation", () => {
  it("creates isolated repositories using the repository interfaces", async () => {
    const database = new FakeSqliteDatabase();
    const repositories = createSqliteRepositories(database, {
      idFactory: sequence(["video-id", "image-id", "performer-id"]),
      now: sequence([
        "2026-05-11T00:00:00.000Z",
        "2026-05-11T00:01:00.000Z",
        "2026-05-11T00:02:00.000Z",
      ]),
    });

    await repositories.videos.create({ title: "Video" });
    await repositories.images.create({ title: "Image" });
    await repositories.performers.create({ name: "Performer" });

    expect(await repositories.videos.count()).toBe(1);
    expect(await repositories.images.count()).toBe(1);
    expect(await repositories.performers.count()).toBe(1);
  });

  it("persists video CRUD behavior through SQLite-shaped calls", async () => {
    const database = new FakeSqliteDatabase();
    const repository = createSqliteVideoRepository(database, {
      idFactory: sequence(["video-id"]),
      now: sequence([
        "2026-05-11T01:00:00.000Z",
        "2026-05-11T01:01:00.000Z",
      ]),
    });

    const created = await repository.create({
      title: " Video Title ",
      categoriesJson: '["Favorite","Classic"]',
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
      relatedImagesJson:
        '[{"recordId":"image-1","titleSnapshot":"Image One"}]',
      ratingJson: '{"rewatch":4}',
    });

    expect(created).toMatchObject({
      id: "video-id",
      title: "Video Title",
      favorite: false,
      categoriesJson: '["Favorite","Classic"]',
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
      relatedImagesJson:
        '[{"recordId":"image-1","titleSnapshot":"Image One"}]',
      ratingJson: '{"rewatch":4}',
      createdAt: "2026-05-11T01:00:00.000Z",
      updatedAt: "2026-05-11T01:00:00.000Z",
    });
    expect(await repository.getById("video-id")).toEqual(created);
    expect(await repository.list()).toEqual([created]);

    const updated = await repository.update("video-id", {
      title: "Updated Video",
      relatedPerformersJson:
        '[{"performerId":"performer-2","nameSnapshot":"Performer Two"}]',
      relatedImagesJson:
        '[{"recordId":"image-2","titleSnapshot":"Image Two"}]',
      ratingJson: "{bad json",
      favorite: true,
    });

    expect(updated).toMatchObject({
      title: "Updated Video",
      relatedPerformersJson:
        '[{"performerId":"performer-2","nameSnapshot":"Performer Two"}]',
      relatedImagesJson:
        '[{"recordId":"image-2","titleSnapshot":"Image Two"}]',
      ratingJson: "{}",
      favorite: true,
      createdAt: "2026-05-11T01:00:00.000Z",
      updatedAt: "2026-05-11T01:01:00.000Z",
    });

    await repository.delete("video-id");
    expect(await repository.getById("video-id")).toBeNull();
    expect(await repository.count()).toBe(0);
  });

  it("persists image JSON and count fields through SQLite-shaped calls", async () => {
    const database = new FakeSqliteDatabase();
    const repository = createSqliteImageRepository(database, {
      idFactory: sequence(["image-id"]),
      now: sequence([
        "2026-05-11T02:00:00.000Z",
        "2026-05-11T02:01:00.000Z",
      ]),
    });

    const created = await repository.create({
      title: "Image Title",
      folderPath: "D:/images",
      imageCount: 24,
      galleryImagePathsJson:
        '[" D:/images/one.jpg ","","D:/images/two.jpg","D:/images/one.jpg",7]',
      categoriesJson: '["Pictorial"]',
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
      relatedVideosJson:
        '[{"recordId":"video-1","titleSnapshot":"Video One"}]',
      ratingJson: '{"visual":5}',
    });

    expect(created).toMatchObject({
      id: "image-id",
      imageCount: 24,
      galleryImagePathsJson: '["D:/images/one.jpg","D:/images/two.jpg"]',
      categoriesJson: '["Pictorial"]',
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
      relatedVideosJson:
        '[{"recordId":"video-1","titleSnapshot":"Video One"}]',
      ratingJson: '{"visual":5}',
      favorite: false,
    });

    const updated = await repository.update("image-id", {
      imageCount: null,
      galleryImagePathsJson: "{}",
      categoriesJson: '["Updated Image"]',
      relatedPerformersJson: "{bad json",
      relatedVideosJson:
        '[{"recordId":"video-2","titleSnapshot":"Video Two"}]',
    });

    expect(updated).toMatchObject({
      imageCount: null,
      galleryImagePathsJson: "[]",
      categoriesJson: '["Updated Image"]',
      relatedPerformersJson: "[]",
      relatedVideosJson:
        '[{"recordId":"video-2","titleSnapshot":"Video Two"}]',
      updatedAt: "2026-05-11T02:01:00.000Z",
    });
  });

  it("persists performer aliases and JSON fields through SQLite-shaped calls", async () => {
    const database = new FakeSqliteDatabase();
    const repository = createSqlitePerformerRepository(database, {
      idFactory: sequence(["performer-id"]),
      now: sequence([
        "2026-05-11T03:00:00.000Z",
        "2026-05-11T03:01:00.000Z",
      ]),
    });

    const created = await repository.create({
      name: "Performer Name",
      gender: "Woman",
      aliasesJson: '["Alias A","Alias B"]',
      performerThumbnailPathsJson:
        '[" D:/thumbs/one.jpg ","","D:/thumbs/two.jpg","D:/thumbs/one.jpg","D:/thumbs/three.jpg","D:/thumbs/four.jpg","D:/thumbs/five.jpg"]',
      categoriesJson: '["Featured"]',
      ratingJson: '{"visual":5}',
    });

    expect(created).toMatchObject({
      id: "performer-id",
      gender: "Woman",
      aliasesJson: '["Alias A","Alias B"]',
      performerThumbnailPathsJson:
        '["D:/thumbs/one.jpg","D:/thumbs/two.jpg","D:/thumbs/three.jpg","D:/thumbs/four.jpg"]',
      categoriesJson: '["Featured"]',
      ratingJson: '{"visual":5}',
      favorite: false,
    });

    const updated = await repository.update("performer-id", {
      aliasesJson: "{bad json",
      gender: "",
      performerThumbnailPathsJson: "{bad json",
      categoriesJson: '["Updated Performer"]',
      ratingJson: "{bad json",
      favorite: true,
    });

    expect(updated).toMatchObject({
      aliasesJson: "[]",
      gender: "",
      performerThumbnailPathsJson: "[]",
      categoriesJson: '["Updated Performer"]',
      ratingJson: "{}",
      favorite: true,
      updatedAt: "2026-05-11T03:01:00.000Z",
    });
  });

  it("reuses required-field validation and missing-record errors", async () => {
    const repository = createSqliteVideoRepository(new FakeSqliteDatabase(), {
      idFactory: sequence(["video-id"]),
      now: sequence(["2026-05-11T04:00:00.000Z"]),
    });

    await expect(repository.create({ title: " " })).rejects.toThrow(
      RepositoryValidationError,
    );
    await expect(repository.update("missing-id", { title: "Nope" })).rejects.toThrow(
      RepositoryRecordNotFoundError,
    );
  });

  it("persists managed category metadata and blocks unsafe delete", async () => {
    const database = new FakeSqliteDatabase();
    const repositories = createSqliteRepositories(database, {
      idFactory: sequence(["video-id"]),
      now: sequence([
        "2026-05-11T05:00:00.000Z",
        "2026-05-11T05:01:00.000Z",
        "2026-05-11T05:02:00.000Z",
      ]),
    });
    const repository = repositories.managedCategories;

    const parent = await repository.create({
      name: "Drama",
      description: "Plain text",
      thumbnailPath: "D:/thumbs/drama.jpg",
    });
    const child = await repository.create({
      name: "Modern Drama",
      parentKey: parent.key,
    });

    expect(parent).toMatchObject({
      key: expect.stringMatching(/^cat-drama-/),
      name: "Drama",
      parentKey: null,
      description: "Plain text",
      thumbnailPath: "D:/thumbs/drama.jpg",
    });
    expect(child.parentKey).toBe(parent.key);

    await expect(repository.deleteIfUnused(parent.key)).rejects.toThrow(
      RepositoryValidationError,
    );

    await repository.deleteIfUnused(child.key);
    const updated = await repository.update(parent.key, {
      description: "Updated",
      thumbnailPath: "",
    });

    expect(updated).toMatchObject({
      key: parent.key,
      name: "Drama",
      description: "Updated",
      thumbnailPath: "",
      updatedAt: "2026-05-11T05:02:00.000Z",
    });
  });

  it("enforces one-level managed category hierarchy", async () => {
    const repository = createSqliteManagedCategoryRepository(
      new FakeSqliteDatabase(),
      {
        now: sequence([
          "2026-05-11T05:10:00.000Z",
          "2026-05-11T05:11:00.000Z",
        ]),
      },
    );

    const parent = await repository.create({ name: "Parent" });
    const child = await repository.create({
      name: "Child",
      parentKey: parent.key,
    });

    await expect(
      repository.create({
        name: "Sub Child",
        parentKey: child.key,
      }),
    ).rejects.toThrow(RepositoryValidationError);

    await expect(
      repository.update(parent.key, { parentKey: child.key }),
    ).rejects.toThrow(RepositoryValidationError);
  });

  it("blocks managed category delete while records use the category label", async () => {
    const database = new FakeSqliteDatabase();
    const videoRepository = createSqliteVideoRepository(database, {
      idFactory: sequence(["video-id"]),
      now: sequence(["2026-05-11T06:00:00.000Z"]),
    });
    const categoryRepository = createSqliteManagedCategoryRepository(database, {
      now: sequence(["2026-05-11T06:01:00.000Z"]),
    });

    await videoRepository.create({
      title: "Drama Video",
      categoriesJson: '["drama"]',
    });
    const category = await categoryRepository.create({ name: "Drama" });

    await expect(categoryRepository.deleteIfUnused(category.key)).rejects.toThrow(
      RepositoryValidationError,
    );
  });
});
