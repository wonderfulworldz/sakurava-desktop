import type {
  Credit,
  CreditPatch,
  CreditWorkType,
  NewCredit,
} from "../backend/types";
import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export { isTauriRuntimeAvailable as isCreditRuntimeAvailable };

export function createCredit(input: NewCredit) {
  return invokeTauriCommand<Credit>("credit_create", { input });
}

export function listCredits() {
  return invokeTauriCommand<Credit[]>("credit_list");
}

export function getCredit(id: string) {
  return invokeTauriCommand<Credit | null>("credit_get", { id });
}

export function updateCredit(id: string, patch: CreditPatch) {
  return invokeTauriCommand<Credit | null>("credit_update", { id, patch });
}

export function deleteCredit(id: string) {
  return invokeTauriCommand<{ id: string; deleted: boolean }>("credit_delete", {
    id,
  });
}

export function listCreditsByWork(workType: CreditWorkType, workId: string) {
  return invokeTauriCommand<Credit[]>("credit_list_by_work", {
    workType,
    workId,
  });
}

export function listCreditsByPerformer(performerId: string) {
  return invokeTauriCommand<Credit[]>("credit_list_by_performer", {
    performerId,
  });
}
