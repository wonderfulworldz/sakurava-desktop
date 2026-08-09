import type { NewVideo, Video, VideoPatch } from "../backend/types";
import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";
import { currentSakuravaRefYymm } from "../lib/sakuravaRef";
import { getSafeFilterEnabled } from "../lib/safeFilterState";

export type SafeFilterRecord<T> = { state: "visible" | "hidden" | "missing"; record: T | null };

export { isTauriRuntimeAvailable as isVideoRuntimeAvailable };

export function listVideos() {
  return invokeTauriCommand<Video[]>(getSafeFilterEnabled() ? "video_list_visible" : "video_list");
}

/** Complete authoritative data for Import/Export planning only. */
export function listVideosComplete() {
  return invokeTauriCommand<Video[]>("video_list");
}

export function getVideo(id: string) {
  return invokeTauriCommand<Video | null>("video_get", { id });
}

export function getVideoVisible(id: string) {
  return getSafeFilterEnabled()
    ? invokeTauriCommand<SafeFilterRecord<Video>>("video_get_visible", { id })
    : getVideo(id).then((record) => ({ state: record ? "visible" : "missing", record }));
}

export function createVideo(input: NewVideo) {
  return invokeTauriCommand<Video>("video_create", { input: { ...input, issuanceYymm: currentSakuravaRefYymm() } });
}

export function updateVideo(id: string, patch: VideoPatch) {
  return invokeTauriCommand<Video | null>("video_update", { id, patch });
}

export function deleteVideo(id: string) {
  return invokeTauriCommand<{ id: string; deleted: boolean }>("video_delete", { id });
}

