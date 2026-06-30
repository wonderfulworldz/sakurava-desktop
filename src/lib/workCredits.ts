import type {
  Credit,
  CreditCharacterMode,
  CreditedAsMode,
  CreditWorkType,
} from "../backend/types";
import {
  createCredit,
  deleteCredit,
  updateCredit,
} from "../runtime/creditCommands";

export type CreditFormValue = {
  id?: string;
  performerId: string;
  performerNameSnapshot?: string;
  characterName: string;
  characterOriginalName: string;
  creditedAsMode: CreditedAsMode;
  creditedAs: string;
  creditTypeCategoryId: string;
  roleImportanceCategoryId: string;
  characterMode: Exclude<CreditCharacterMode, "linked">;
  billingOrder: string;
  note: string;
};

export function creditToFormValue(credit: Credit): CreditFormValue {
  return {
    id: credit.id,
    performerId: credit.performerId,
    characterName: credit.characterName,
    characterOriginalName: credit.characterOriginalName ?? "",
    creditedAsMode: credit.creditedAsMode,
    creditedAs: credit.creditedAs ?? "",
    creditTypeCategoryId: credit.creditTypeCategoryId ?? "",
    roleImportanceCategoryId: credit.roleImportanceCategoryId ?? "",
    characterMode: credit.characterMode === "self" ? "self" : "text",
    billingOrder:
      credit.billingOrder === null ? "" : String(credit.billingOrder),
    note: credit.note ?? "",
  };
}

export function emptyCreditFormValue(
  performerId = "",
  billingOrder?: number,
): CreditFormValue {
  return {
    performerId,
    characterName: "",
    characterOriginalName: "",
    creditedAsMode: "auto",
    creditedAs: "",
    creditTypeCategoryId: "",
    roleImportanceCategoryId: "",
    characterMode: "text",
    billingOrder: billingOrder === undefined ? "" : String(billingOrder),
    note: "",
  };
}

export async function reconcileWorkCredits(
  workType: CreditWorkType,
  workId: string,
  originalCredits: readonly Credit[],
  formCredits: readonly CreditFormValue[],
) {
  const retainedIds = new Set(
    formCredits.flatMap((credit) => (credit.id ? [credit.id] : [])),
  );

  for (const credit of formCredits) {
    if (!credit.performerId.trim()) {
      continue;
    }
    const values = {
      performerId: credit.performerId.trim(),
      characterName:
        credit.characterMode === "self" ? "" : credit.characterName.trim(),
      characterOriginalName:
        credit.characterMode === "self"
          ? null
          : nullableText(credit.characterOriginalName),
      creditedAsMode: credit.creditedAsMode,
      creditedAs:
        credit.creditedAsMode === "custom"
          ? nullableText(credit.creditedAs)
          : null,
      creditTypeCategoryId: nullableText(credit.creditTypeCategoryId),
      roleImportanceCategoryId: nullableText(
        credit.roleImportanceCategoryId,
      ),
      characterMode: credit.characterMode,
      characterId: null,
      billingOrder: nullableInteger(credit.billingOrder),
      note: nullableText(credit.note),
    } as const;

    if (credit.id) {
      await updateCredit(credit.id, values);
    } else {
      await createCredit({ workType, workId, ...values });
    }
  }

  for (const original of originalCredits) {
    if (!retainedIds.has(original.id)) {
      await deleteCredit(original.id);
    }
  }
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function nullableInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}
