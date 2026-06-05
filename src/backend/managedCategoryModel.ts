import { parseTextLabelArray } from "./json";
import type {
  EntityId,
  ManagedCategory,
  ManagedCategoryPatch,
  NewManagedCategory,
  ValidationResult,
} from "./types";

export const MANAGED_CATEGORY_DESCRIPTION_MAX_LENGTH = 500;

export type ManagedCategoryUsageCounts = {
  videos: number;
  images: number;
  performers: number;
  total: number;
};

export const defaultManagedCategoryVisibility = {
  showInVideos: true,
  showInImages: true,
  showInPerformers: true,
} as const;

export function normalizeManagedCategoryInput(
  input: NewManagedCategory | (ManagedCategory & NewManagedCategory),
): NewManagedCategory {
  return {
    ...input,
    key:
      typeof input.key === "string" && input.key.trim()
        ? input.key.trim()
        : buildManagedCategoryKey(input.name),
    name: input.name.trim(),
    parentKey:
      typeof input.parentKey === "string" && input.parentKey.trim()
        ? input.parentKey.trim()
        : null,
    description:
      typeof input.description === "string" ? input.description.trim() : "",
    thumbnailPath:
      typeof input.thumbnailPath === "string" ? input.thumbnailPath.trim() : "",
    showInVideos:
      typeof input.showInVideos === "boolean"
        ? input.showInVideos
        : defaultManagedCategoryVisibility.showInVideos,
    showInImages:
      typeof input.showInImages === "boolean"
        ? input.showInImages
        : defaultManagedCategoryVisibility.showInImages,
    showInPerformers:
      typeof input.showInPerformers === "boolean"
        ? input.showInPerformers
        : defaultManagedCategoryVisibility.showInPerformers,
  };
}

export function validateManagedCategoryInput(
  input: NewManagedCategory | (ManagedCategory & NewManagedCategory),
  existingCategories: readonly ManagedCategory[] = [],
  currentKey?: EntityId,
): ValidationResult {
  const normalized = normalizeManagedCategoryInput(input);
  const errors: ValidationResult["errors"] = [];

  if (!normalized.name) {
    errors.push({ field: "name", message: "Category name is required." });
  }

  if (
    normalized.description &&
    normalized.description.length > MANAGED_CATEGORY_DESCRIPTION_MAX_LENGTH
  ) {
    errors.push({
      field: "description",
      message: "Category description must be 500 characters or fewer.",
    });
  }

  const duplicateName = existingCategories.some(
    (category) =>
      category.key !== currentKey &&
      category.name.trim().toLowerCase() === normalized.name.toLowerCase(),
  );
  if (duplicateName) {
    errors.push({
      field: "name",
      message: "That category name already exists.",
    });
  }

  const parentKey = normalized.parentKey ?? null;
  const currentCategoryKey =
    currentKey ?? normalized.key ?? buildManagedCategoryKey(normalized.name);
  if (parentKey) {
    const parentCategory = existingCategories.find(
      (category) => category.key === parentKey,
    );
    if (parentKey === currentKey || parentKey === normalized.key) {
      errors.push({
        field: "parentKey",
        message: "A category cannot be its own parent.",
      });
    } else if (!parentCategory) {
      errors.push({
        field: "parentKey",
        message: "Parent category could not be found.",
      });
    } else if (parentCategory.parentKey) {
      errors.push({
        field: "parentKey",
        message: "Only categories with No Parent can be selected as a parent.",
      });
    } else if (
      existingCategories.some((category) => category.parentKey === currentCategoryKey)
    ) {
      errors.push({
        field: "parentKey",
        message: "A category with child categories must stay at No Parent.",
      });
    } else if (
      wouldCreateCircularParent(
        existingCategories,
        currentCategoryKey,
        parentKey,
      )
    ) {
      errors.push({
        field: "parentKey",
        message: "Parent category would create a circular hierarchy.",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildManagedCategoryKey(name: string): EntityId {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "category";

  return `cat-${slug}-${hashText(name)}`;
}

export function countManagedCategoryUsage(
  categoryName: string,
  records: {
    videos: readonly { categoriesJson: string }[];
    images: readonly { categoriesJson: string }[];
    performers: readonly { categoriesJson: string }[];
  },
): ManagedCategoryUsageCounts {
  const key = categoryName.trim().toLowerCase();
  const countRecords = (items: readonly { categoriesJson: string }[]) =>
    items.filter((record) =>
      parseTextLabelArray(record.categoriesJson).some(
        (label) => label.trim().toLowerCase() === key,
      ),
    ).length;

  const videos = countRecords(records.videos);
  const images = countRecords(records.images);
  const performers = countRecords(records.performers);

  return {
    videos,
    images,
    performers,
    total: videos + images + performers,
  };
}

export function findManagedCategoryDescendantKeys(
  categories: readonly ManagedCategory[],
  key: EntityId,
): EntityId[] {
  const descendants = new Set<EntityId>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const category of categories) {
      if (
        category.parentKey &&
        (category.parentKey === key || descendants.has(category.parentKey)) &&
        !descendants.has(category.key)
      ) {
        descendants.add(category.key);
        changed = true;
      }
    }
  }

  return [...descendants];
}

export function applyManagedCategoryPatch(
  current: ManagedCategory,
  patch: ManagedCategoryPatch,
): NewManagedCategory & Pick<ManagedCategory, "key"> {
  return {
    key: current.key,
    name: patch.name ?? current.name,
    parentKey: patch.parentKey === undefined ? current.parentKey : patch.parentKey,
    description: patch.description ?? current.description,
    thumbnailPath: patch.thumbnailPath ?? current.thumbnailPath,
    showInVideos: patch.showInVideos ?? current.showInVideos,
    showInImages: patch.showInImages ?? current.showInImages,
    showInPerformers: patch.showInPerformers ?? current.showInPerformers,
  };
}

function wouldCreateCircularParent(
  categories: readonly ManagedCategory[],
  key: EntityId,
  parentKey: EntityId,
) {
  let nextParentKey: EntityId | null = parentKey;
  const visited = new Set<EntityId>();

  while (nextParentKey) {
    if (nextParentKey === key || visited.has(nextParentKey)) {
      return true;
    }

    visited.add(nextParentKey);
    nextParentKey =
      categories.find((category) => category.key === nextParentKey)?.parentKey ??
      null;
  }

  return false;
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
