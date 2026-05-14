export const MANAGED_CATEGORIES_STORAGE_KEY = "sakurava.managedCategories.v1";

export function getStoredManagedCategories(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return normalizeManagedCategories(
      window.localStorage.getItem(MANAGED_CATEGORIES_STORAGE_KEY),
    );
  } catch {
    return [];
  }
}

export function storeManagedCategories(categories: string[]) {
  const normalized = normalizeManagedCategories(categories);
  if (typeof window === "undefined") {
    return normalized;
  }

  window.localStorage.setItem(
    MANAGED_CATEGORIES_STORAGE_KEY,
    JSON.stringify(normalized),
  );
  return normalized;
}

export function addStoredManagedCategory(
  name: string,
  existingCategories: string[] = [],
) {
  const trimmedName = name.trim();
  const storedCategories = getStoredManagedCategories();

  if (!trimmedName) {
    return {
      state: "error" as const,
      message: "Enter a category name.",
      categories: storedCategories,
    };
  }

  if (
    [...storedCategories, ...existingCategories].some(
      (category) => category.toLowerCase() === trimmedName.toLowerCase(),
    )
  ) {
    return {
      state: "error" as const,
      message: "That category already exists.",
      categories: storedCategories,
    };
  }

  try {
    const categories = storeManagedCategories([...storedCategories, trimmedName]);
    return {
      state: "success" as const,
      message: `Added category "${trimmedName}".`,
      categories,
    };
  } catch {
    return {
      state: "error" as const,
      message: "Category could not be saved.",
      categories: storedCategories,
    };
  }
}

export function validateManagedCategoryRename(
  currentName: string,
  nextName: string,
  categories: string[],
) {
  const trimmedCurrentName = currentName.trim();
  const trimmedNextName = nextName.trim();

  if (!trimmedNextName) {
    return {
      state: "invalid" as const,
      message: "Enter a new category name.",
    };
  }

  if (trimmedCurrentName.toLowerCase() === trimmedNextName.toLowerCase()) {
    return {
      state: "invalid" as const,
      message: "Choose a different category name.",
    };
  }

  const duplicate = categories.some(
    (category) =>
      category.trim().toLowerCase() === trimmedNextName.toLowerCase() &&
      category.trim().toLowerCase() !== trimmedCurrentName.toLowerCase(),
  );

  if (duplicate) {
    return {
      state: "invalid" as const,
      message: "That category name already exists.",
    };
  }

  return {
    state: "valid" as const,
    message: "Rename application is planned and not active in this batch.",
  };
}

function normalizeManagedCategories(value: unknown) {
  const parsed = typeof value === "string" ? safeParseArray(value) : value;

  if (!Array.isArray(parsed)) {
    return [];
  }

  const categoriesByKey = new Map<string, string>();
  for (const item of parsed) {
    if (typeof item !== "string") {
      continue;
    }

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

function safeParseArray(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}
