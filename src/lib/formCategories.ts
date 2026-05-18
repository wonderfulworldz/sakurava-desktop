export function normalizeFormCategories(categories: readonly string[]): string[] {
  const categoriesByKey = new Map<string, string>();

  for (const item of categories) {
    const category = item.trim();

    if (!category) {
      continue;
    }

    const key = category.toLowerCase();
    if (!categoriesByKey.has(key)) {
      categoriesByKey.set(key, category);
    }
  }

  return [...categoriesByKey.values()];
}

export function hasFormCategory(
  categories: readonly string[],
  category: string,
) {
  const categoryKey = category.trim().toLowerCase();

  if (!categoryKey) {
    return false;
  }

  return categories.some(
    (item) => item.trim().toLowerCase() === categoryKey,
  );
}

export function addFormCategory(
  categories: readonly string[],
  category: string,
) {
  const normalized = normalizeFormCategories(categories);
  const nextCategory = category.trim();

  if (!nextCategory || hasFormCategory(normalized, nextCategory)) {
    return normalized;
  }

  return [...normalized, nextCategory];
}

export function removeFormCategory(
  categories: readonly string[],
  category: string,
) {
  const categoryKey = category.trim().toLowerCase();

  return normalizeFormCategories(categories).filter(
    (item) => item.trim().toLowerCase() !== categoryKey,
  );
}
