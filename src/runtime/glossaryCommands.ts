import type {
  GlossaryEntry,
  GlossaryEntryPatch,
  NewGlossaryEntry,
} from "../backend/types";
import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export { isTauriRuntimeAvailable as isGlossaryRuntimeAvailable };

export function listGlossaryEntries() {
  return invokeTauriCommand<GlossaryEntry[]>("glossary_list");
}

export function createGlossaryEntry(input: NewGlossaryEntry) {
  return invokeTauriCommand<GlossaryEntry>("glossary_create", { input });
}

export function updateGlossaryEntry(id: string, patch: GlossaryEntryPatch) {
  return invokeTauriCommand<GlossaryEntry | null>("glossary_update", {
    id,
    patch,
  });
}

export function deleteGlossaryEntry(id: string) {
  return invokeTauriCommand<{ id: string; deleted: boolean }>(
    "glossary_delete",
    { id },
  );
}
