import { parseRelatedPerformerArray } from "../backend/json";
import type {
  Credit,
  ManagedCategory,
  Performer,
} from "../backend/types";
import type { CreditDetailItem } from "./detailData";

export function buildCreditDetailItems(
  credits: Credit[],
  performers: Performer[],
  categories: ManagedCategory[],
  relatedPerformersJson: string | null | undefined,
): CreditDetailItem[] {
  const performerById = new Map(
    performers.map((performer) => [performer.id, performer]),
  );
  const categoryByKey = new Map(
    categories.map((category) => [category.key, category.name]),
  );
  const legacyNameByPerformerId = new Map(
    parseRelatedPerformerArray(relatedPerformersJson)
      .filter((relation) => relation.performerId && relation.nameSnapshot)
      .map((relation) => [relation.performerId, relation.nameSnapshot]),
  );

  return credits
    .map((credit, loadedIndex) => {
      const performer = performerById.get(credit.performerId);
      const performerName =
        performer?.name?.trim() ||
        performer?.originalName?.trim() ||
        legacyNameByPerformerId.get(credit.performerId)?.trim() ||
        "Unknown performer";
      const characterName =
        credit.characterMode === "self"
          ? "Self"
          : credit.characterName.trim() || undefined;

      return {
        id: credit.id,
        performerName,
        performerOriginalName:
          performer?.originalName?.trim() &&
          performer.originalName.trim() !== performerName
            ? performer.originalName.trim()
            : undefined,
        performerRouteTo: performer
          ? `/performers/${performer.id}`
          : undefined,
        characterName,
        characterOriginalName:
          characterName && credit.characterOriginalName?.trim()
            ? credit.characterOriginalName.trim()
            : undefined,
        creditedAs:
          credit.creditedAsMode === "custom"
            ? credit.creditedAs?.trim() || undefined
            : undefined,
        creditType: resolveCategoryLabel(
          credit.creditTypeCategoryId,
          categoryByKey,
        ),
        roleImportance: resolveCategoryLabel(
          credit.roleImportanceCategoryId,
          categoryByKey,
        ),
        billingOrder:
          typeof credit.billingOrder === "number"
            ? credit.billingOrder
            : undefined,
        note: credit.note?.trim() || undefined,
        loadedIndex,
      };
    })
    .sort((left, right) => {
      const leftOrder = left.billingOrder ?? Number.POSITIVE_INFINITY;
      const rightOrder = right.billingOrder ?? Number.POSITIVE_INFINITY;
      return leftOrder - rightOrder || left.loadedIndex - right.loadedIndex;
    })
    .map(({ loadedIndex: _loadedIndex, ...item }) => item);
}

function resolveCategoryLabel(
  key: string | null,
  categoryByKey: Map<string, string>,
) {
  if (!key?.trim()) {
    return undefined;
  }

  return categoryByKey.get(key)?.trim() || key;
}
