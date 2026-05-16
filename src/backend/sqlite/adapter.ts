import {
  RepositoryRecordNotFoundError,
  RepositoryValidationError,
  type CatalogRepository,
  type ImageRepository,
  type PerformerRepository,
  type SakuravaRepositories,
  type VideoRepository,
} from "../repositories";
import type {
  EntityId,
  Image,
  ImagePatch,
  NewImage,
  NewPerformer,
  NewVideo,
  Performer,
  PerformerPatch,
  ValidationResult,
  Video,
  VideoPatch,
} from "../types";
import {
  normalizeImageDefaults,
  normalizePerformerDefaults,
  normalizeVideoDefaults,
  validateImageInput,
  validatePerformerInput,
  validateVideoInput,
} from "../validation";
import type { SqliteDatabase, SqliteValue } from "./database";

type SqliteRow = Record<string, SqliteValue>;
type IdFactory = () => EntityId;
type Clock = () => string;
type ValidateCreate<TCreate> = (input: TCreate) => ValidationResult;
type NormalizeCreate<TCreate> = (input: TCreate) => TCreate;
type RowMapper<TRecord> = (row: SqliteRow) => TRecord;

interface SqliteRepositoryOptions<TRecord, TCreate> {
  database: SqliteDatabase;
  tableName: string;
  columns: readonly string[];
  normalizeCreate: NormalizeCreate<TCreate>;
  validateCreate: ValidateCreate<TCreate>;
  mapRow: RowMapper<TRecord>;
  idFactory: IdFactory;
  now: Clock;
}

export interface SqliteRepositoryFactoryOptions {
  idFactory?: IdFactory;
  now?: Clock;
}

function assertValid(validation: ValidationResult) {
  if (!validation.valid) {
    throw new RepositoryValidationError(validation);
  }
}

function defaultIdFactory() {
  return crypto.randomUUID();
}

function rowFavorite(value: SqliteValue): boolean {
  return value === 1;
}

function toSqliteValue(value: unknown): SqliteValue {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "string" || typeof value === "number" || value === null) {
    return value;
  }

  return "";
}

function valuesForColumns<TRecord>(
  record: TRecord,
  columns: readonly string[],
): SqliteValue[] {
  return columns.map((column) =>
    toSqliteValue((record as Record<string, unknown>)[column]),
  );
}

function createPlaceholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

function createSqliteRepository<
  TRecord extends { id: EntityId; createdAt: string; updatedAt: string },
  TCreate,
  TPatch,
>({
  database,
  tableName,
  columns,
  normalizeCreate,
  validateCreate,
  mapRow,
  idFactory,
  now,
}: SqliteRepositoryOptions<TRecord, TCreate>): CatalogRepository<
  TRecord,
  TCreate,
  TPatch
