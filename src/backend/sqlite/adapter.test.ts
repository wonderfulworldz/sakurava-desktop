import {
  RepositoryRecordNotFoundError,
  RepositoryValidationError,
} from "../repositories";
import { SCHEMA_SQL } from "../schema";
import type { SqliteDatabase, SqliteValue } from "./database";
import { initializeSakuravaSchema } from "./database";
import {
  createSqliteImageRepository,
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
      const tableName = this.matchTable(trimmed, /FROM ([a-z]+)/);
      return { count: this.table(tableName).size } as TRecord;
    }

    if (trimmed.startsWith("SELECT *")) {
      const tableName = this.matchTable(trimmed, /FROM ([a-z]+)/);
      const id = String(params[0]);
      const row = this.table(tableName).get(id);
      return row ? (structuredClone(row) as TRecord) : null;
    }

    return null;
  }

  async queryAll<TRecord>(sql: string, params: readonly SqliteValue[] = []) {
    this.executed.push({ sql, params });
    const tableName = this.matchTable(sql.trim(), /FROM ([a-z]+)/);

    return Array.from(this.table(tableName).values())
      .sort((first, second) =>
        String(second.createdAt).localeCompare(String(first.createdAt)),
      )
      .map((row) => structuredClone(row) as TRecord);
  }

  private insert(sql: string, params: readonly SqliteValue[]) {
    const tableName = this.matchTable(sql, /INSERT INTO ([a-z]+)/);
    const columns = this.matchColumns(sql);
    const row = Object.fromEntries(
      columns.map((column, index) => [column, params[index] ?? null]),
    );

    this.table(tableName).set(String(row.id), row);
  }

  private update(sql: string, params: readonly SqliteValue[]) {
    const tableName = this.matchTable(sql, /UPDATE ([a-z]+)/);
    const id = String(params[params.length - 1]);
    const existing = this.table(tableName).get(id);

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
    const tableName = this.matchTable(sql, /DELETE FROM ([a-z]+)/);
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

    expect(database.executed.map((entry) => entry.sql)).toEqual(SCHEMA_SQL);
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
      categoriesJson: '["Updated Image"]',
      relatedPerformersJson: "{bad json",
      relatedVideosJson:
        '[{"recordId":"video-2","titleSnapshot":"Video Two"}]',
    });

    expect(updated).toMatchObject({
      imageCount: null,
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
      aliasesJson: '["Alias A","Alias B"]',
      categoriesJson: '["Featured"]',
      ratingJson: '{"visual":5}',
    });

    expect(created).toMatchObject({
      id: "performer-id",
      aliasesJson: '["Alias A","Alias B"]',
      categoriesJson: '["Featured"]',
      ratingJson: '{"visual":5}',
      favorite: false,
    });

    const updated = await repository.update("performer-id", {
      aliasesJson: "{bad json",
      categoriesJson: '["Updated Performer"]',
      ratingJson: "{bad json",
      favorite: true,
    });

    expect(updated).toMatchObject({
      aliasesJson: "[]",
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
});
