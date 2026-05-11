import type {
  EntityId,
  Image,
  ImagePatch,
  NewImage,
  NewPerformer,
  NewVideo,
  Performer,
  PerformerPatch,
  Video,
  VideoPatch,
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

export interface SakuravaRepositories {
  videos: VideoRepository;
  images: ImageRepository;
  performers: PerformerRepository;
}

export class RepositoryNotConnectedError extends Error {
  constructor(repositoryName: string) {
    super(`${repositoryName} repository is not connected to SQLite yet.`);
    this.name = "RepositoryNotConnectedError";
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
  };
}
