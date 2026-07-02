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

export function normalizeCreditOrders(
  credits: readonly CreditFormValue[],
): CreditFormValue[] {
  return credits.map((credit, index) => ({
    ...credit,
    billingOrder: String(index + 1),
  }));
}

export function moveCreditToOrder(
  credits: readonly CreditFormValue[],
  currentIndex: number,
  requestedOrder: string | number,
): CreditFormValue[] {
  if (credits.length === 0) {
    return [];
  }

  const parsedOrder = Number(requestedOrder);
  const safeOrder = Number.isFinite(parsedOrder)
    ? Math.min(Math.max(Math.trunc(parsedOrder), 1), credits.length)
    : currentIndex + 1;
  const next = [...credits];
  const [moved] = next.splice(currentIndex, 1);

  if (!moved) {
    return normalizeCreditOrders(credits);
  }

  next.splice(safeOrder - 1, 0, moved);
  return normalizeCreditOrders(next);
}

export function creditGroupOrderAtIndex(
  credits: readonly CreditFormValue[],
  index: number,
) {
  const target = credits[index];
  if (!target) {
    return 1;
  }
  const targetKey = creditGroupKey(target, index);
  const seen = new Set<string>();

  for (let creditIndex = 0; creditIndex < credits.length; creditIndex += 1) {
    const key = creditGroupKey(credits[creditIndex], creditIndex);
    if (!seen.has(key)) {
      seen.add(key);
    }
    if (key === targetKey) {
      return seen.size;
    }
  }

  return 1;
}

export function moveCreditGroupToOrder(
  credits: readonly CreditFormValue[],
  currentIndex: number,
  requestedOrder: string | number,
): CreditFormValue[] {
  const groups = groupCredits(credits);
  const current = credits[currentIndex];
  if (!current || groups.length === 0) {
    return normalizeCreditOrders(credits);
  }

  const currentKey = creditGroupKey(current, currentIndex);
  const currentGroupIndex = groups.findIndex((group) => group.key === currentKey);
  if (currentGroupIndex < 0) {
    return normalizeCreditOrders(credits);
  }

  const parsedOrder = Number(requestedOrder);
  const safeOrder = Number.isFinite(parsedOrder)
    ? Math.min(Math.max(Math.trunc(parsedOrder), 1), groups.length)
    : currentGroupIndex + 1;
  const nextGroups = [...groups];
  const [moved] = nextGroups.splice(currentGroupIndex, 1);
  nextGroups.splice(safeOrder - 1, 0, moved);

  return normalizeCreditOrders(nextGroups.flatMap((group) => group.credits));
}

export function insertCreditIntoPerformerGroup(
  credits: readonly CreditFormValue[],
  credit: CreditFormValue,
): CreditFormValue[] {
  if (!credit.performerId) {
    return normalizeCreditOrders([...credits, credit]);
  }
  const lastMatchingIndex = credits.reduce(
    (lastIndex, item, index) =>
      item.performerId === credit.performerId ? index : lastIndex,
    -1,
  );
  const next = [...credits];
  next.splice(lastMatchingIndex + 1, 0, credit);
  return normalizeCreditOrders(next);
}

export async function reconcileWorkCredits(
  workType: CreditWorkType,
  workId: string,
  originalCredits: readonly Credit[],
  formCredits: readonly CreditFormValue[],
) {
  const normalizedCredits = normalizeCreditOrders(formCredits);
  const retainedIds = new Set(
    normalizedCredits.flatMap((credit) => (credit.id ? [credit.id] : [])),
  );

  for (const credit of normalizedCredits) {
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

function creditGroupKey(credit: CreditFormValue, index: number) {
  return credit.performerId || `unresolved:${credit.id ?? index}`;
}

function groupCredits(credits: readonly CreditFormValue[]) {
  const groups: Array<{ key: string; credits: CreditFormValue[] }> = [];
  const byKey = new Map<string, { key: string; credits: CreditFormValue[] }>();

  credits.forEach((credit, index) => {
    const key = creditGroupKey(credit, index);
    const existing = byKey.get(key);
    if (existing) {
      existing.credits.push(credit);
      return;
    }
    const group = { key, credits: [credit] };
    byKey.set(key, group);
    groups.push(group);
  });

  return groups;
}
