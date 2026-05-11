import type {
  CatalogRepository,
  ImageRepository,
  PerformerRepository,
  SakuravaRepositories,
  VideoRepository,
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

export class RepositoryValidationError extends Error {
  constructor(public readonly validation: ValidationResult) {
    super(validation.errors.map((error) => error.message).join(" "));
    this.name = "RepositoryValidationError";
  }
}

export class RepositoryRecordNotFoundError extends Error {
  constructor(id: EntityId) {
    super(`Record ${id} was not found.`);
    this.name = "RepositoryRecordNotFoundError";
  }
}

type CreateRecord<TCreate, TRecord> = (
  input: TCreate,
  metadata: RepositoryMetadata,
) => TRecord;

type NormalizeCreate<TCreate> = (input: TCreate) => TCreate;
type ValidateCreate<TCreate> = (input: TCreate) => ValidationResult;
type RepositoryMetadata = {
  id: EntityId;
  createdAt: string;
  updatedAt: string;
};

interface InMemoryRepositoryOptions<TRecord, TCreate> {
  name: string;
  normalizeCreate: NormalizeCreate<TCreate>;
  validateCreate: ValidateCreate<TCreate>;
  createRecord: CreateRecord<TCreate, TRecord>;
  now?: () => string;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertValid(validation: ValidationResult) {
  if (!validation.valid) {
    throw new RepositoryValidationError(validation);
  }
}

function createIdFactory(prefix: string) {
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

function createInMemoryRepository<
  TRecord extends { id: EntityId; createdAt: string; updatedAt: string },
  TCreate,
  TPatch,
>({
  name,
  normalizeCreate,
  validateCreate,
  createRecord,
  now = () => new Date().toISOString(),
}: InMemoryRepositoryOptions<TRecord, TCreate>): CatalogRepository<
  TRecord,
  TCreate,
  TPatch
> {
  const records = new Map<EntityId, TRecord>();
  const nextId = createIdFactory(name);

  return {
    async create(input) {
      assertValid(validateCreate(input));

      const timestamp = now();
      const normalized = normalizeCreate(input);
      const record = createRecord(normalized, {
        id: nextId(),
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      records.set(record.id, clone(record));
      return clone(record);
    },

    async getById(id) {
      const record = records.get(id);
      return record ? clone(record) : null;
    },

    async list() {
      return Array.from(records.values(), clone);
    },

    async update(id, patch) {
      const current = records.get(id);

      if (!current) {
        throw new RepositoryRecordNotFoundError(id);
      }

      const merged = { ...current, ...patch } as unknown as TRecord & TCreate;
      assertValid(validateCreate(merged));

      const normalized = normalizeCreate(merged);
      const updated = {
        ...current,
        ...normalized,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: now(),
      } as TRecord;

      records.set(id, clone(updated));
      return clone(updated);
    },

    async delete(id) {
      records.delete(id);
    },

    async count() {
      return records.size;
    },
  };
}

export function createInMemoryVideoRepository(
  now?: () => string,
): VideoRepository {
  return createInMemoryRepository<Video, NewVideo, VideoPatch>({
    name: "video",
    now,
    normalizeCreate: normalizeVideoDefaults,
    validateCreate: validateVideoInput,
    createRecord: (input, metadata) => ({ ...input, ...metadata }) as Video,
  });
}

export function createInMemoryImageRepository(
  now?: () => string,
): ImageRepository {
  return createInMemoryRepository<Image, NewImage, ImagePatch>({
    name: "image",
    now,
    normalizeCreate: normalizeImageDefaults,
    validateCreate: validateImageInput,
    createRecord: (input, metadata) => ({ ...input, ...metadata }) as Image,
  });
}

export function createInMemoryPerformerRepository(
  now?: () => string,
): PerformerRepository {
  return createInMemoryRepository<Performer, NewPerformer, PerformerPatch>({
    name: "performer",
    now,
    normalizeCreate: normalizePerformerDefaults,
    validateCreate: validatePerformerInput,
    createRecord: (input, metadata) => ({ ...input, ...metadata }) as Performer,
  });
}

export function createInMemoryRepositories(now?: () => string): SakuravaRepositories {
  return {
    videos: createInMemoryVideoRepository(now),
    images: createInMemoryImageRepository(now),
    performers: createInMemoryPerformerRepository(now),
  };
}
