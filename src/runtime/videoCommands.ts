import type { NewVideo, Video, VideoPatch } from "../backend/types";
import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export { isTauriRuntimeAvailable as isVideoRuntimeAvailable };

export function listVideos() {
  return invokeTauriCommand<Video[]>("video_list");
}

export function getVideo(id: string) {
  return invokeTauriCommand<Video | null>("video_get", { id });
}

export function createVideo(input: NewVideo) {
  return invokeTauriCommand<Video>("video_create", { input });
}

export function updateVideo(id: string, patch: VideoPatch) {
  return invokeTauriCommand<Video | null>("video_update", { id, patch });
}

export function deleteVideo(id: string) {
  return invokeTauriCommand<{ id: string; deleted: boolean }>("video_delete", { id });
}

