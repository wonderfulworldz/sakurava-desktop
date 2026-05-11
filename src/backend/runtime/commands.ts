import type { SakuravaRepositories } from "../repositories";
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
} from "../types";

export const RUNTIME_COMMAND_NAMES = [
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
] as const;

export type RuntimeCommandName = (typeof RUNTIME_COMMAND_NAMES)[number];

export interface IdPayload {
  id: EntityId;
}

export interface VideoUpdatePayload extends IdPayload {
  patch: VideoPatch;
}

export interface ImageUpdatePayload extends IdPayload {
  patch: ImagePatch;
}

export interface PerformerUpdatePayload extends IdPayload {
  patch: PerformerPatch;
}

export interface DeleteResult extends IdPayload {
  deleted: true;
}

export interface RuntimeCommandContracts {
  video_create: { payload: NewVideo; result: Video };
  video_list: { payload: undefined; result: Video[] };
  video_get: { payload: IdPayload; result: Video | null };
  video_update: { payload: VideoUpdatePayload; result: Video };
  video_delete: { payload: IdPayload; result: DeleteResult };
  image_create: { payload: NewImage; result: Image };
  image_list: { payload: undefined; result: Image[] };
  image_get: { payload: IdPayload; result: Image | null };
  image_update: { payload: ImageUpdatePayload; result: Image };
  image_delete: { payload: IdPayload; result: DeleteResult };
  performer_create: { payload: NewPerformer; result: Performer };
  performer_list: { payload: undefined; result: Performer[] };
  performer_get: { payload: IdPayload; result: Performer | null };
  performer_update: { payload: PerformerUpdatePayload; result: Performer };
  performer_delete: { payload: IdPayload; result: DeleteResult };
}

export type RuntimeCommandPayload<TName extends RuntimeCommandName> =
  RuntimeCommandContracts[TName]["payload"];

export type RuntimeCommandResult<TName extends RuntimeCommandName> =
  RuntimeCommandContracts[TName]["result"];

export interface RuntimeCommandInvoker {
  invoke<TName extends RuntimeCommandName>(
    command: TName,
    payload: RuntimeCommandPayload<TName>,
  ): Promise<RuntimeCommandResult<TName>>;
}

export class UnknownRuntimeCommandError extends Error {
  constructor(command: string) {
    super(`Unknown runtime command: ${command}`);
    this.name = "UnknownRuntimeCommandError";
  }
}

export function isRuntimeCommandName(value: string): value is RuntimeCommandName {
  return RUNTIME_COMMAND_NAMES.includes(value as RuntimeCommandName);
}

export function createRuntimeCommandClient(
  invoker: RuntimeCommandInvoker,
): RuntimeCommandInvoker {
  return {
    invoke(command, payload) {
      return invoker.invoke(command, payload);
    },
  };
}

export function createRepositoryRuntimeCommandInvoker(
  repositories: SakuravaRepositories,
): RuntimeCommandInvoker {
  return {
    async invoke(command, payload) {
      return executeRepositoryRuntimeCommand(repositories, command, payload);
    },
  };
}

export async function executeRepositoryRuntimeCommand<
  TName extends RuntimeCommandName,
>(
  repositories: SakuravaRepositories,
  command: TName,
  payload: RuntimeCommandPayload<TName>,
): Promise<RuntimeCommandResult<TName>> {
  switch (command) {
    case "video_create":
      return repositories.videos.create(payload as NewVideo) as Promise<
        RuntimeCommandResult<TName>
      >;
    case "video_list":
      return repositories.videos.list() as Promise<RuntimeCommandResult<TName>>;
    case "video_get":
      return repositories.videos.getById((payload as IdPayload).id) as Promise<
        RuntimeCommandResult<TName>
      >;
    case "video_update": {
      const updatePayload = payload as VideoUpdatePayload;
      return repositories.videos.update(
        updatePayload.id,
        updatePayload.patch,
      ) as Promise<RuntimeCommandResult<TName>>;
    }
    case "video_delete":
      await repositories.videos.delete((payload as IdPayload).id);
      return {
        id: (payload as IdPayload).id,
        deleted: true,
      } as RuntimeCommandResult<TName>;
    case "image_create":
      return repositories.images.create(payload as NewImage) as Promise<
        RuntimeCommandResult<TName>
      >;
    case "image_list":
      return repositories.images.list() as Promise<RuntimeCommandResult<TName>>;
    case "image_get":
      return repositories.images.getById((payload as IdPayload).id) as Promise<
        RuntimeCommandResult<TName>
      >;
    case "image_update": {
      const updatePayload = payload as ImageUpdatePayload;
      return repositories.images.update(
        updatePayload.id,
        updatePayload.patch,
      ) as Promise<RuntimeCommandResult<TName>>;
    }
    case "image_delete":
      await repositories.images.delete((payload as IdPayload).id);
      return {
        id: (payload as IdPayload).id,
        deleted: true,
      } as RuntimeCommandResult<TName>;
    case "performer_create":
      return repositories.performers.create(payload as NewPerformer) as Promise<
        RuntimeCommandResult<TName>
      >;
    case "performer_list":
      return repositories.performers.list() as Promise<
        RuntimeCommandResult<TName>
      >;
    case "performer_get":
      return repositories.performers.getById((payload as IdPayload).id) as Promise<
        RuntimeCommandResult<TName>
      >;
    case "performer_update": {
      const updatePayload = payload as PerformerUpdatePayload;
      return repositories.performers.update(
        updatePayload.id,
        updatePayload.patch,
      ) as Promise<RuntimeCommandResult<TName>>;
    }
    case "performer_delete":
      await repositories.performers.delete((payload as IdPayload).id);
      return {
        id: (payload as IdPayload).id,
        deleted: true,
      } as RuntimeCommandResult<TName>;
    default:
      throw new UnknownRuntimeCommandError(command);
  }
}

export async function executeRuntimeCommandByName(
  invoker: RuntimeCommandInvoker,
  command: string,
  payload: unknown,
) {
  if (!isRuntimeCommandName(command)) {
    throw new UnknownRuntimeCommandError(command);
  }

  return invoker.invoke(command, payload as RuntimeCommandPayload<typeof command>);
}
