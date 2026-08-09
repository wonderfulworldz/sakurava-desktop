import type { NewPerformer, Performer, PerformerPatch } from "../backend/types";
import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";
import { currentSakuravaRefYymm } from "../lib/sakuravaRef";
import { getSafeFilterEnabled } from "../lib/safeFilterState";
import type { SafeFilterRecord } from "./videoCommands";

export { isTauriRuntimeAvailable as isPerformerRuntimeAvailable };

export function listPerformers() {
  return invokeTauriCommand<Performer[]>(getSafeFilterEnabled() ? "performer_list_visible" : "performer_list");
}

/** Complete authoritative data for Import/Export planning only. */
export function listPerformersComplete() {
  return invokeTauriCommand<Performer[]>("performer_list");
}

export function getPerformer(id: string) {
  return invokeTauriCommand<Performer | null>("performer_get", { id });
}

export function getPerformerVisible(id: string) {
  return getSafeFilterEnabled()
    ? invokeTauriCommand<SafeFilterRecord<Performer>>("performer_get_visible", { id })
    : getPerformer(id).then((record) => ({ state: record ? "visible" : "missing", record }));
}

export function createPerformer(input: NewPerformer) {
  return invokeTauriCommand<Performer>("performer_create", { input: { ...input, issuanceYymm: currentSakuravaRefYymm() } });
}

export function updatePerformer(id: string, patch: PerformerPatch) {
  return invokeTauriCommand<Performer | null>("performer_update", { id, patch });
}

export function deletePerformer(id: string) {
  return invokeTauriCommand<{ id: string; deleted: boolean }>("performer_delete", { id });
}
