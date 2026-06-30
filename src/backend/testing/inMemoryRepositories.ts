import {
  RepositoryRecordNotFoundError,
  RepositoryValidationError,
} from "../repositories";
import type {
  CatalogRepository,
  ImageRepository,
  ManagedCategoryRepository,
  PerformerRepository,
  SakuravaRepositories,
  VideoRepository,
} from "../repositories";
import {
  applyManagedCategoryPatch,
  countManagedCategoryUsage,
  normalizeManagedCategoryInput,
  validateManagedCategoryInput,
} from "../managedCategoryModel";
import type {
  EntityId,
  Image,
  ImagePatch,
  ManagedCategory,
  ManagedCategoryPatch,
  NewManagedCategory,
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

export function createInMemoryManagedCategoryRepository(
  repositories: {
    videos: VideoRepository;
    images: ImageRepository;
    performers: PerformerRepository;
  },
  now: () => string = () => new Date().toISOString(),
): ManagedCategoryRepository {
  const records = new Map<EntityId, ManagedCategory>();

  async function list() {
    return Array.from(records.values(), clone).sort((first, second) =>
      first.name.localeCompare(second.name),
    );
  }

  return {
    async create(input: NewManagedCategory) {
      const existing = await list();
      const normalized = normalizeManagedCategoryInput(input);
      assertValid(validateManagedCategoryInput(normalized, existing));
      const timestamp = now();
      const record: ManagedCategory = {
        key: normalized.key ?? "",
        name: normalized.name,
        parentKey: normalized.parentKey ?? null,
        description: normalized.description ?? "",
        thumbnailPath: normalized.thumbnailPath ?? "",
        showInVideos: normalized.showInVideos ?? true,
        showInImages: normalized.showInImages ?? true,
        showInPerformers: normalized.showInPerformers ?? true,
        showInCredits: normalized.showInCredits ?? false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      records.set(record.key, clone(record));
      return clone(record);
    },

    async getByKey(key) {
      const record = records.get(key);
      return record ? clone(record) : null;
    },

    async getByName(name) {
      const key = name.trim().toLowerCase();
      return (
        (await list()).find(
          (category) => category.name.trim().toLowerCase() === key,
        ) ?? null
      );
    },

    list,

    async update(key, patch: ManagedCategoryPatch) {
      const current = records.get(key);
      if (!current) {
        throw new RepositoryRecordNotFoundError(key);
      }

      const existing = await list();
      const merged = normalizeManagedCategoryInput(
        applyManagedCategoryPatch(current, patch),
      );
      assertValid(validateManagedCategoryInput(merged, existing, key));

      const updated: ManagedCategory = {
        ...current,
        ...merged,
        key: current.key,
        createdAt: current.createdAt,
        updatedAt: now(),
      };

      records.set(key, clone(updated));
      return clone(updated);
    },

    async deleteIfUnused(key) {
      const current = records.get(key);
      if (!current) {
        throw new RepositoryRecordNotFoundError(key);
      }

      if ((await list()).some((category) => category.parentKey === key)) {
        throw new RepositoryValidationError({
          valid: false,
          errors: [
            {
              field: "parentKey",
              message: "Category cannot be deleted while it has child categories.",
            },
          ],
        });
      }

      const usage = countManagedCategoryUsage(current.name, {
        videos: await repositories.videos.list(),
        images: await repositories.images.list(),
        performers: await repositories.performers.list(),
      });

      if (usage.total > 0) {
        throw new RepositoryValidationError({
          valid: false,
          errors: [
            {
              field: "categoriesJson",
              message: "Category cannot be deleted while records use it.",
            },
          ],
        });
      }

      records.delete(key);
      return { key, deleted: true };
    },

    async count() {
      return records.size;
    },
  };
}

export function createInMemoryRepositories(now?: () => string): SakuravaRepositories {
  const videos = createInMemoryVideoRepository(now);
  const images = createInMemoryImageRepository(now);
  const performers = createInMemoryPerformerRepository(now);

  return {
    videos,
    images,
    performers,
    managedCategories: createInMemoryManagedCategoryRepository(
      { videos, images, performers },
      now,
    ),
  };
}
