import type {
  ManagedCategory,
  ManagedCategoryPatch,
  NewManagedCategory,
} from "../backend/types";
import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";
import { currentSakuravaRefYymm } from "../lib/sakuravaRef";

export { isTauriRuntimeAvailable as isManagedCategoryRuntimeAvailable };

export function listManagedCategories() {
  return invokeTauriCommand<ManagedCategory[]>("managed_category_list");
}

export function getManagedCategory(key: string) {
  return invokeTauriCommand<ManagedCategory | null>("managed_category_get", {
    key,
  });
}

export function createManagedCategory(input: NewManagedCategory) {
  return invokeTauriCommand<ManagedCategory>("managed_category_create", {
    input: { ...input, issuanceYymm: currentSakuravaRefYymm() },
  });
}

export function updateManagedCategory(
  key: string,
  patch: ManagedCategoryPatch,
) {
  return invokeTauriCommand<ManagedCategory>("managed_category_update", {
    key,
    patch,
  });
}

export function deleteManagedCategory(key: string) {
  return invokeTauriCommand<{ key: string; deleted: boolean }>(
    "managed_category_delete",
    { key },
  );
}
