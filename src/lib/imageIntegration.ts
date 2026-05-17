import type { Image, ImagePatch, NewImage, Performer, Video } from "../backend/types";
import {
  normalizeRelatedCatalogRecordsJson,
  normalizeRelatedPerformersJson,
  parseGalleryImagePathArray,
  parseRatingObject,
  parseRelatedCatalogRecordArray,
  parseRelatedPerformerArray,
  parseTextLabelArray,
  stringifyGalleryImagePathArray,
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
  RelatedCatalogRecordFormValue,
  RelatedPerformerFormValue,
} from "./formData";
import { formConfigs } from "./formData";
import { getRatingDimensions } from "./ratingSummary";

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
  videos: Video[] = [],
): ImageDetailConfig {
  const baseConfig = detailConfigs.images as ImageDetailConfig;
  const galleryImagePaths = parseGalleryImagePathArray(image.galleryImagePathsJson);
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
      { label: "Publisher / Label", value: image.publisherLabel || "Not set" },
    ],
    mediaPaths: [
      { label: "Cover status", path: image.coverPath },
    ],
    systemInfo: [
      { label: "Created in Sakurava", value: formatSystemTimestamp(image.createdAt) },
      { label: "Last edited", value: formatSystemTimestamp(image.updatedAt) },
      { label: "Gallery status", value: formatSavedListStatus(galleryImagePaths) },
    ],
    rating: getRatingDimensions(image.ratingJson, imageRatingFields),
    techItems: [
      { label: "Gallery Count", value: formatGalleryCount(image.imageCount, galleryImagePaths) },
      { label: "Resolution", value: "Not available" },
      { label: "File Size", value: "Not available" },
      { label: "File Type", value: "Not available" },
    ],
    notes: image.notes || "No notes saved.",
    galleryImagePaths,
    relatedSections: buildRelatedSections(
      baseConfig.relatedSections,
      image.relatedPerformersJson,
      performers,
      image.relatedVideosJson,
      videos,
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
    initialRelatedCatalogRecords: {
      create: formConfigs.images.initialRelatedCatalogRecords?.create ?? [],
      edit: formConfigs.images.initialRelatedCatalogRecords?.edit ?? [],
      [mode]: parseRelatedCatalogRecordArray(image.relatedVideosJson),
    },
    initialGalleryImagePaths: {
      create: formConfigs.images.initialGalleryImagePaths?.create ?? [],
      edit: formConfigs.images.initialGalleryImagePaths?.edit ?? [],
      [mode]: parseGalleryImagePathArray(image.galleryImagePathsJson),
    },
  };
}

export function imageFormToCreateInput(
  values: FormValues,
  categories: string[],
  relatedPerformers: RelatedPerformerFormValue[] = [],
  relatedVideos: RelatedCatalogRecordFormValue[] = [],
  galleryImagePaths: string[] = [],
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
    galleryImagePathsJson: stringifyGalleryImagePathArray(galleryImagePaths),
    categoriesJson: stringifyTextLabelArray(categories),
    relatedPerformersJson: normalizeRelatedPerformersJson(
      JSON.stringify(relatedPerformers),
    ),
    relatedVideosJson: normalizeRelatedCatalogRecordsJson(
      JSON.stringify(relatedVideos),
    ),
    ratingJson: JSON.stringify(formRating(values)),
    notes: textValue(values.notes),
  };
}

export function imageFormToPatch(
  values: FormValues,
  categories: string[],
  relatedPerformers: RelatedPerformerFormValue[] = [],
  relatedVideos: RelatedCatalogRecordFormValue[] = [],
  galleryImagePaths: string[] = [],
): ImagePatch {
  return imageFormToCreateInput(
    values,
    categories,
    relatedPerformers,
    relatedVideos,
    galleryImagePaths,
  );
}

function toImageCollectionItem(image: Image): ImageCollectionItem {
  return {
    kind: "images",
    key: image.id,
    title: image.title,
    originalTitle: image.originalTitle,
    coverPath: image.coverPath,
    updatedAt: image.updatedAt,
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

function formatGalleryCount(count: number | null, galleryImagePaths: string[]) {
  const safeCount =
    typeof count === "number" && Number.isInteger(count) && count > 0
      ? count
      : galleryImagePaths.length > 0
        ? galleryImagePaths.length
        : null;

  if (!safeCount) {
    return "Not available";
  }

  return `${safeCount} ${safeCount === 1 ? "image" : "images"}`;
}

function formatSavedListStatus(values: string[]) {
  return values.length > 0 ? "Set" : "Not set";
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
  relatedVideosJson: string | null | undefined,
  videos: Video[],
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
      : section.title === "Related Video"
        ? {
            ...section,
            description: "Read-only Related Video links saved on this record.",
            relatedCatalogRecords: buildRelatedCatalogItems(
              relatedVideosJson,
              videos,
              "Unresolved Video",
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

function buildRelatedCatalogItems(
  relatedCatalogJson: string | null | undefined,
  records: Array<Pick<Video, "id" | "title" | "originalTitle">>,
  fallbackTitle: string,
) {
  const recordById = new Map(records.map((record) => [record.id, record]));

  return parseRelatedCatalogRecordArray(relatedCatalogJson).map((relation) => {
    const record = relation.recordId
      ? recordById.get(relation.recordId)
      : undefined;

    if (record) {
      const title =
        record.title || record.originalTitle || relation.titleSnapshot || fallbackTitle;
      return {
        title,
        originalTitle:
          record.originalTitle && record.originalTitle !== title
            ? record.originalTitle
            : undefined,
        unresolved: false,
      };
    }

    return {
      title: relation.titleSnapshot || fallbackTitle,
      unresolved: true,
    };
  });
}
