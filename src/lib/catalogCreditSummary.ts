import type { Credit, CreditWorkType } from "../backend/types";

export function countCreditsByWork(
  credits: Credit[],
  workType: CreditWorkType,
) {
  const counts = new Map<string, number>();

  for (const credit of credits) {
    if (credit.workType !== workType) {
      continue;
    }

    counts.set(credit.workId, (counts.get(credit.workId) ?? 0) + 1);
  }

  return counts;
}