> {
  const columnList = columns.join(", ");
  const insertSql = `INSERT INTO ${tableName} (${columnList}) VALUES (${createPlaceholders(
    columns.length,
  )})`;
  const setList = columns
    .filter((column) => column !== "id" && column !== "createdAt")
    .map((column) => `${column} = ?`)
    .join(", ");
  const updateColumns = columns.filter(
    (column) => column !== "id" && column !== "createdAt",
  );

  return {
    async create(input) {
      assertValid(validateCreate(input));

      const timestamp = now();
      const normalized = normalizeCreate(input);
      const record = {
        ...normalized,
        id: idFactory(),
        createdAt: timestamp,
        updatedAt: timestamp,
      } as unknown as TRecord;

      await database.execute(insertSql, valuesForColumns(record, columns));
      return record;
    },

    async getById(id) {
      const row = await database.queryOne<SqliteRow>(
        `SELECT * FROM ${tableName} WHERE id = ?`,
        [id],
      );

      return row ? mapRow(row) : null;
    },

    async list() {
      const rows = await database.queryAll<SqliteRow>(
        `SELECT * FROM ${tableName} ORDER BY createdAt DESC`,
      );

      return rows.map(mapRow);
    },

    async update(id, patch) {
      const current = await this.getById(id);

      if (!current) {
        throw new RepositoryRecordNotFoundError(id);
      }

      const merged = { ...current, ...patch } as unknown as TRecord & TCreate;
      assertValid(validateCreate(merged));

      const updated = {
        ...current,
        ...normalizeCreate(merged),
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: now(),
      } as TRecord;

      await database.execute(`UPDATE ${tableName} SET ${setList} WHERE id = ?`, [
        ...valuesForColumns(updated, updateColumns),
        id,
      ]);

      return updated;
    },

    async delete(id) {
      await database.execute(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
    },

    async count() {
      const row = await database.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${tableName}`,
      );

      return row?.count ?? 0;
    },
  };
}

const VIDEO_COLUMNS = [
  "id",
  "title",
  "originalTitle",
  "code",
  "censorship",
  "availability",
  "releaseDate",
  "durationMinutes",
  "publisherLabel",
  "coverPath",
  "mediaPath",
  "categoriesJson",
  "relatedPerformersJson",
  "relatedImagesJson",
  "ratingJson",
  "notes",
  "favorite",
  "createdAt",
  "updatedAt",
] as const;

const IMAGE_COLUMNS = [
  "id",
  "title",
  "originalTitle",
  "code",
  "censorship",
  "availability",
  "releaseDate",
  "publisherLabel",
  "coverPath",
  "folderPath",
  "imageCount",
  "categoriesJson",
  "relatedPerformersJson",
  "relatedVideosJson",
  "ratingJson",
  "notes",
  "favorite",
  "createdAt",
  "updatedAt",
] as const;

const PERFORMER_COLUMNS = [
  "id",
  "name",
  "originalName",
  "aliasesJson",
  "status",
  "birthDate",
  "coverPath",
  "performerThumbnailPathsJson",
  "filmographyCount",
  "pictorialsCount",
  "categoriesJson",
  "ratingJson",
  "notes",
  "favorite",
  "createdAt",
  "updatedAt",
] as const;

function mapVideoRow(row: SqliteRow): Video {
  return {
    ...normalizeVideoDefaults({
      title: String(row.title ?? ""),
      originalTitle: String(row.originalTitle ?? ""),
      code: String(row.code ?? ""),
      censorship: String(row.censorship ?? "") as Video["censorship"],
      availability: String(row.availability ?? "") as Video["availability"],
      releaseDate: String(row.releaseDate ?? ""),
      durationMinutes:
        row.durationMinutes === null ? null : Number(row.durationMinutes),
      publisherLabel: String(row.publisherLabel ?? ""),
      coverPath: String(row.coverPath ?? ""),
      mediaPath: String(row.mediaPath ?? ""),
      categoriesJson: String(row.categoriesJson ?? "[]"),
      relatedPerformersJson: String(row.relatedPerformersJson ?? "[]"),
      relatedImagesJson: String(row.relatedImagesJson ?? "[]"),
      ratingJson: String(row.ratingJson ?? "{}"),
      notes: String(row.notes ?? ""),
      favorite: rowFavorite(row.favorite),
    }),
    id: String(row.id),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  } as Video;
}

function mapImageRow(row: SqliteRow): Image {
  return {
    ...normalizeImageDefaults({
      title: String(row.title ?? ""),
      originalTitle: String(row.originalTitle ?? ""),
      code: String(row.code ?? ""),
      censorship: String(row.censorship ?? "") as Image["censorship"],
      availability: String(row.availability ?? "") as Image["availability"],
      releaseDate: String(row.releaseDate ?? ""),
      publisherLabel: String(row.publisherLabel ?? ""),
      coverPath: String(row.coverPath ?? ""),
      folderPath: String(row.folderPath ?? ""),
      imageCount: row.imageCount === null ? null : Number(row.imageCount),
      categoriesJson: String(row.categoriesJson ?? "[]"),
      relatedPerformersJson: String(row.relatedPerformersJson ?? "[]"),
      relatedVideosJson: String(row.relatedVideosJson ?? "[]"),
      ratingJson: String(row.ratingJson ?? "{}"),
      notes: String(row.notes ?? ""),
      favorite: rowFavorite(row.favorite),
    }),
    id: String(row.id),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  } as Image;
}

function mapPerformerRow(row: SqliteRow): Performer {
  return {
    ...normalizePerformerDefaults({
      name: String(row.name ?? ""),
      originalName: String(row.originalName ?? ""),
      aliasesJson: String(row.aliasesJson ?? "[]"),
      status: String(row.status ?? "") as Performer["status"],
      birthDate: String(row.birthDate ?? ""),
      coverPath: String(row.coverPath ?? ""),
      performerThumbnailPathsJson: String(
        row.performerThumbnailPathsJson ?? "[]",
      ),
      filmographyCount:
        row.filmographyCount === null ? null : Number(row.filmographyCount),
      pictorialsCount:
        row.pictorialsCount === null ? null : Number(row.pictorialsCount),
      categoriesJson: String(row.categoriesJson ?? "[]"),
      ratingJson: String(row.ratingJson ?? "{}"),
      notes: String(row.notes ?? ""),
      favorite: rowFavorite(row.favorite),
    }),
    id: String(row.id),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  } as Performer;
}

export function createSqliteVideoRepository(
  database: SqliteDatabase,
  options: SqliteRepositoryFactoryOptions = {},
): VideoRepository {
  return createSqliteRepository<Video, NewVideo, VideoPatch>({
    database,
    tableName: "videos",
    columns: VIDEO_COLUMNS,
    normalizeCreate: normalizeVideoDefaults,
    validateCreate: validateVideoInput,
    mapRow: mapVideoRow,
    idFactory: options.idFactory ?? defaultIdFactory,
    now: options.now ?? (() => new Date().toISOString()),
  });
}

export function createSqliteImageRepository(
  database: SqliteDatabase,
  options: SqliteRepositoryFactoryOptions = {},
): ImageRepository {
  return createSqliteRepository<Image, NewImage, ImagePatch>({
    database,
    tableName: "images",
    columns: IMAGE_COLUMNS,
    normalizeCreate: normalizeImageDefaults,
    validateCreate: validateImageInput,
    mapRow: mapImageRow,
    idFactory: options.idFactory ?? defaultIdFactory,
    now: options.now ?? (() => new Date().toISOString()),
  });
}

export function createSqlitePerformerRepository(
  database: SqliteDatabase,
  options: SqliteRepositoryFactoryOptions = {},
): PerformerRepository {
  return createSqliteRepository<Performer, NewPerformer, PerformerPatch>({
    database,
    tableName: "performers",
    columns: PERFORMER_COLUMNS,
    normalizeCreate: normalizePerformerDefaults,
    validateCreate: validatePerformerInput,
    mapRow: mapPerformerRow,
    idFactory: options.idFactory ?? defaultIdFactory,
    now: options.now ?? (() => new Date().toISOString()),
  });
}

export function createSqliteRepositories(
  database: SqliteDatabase,
  options: SqliteRepositoryFactoryOptions = {},
): SakuravaRepositories {
  return {
    videos: createSqliteVideoRepository(database, options),
    images: createSqliteImageRepository(database, options),
    performers: createSqlitePerformerRepository(database, options),
  };
}
