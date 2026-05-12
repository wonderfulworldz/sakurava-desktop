import type { NewPerformer, Performer, PerformerPatch } from "../backend/types";
import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export { isTauriRuntimeAvailable as isPerformerRuntimeAvailable };

export function listPerformers() {
  return invokeTauriCommand<Performer[]>("performer_list");
}

export function getPerformer(id: string) {
  return invokeTauriCommand<Performer | null>("performer_get", { id });
}

export function createPerformer(input: NewPerformer) {
  return invokeTauriCommand<Performer>("performer_create", { input });
}

export function updatePerformer(id: string, patch: PerformerPatch) {
  return invokeTauriCommand<Performer | null>("performer_update", { id, patch });
}

export function deletePerformer(id: string) {
  return invokeTauriCommand<{ id: string; deleted: boolean }>("performer_delete", { id });
}
