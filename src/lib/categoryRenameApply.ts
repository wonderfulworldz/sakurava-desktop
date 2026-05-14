import { parseTextLabelArray } from "../backend/json";

export function renameCategoryInCategoriesJson(
  categoriesJson: string | null | undefined,
  sourceCategory: string,
  targetCategory: string,
) {
  const sourceKey = sourceCategory.trim().toLowerCase();
  const targetLabel = targetCategory.trim();
  const labels = parseTextLabelArray(categoriesJson);

  if (!sourceKey || !targetLabel || labels.length === 0) {
    return {
      changed: false,
      categoriesJson: categoriesJson ?? "[]",
    };
  }

  let matched = false;
  let changed = false;
  const nextLabels: string[] = [];
  const nextKeys = new Set<string>();

  for (const label of labels) {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      changed = true;
      continue;
    }

    const labelKey = trimmedLabel.toLowerCase();
    const nextLabel = labelKey === sourceKey ? targetLabel : trimmedLabel;
    const nextKey = nextLabel.toLowerCase();

    if (labelKey === sourceKey) {
      matched = true;
      changed = true;
    }

    if (nextKeys.has(nextKey)) {
      changed = true;
      continue;
    }

    nextKeys.add(nextKey);
    nextLabels.push(nextLabel);
  }

  if (!matched) {
    return {
      changed: false,
      categoriesJson: categoriesJson ?? "[]",
    };
  }

  return {
    changed,
    categoriesJson: JSON.stringify(nextLabels),
  };
}
