import type { Image, ImagePatch, NewImage } from "../backend/types";
import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";
import { currentSakuravaRefYymm } from "../lib/sakuravaRef";

export { isTauriRuntimeAvailable as isImageRuntimeAvailable };

export function listImages() {
  return invokeTauriCommand<Image[]>("image_list");
}

export function getImage(id: string) {
  return invokeTauriCommand<Image | null>("image_get", { id });
}

export function createImage(input: NewImage) {
  return invokeTauriCommand<Image>("image_create", { input: { ...input, issuanceYymm: currentSakuravaRefYymm() } });
}

export function updateImage(id: string, patch: ImagePatch) {
  return invokeTauriCommand<Image | null>("image_update", { id, patch });
}

export function deleteImage(id: string) {
  return invokeTauriCommand<{ id: string; deleted: boolean }>("image_delete", { id });
}
