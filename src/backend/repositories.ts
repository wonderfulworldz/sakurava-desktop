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
  Video,
  VideoPatch,
  ValidationResult,
} from "./types";

export interface CatalogRepository<TRecord, TCreate, TPatch> {
  create(input: TCreate): Promise<TRecord>;
  getById(id: EntityId): Promise<TRecord | null>;
  list(): Promise<TRecord[]>;
  update(id: EntityId, patch: TPatch): Promise<TRecord>;
  delete(id: EntityId): Promise<void>;
  count(): Promise<number>;
}

export type VideoRepository = CatalogRepository<Video, NewVideo, VideoPatch>;
export type ImageRepository = CatalogRepository<Image, NewImage, ImagePatch>;
export type PerformerRepository = CatalogRepository<
  Performer,
  NewPerformer,
  PerformerPatch
>;

export type ManagedCategoryDeleteResult = {
  key: EntityId;
  deleted: true;
};

export interface ManagedCategoryRepository {
  create(input: NewManagedCategory): Promise<ManagedCategory>;
  getByKey(key: EntityId): Promise<ManagedCategory | null>;
  getByName(name: string): Promise<ManagedCategory | null>;
  list(): Promise<ManagedCategory[]>;
  update(key: EntityId, patch: ManagedCategoryPatch): Promise<ManagedCategory>;
  deleteIfUnused(key: EntityId): Promise<ManagedCategoryDeleteResult>;
  count(): Promise<number>;
}

export interface SakuravaRepositories {
  videos: VideoRepository;
  images: ImageRepository;
  performers: PerformerRepository;
  managedCategories: ManagedCategoryRepository;
}

export class RepositoryNotConnectedError extends Error {
  constructor(repositoryName: string) {
    super(`${repositoryName} repository is not connected to SQLite yet.`);
    this.name = "RepositoryNotConnectedError";
  }
}

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

function createDisconnectedRepository<TRecord, TCreate, TPatch>(
  name: string,
): CatalogRepository<TRecord, TCreate, TPatch> {
  const fail = async () => {
    throw new RepositoryNotConnectedError(name);
  };

  return {
    create: fail,
    getById: fail,
    list: fail,
    update: fail,
    delete: fail,
    count: fail,
  };
}

export function createRepositorySkeletons(): SakuravaRepositories {
  return {
    videos: createDisconnectedRepository<Video, NewVideo, VideoPatch>("videos"),
    images: createDisconnectedRepository<Image, NewImage, ImagePatch>("images"),
    performers: createDisconnectedRepository<Performer, NewPerformer, PerformerPatch>(
      "performers",
    ),
    managedCategories: createDisconnectedManagedCategoryRepository(),
  };
}

function createDisconnectedManagedCategoryRepository(): ManagedCategoryRepository {
  const fail = async () => {
    throw new RepositoryNotConnectedError("managedCategories");
  };

  return {
    create: fail,
    getByKey: fail,
    getByName: fail,
    list: fail,
    update: fail,
    deleteIfUnused: fail,
    count: fail,
  };
}
