import type { Image, ImagePatch, NewImage, Performer } from "../backend/types";
import {
  normalizeRelatedPerformersJson,
  parseRatingObject,
  parseRelatedPerformerArray,
  parseTextLabelArray,
  stringifyTextLabelArray,
} from "../backend/json";
import type { CollectionConfig, ImageCollectionItem } from "./collectionData";
import { collectionConfigs } from "./collectionData";
import type { DetailSection, ImageDetailConfig } from "./detailData";
import { formatSystemTimestamp } from "./detailData";
import { detailConfigs } from "./detailData";
import type {
  FormConfig,
  FormMode,
  RelatedPerformerFormValue,
} from "./formData";
import { formConfigs } from "./formData";

type FormValues = Record<string, string | boolean>;

const imageRatingFields = formConfigs.images.ratingFields;

export function buildImageCollectionConfig(images: Image[]): CollectionConfig {
  return {
    ...collectionConfigs.images,
    countLabel: `${images.length} ${images.length === 1 ? "image" : "images"}`,
    items: images.map(toImageCollectionItem),
  };
}

export function buildImageDetailConfig(
  image: Image,
  performers: Performer[] = [],
): ImageDetailConfig {
  const baseConfig = detailConfigs.images as ImageDetailConfig;
  const rating = parseRatingObject(image.ratingJson);
  return {
    ...baseConfig,
    editTo: `/images/${image.id}/edit`,
    coverPath: image.coverPath,
    displayTitle: image.title,
    originalTitle: image.originalTitle,
    code: image.code || "No code",
    favorite: image.favorite,
    chips: [image.availability || "Unspecified", image.censorship || "Unspecified"],
    categories: parseTextLabelArray(image.categoriesJson),
    metadata: [
      { label: "Release Date", value: image.releaseDate || "Not set" },
      { label: "Image Count", value: formatImageCount(image.imageCount) },
      { label: "Publisher / Label", value: image.publisherLabel || "Not set" },
      { label: "Cover Path", value: image.coverPath || "Not set" },
      { label: "Folder Path", value: image.folderPath || "Not set" },
    ],
    systemInfo: [
      { label: "Created in Sakurava", value: formatSystemTimestamp(image.createdAt) },
      { label: "Last edited", value: formatSystemTimestamp(image.updatedAt) },
    ],
    rating: imageRatingFields.map((field) => ({
      label: field.label,
      value: numberFromRating(rating[field.name]),
    })),
    notes: image.notes || "No notes saved.",
    relatedSections: buildRelatedSections(
      baseConfig.relatedSections,
      image.relatedPerformersJson,
      performers,
    ),
  };
}

export function buildImageFormConfig(image: Image | null, mode: FormMode): FormConfig {
  if (!image) {
    return formConfigs.images;
  }

  const values = imageToFormValues(image);
  return {
    ...formConfigs.images,
    editCancelTo: `/images/${image.id}`,
    initialValues: {
      ...formConfigs.images.initialValues,
      [mode]: values,
    },
    initialCategories: {
      ...formConfigs.images.initialCategories,
      [mode]: parseTextLabelArray(image.categoriesJson),
    },
    initialRelatedPerformers: {
      create: formConfigs.images.initialRelatedPerformers?.create ?? [],
      edit: formConfigs.images.initialRelatedPerformers?.edit ?? [],
      [mode]: parseRelatedPerformerArray(image.relatedPerformersJson),
    },
  };
}

export function imageFormToCreateInput(
  values: FormValues,
  categories: string[],
  relatedPerformers: RelatedPerformerFormValue[] = [],
): NewImage {
  return {
    title: textValue(values.title),
    originalTitle: textValue(values.originalTitle),
    code: textValue(values.code),
    favorite: Boolean(values.favorite),
    availability: textValue(values.availability) as NewImage["availability"],
    censorship: textValue(values.censorship) as NewImage["censorship"],
    coverPath: textValue(values.coverPath),
    folderPath: textValue(values.folderPath),
    releaseDate: textValue(values.releaseDate),
    imageCount: optionalInteger(values.imageCount),
    publisherLabel: textValue(values.publisherLabel),
    categoriesJson: stringifyTextLabelArray(categories),
    relatedPerformersJson: normalizeRelatedPerformersJson(
      JSON.stringify(relatedPerformers),
    ),
    ratingJson: JSON.stringify(formRating(values)),
    notes: textValue(values.notes),
  };
}

export function imageFormToPatch(
  values: FormValues,
  categories: string[],
  relatedPerformers: RelatedPerformerFormValue[] = [],
): ImagePatch {
  return imageFormToCreateInput(values, categories, relatedPerformers);
}

function toImageCollectionItem(image: Image): ImageCollectionItem {
  return {
    kind: "images",
    key: image.id,
    title: image.title,
    originalTitle: image.originalTitle,
    coverPath: image.coverPath,
    code: image.code || "No code",
    imageCount: formatImageCount(image.imageCount),
    availability: image.availability || "Unspecified",
    censorship: image.censorship || "Unspecified",
    categories: parseTextLabelArray(image.categoriesJson),
    favorite: image.favorite,
  };
}

function imageToFormValues(image: Image): FormValues {
  const rating = parseRatingObject(image.ratingJson);
  return {
    title: image.title,
    originalTitle: image.originalTitle,
    code: image.code,
    favorite: image.favorite,
    availability: image.availability || "Owned",
    censorship: image.censorship || "Censored",
    coverPath: image.coverPath,
    folderPath: image.folderPath,
    releaseDate: image.releaseDate,
    imageCount: image.imageCount?.toString() ?? "",
    publisherLabel: image.publisherLabel,
    notes: image.notes,
    ...Object.fromEntries(
      imageRatingFields.map((field) => [
        field.name,
        rating[field.name] === undefined ? "" : String(rating[field.name]),
      ]),
    ),
  };
}

function formRating(values: FormValues): Record<string, number> {
  return Object.fromEntries(
    imageRatingFields
      .map((field) => [field.name, Number(values[field.name])] as const)
      .filter(([, value]) => Number.isFinite(value) && value >= 1 && value <= 5),
  );
}

function numberFromRating(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function textValue(value: FormValues[string]) {
  return typeof value === "string" ? value : "";
}

function optionalInteger(value: FormValues[string]) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function formatImageCount(count: number | null) {
  if (!count) {
    return "Not set";
  }

  return `${count} ${count === 1 ? "image" : "images"}`;
}

function buildRelatedSections(
  sections: DetailSection[],
  relatedPerformersJson: string | null | undefined,
  performers: Performer[],
): DetailSection[] {
  return sections.map((section) =>
    section.title === "Related Performer"
      ? {
          ...section,
          description: "Read-only Related Performer links saved on this record.",
          relatedPerformers: buildRelatedPerformerItems(
            relatedPerformersJson,
            performers,
          ),
        }
      : section,
  );
}

function buildRelatedPerformerItems(
  relatedPerformersJson: string | null | undefined,
  performers: Performer[],
) {
  const performerById = new Map(performers.map((performer) => [performer.id, performer]));

  return parseRelatedPerformerArray(relatedPerformersJson).map((relation) => {
    const performer = relation.performerId
      ? performerById.get(relation.performerId)
      : undefined;

    if (performer) {
      const name = performer.name || performer.originalName || relation.nameSnapshot || "Unresolved Performer";
      return {
        name,
        originalName:
          performer.originalName && performer.originalName !== name
            ? performer.originalName
            : undefined,
        unresolved: false,
      };
    }

    return {
      name: relation.nameSnapshot || "Unresolved Performer",
      unresolved: true,
    };
  });
}
