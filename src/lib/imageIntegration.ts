import type {
  Credit,
  Image,
  ImagePatch,
  ManagedCategory,
  NewImage,
  Performer,
  Video,
} from "../backend/types";
import {
  normalizeRelatedCatalogRecordsJson,
  normalizeRelatedPerformersJson,
  parseSourceLinkArray,
  parseGalleryImagePathArray,
  parseRatingObject,
  parseRelatedCatalogRecordArray,
  parseRelatedPerformerArray,
  parseTextLabelArray,
  stringifyGalleryImagePathArray,
  stringifySourceLinkArray,
  stringifyTextLabelArray,
} from "../backend/json";
import type { CollectionConfig, ImageCollectionItem } from "./collectionData";
import { collectionConfigs } from "./collectionData";
import { deriveQualityBucket, deriveReleaseYear } from "./catalogDerivedFields";
import type { DetailSection, ImageDetailConfig } from "./detailData";
import {
  DETAIL_EMPTY_VALUE,
  formatSystemTimestamp,
  sourceLinksFromRecord,
} from "./detailData";
import { detailConfigs } from "./detailData";
import type {
  FormConfig,
  FormMode,
  RelatedCatalogRecordFormValue,
  RelatedPerformerFormValue,
  SourceLinkFormValue,
} from "./formData";
import { formConfigs } from "./formData";
import { createRatingSummary, getDetailRatingDimensions } from "./ratingSummary";
import { formatFileSize, formatOptionalText } from "./mediaTechInfo";
import { buildCreditDetailItems } from "./creditDisplay";
import { countCreditsByWork } from "./catalogCreditSummary";

type FormValues = Record<string, string | boolean>;

const imageRatingFields = formConfigs.images.ratingFields;

export function buildImageCollectionConfig(
  images: Image[],
  credits: Credit[] = [],
): CollectionConfig {
  const creditCountByWork = countCreditsByWork(credits, "image");

  return {
    ...collectionConfigs.images,
    countLabel: `${images.length} ${images.length === 1 ? "image" : "images"}`,
    items: images.map((image) => ({
      ...toImageCollectionItem(image),
      creditCount: creditCountByWork.get(image.id) ?? 0,
    })),
  };
}

export function buildImageDetailConfig(
  image: Image,
  performers: Performer[] = [],
  videos: Video[] = [],
  credits: Credit[] = [],
  managedCategories: ManagedCategory[] = [],
): ImageDetailConfig {
  const baseConfig = detailConfigs.images as ImageDetailConfig;
  const galleryImagePaths = parseGalleryImagePathArray(image.galleryImagePathsJson);
  return {
    ...baseConfig,
    recordId: image.id,
    editTo: `/images/${image.id}/edit`,
    coverPath: image.coverPath,
    displayTitle: image.title,
    originalTitle: image.originalTitle,
    code: image.code || DETAIL_EMPTY_VALUE,
    favorite: image.favorite,
    chips: [image.availability, image.censorship].filter(Boolean),
    categories: parseTextLabelArray(image.categoriesJson),
    metadata: [
      { label: "Release Date", value: detailText(image.releaseDate) },
      { label: "Publisher / Label", value: detailText(image.publisherLabel) },
    ],
    mediaPaths: [
      { label: "Cover status", path: image.coverPath },
    ],
    systemInfo: [
      { label: "Created in Sakurava", value: formatSystemTimestamp(image.createdAt) },
      { label: "Last edited", value: formatSystemTimestamp(image.updatedAt) },
      { label: "Gallery status", value: formatSavedListStatus(galleryImagePaths) },
    ],
    rating: getDetailRatingDimensions(image.ratingJson, imageRatingFields),
    techItems: [
      { label: "Image Count", value: formatGalleryCount(image.imageCount, galleryImagePaths) },
      { label: "Main Resolution", value: formatOptionalText(image.mainResolution) },
      { label: "Total File Size", value: formatFileSize(image.totalFileSizeBytes) },
      { label: "Main File Type", value: formatOptionalText(image.mainFileType) },
    ],
    notes: detailNotes(image.notes),
    sourceLinks: sourceLinksFromRecord(image),
    galleryImagePaths,
    relatedSections: buildRelatedSections(
      baseConfig.relatedSections,
      image.relatedPerformersJson,
      performers,
      image.relatedVideosJson,
      videos,
      credits,
      managedCategories,
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
    initialSourceLinks: {
      create: formConfigs.images.initialSourceLinks?.create ?? [],
      edit: formConfigs.images.initialSourceLinks?.edit ?? [],
      [mode]: parseSourceLinkArray(image.sourceLinksJson),
    },
  };
}

export function imageFormToCreateInput(
  values: FormValues,
  categories: string[],
  relatedPerformers: RelatedPerformerFormValue[] = [],
  relatedVideos: RelatedCatalogRecordFormValue[] = [],
  galleryImagePaths: string[] = [],
  sourceLinks: SourceLinkFormValue[] = [],
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
    mainResolution: textValue(values.mainResolution),
    totalFileSizeBytes: optionalInteger(values.totalFileSizeBytes),
    mainFileType: textValue(values.mainFileType),
    publisherLabel: textValue(values.publisherLabel),
    galleryImagePathsJson: stringifyGalleryImagePathArray(galleryImagePaths),
    categoriesJson: stringifyTextLabelArray(categories),
    relatedPerformersJson: normalizeRelatedPerformersJson(
      JSON.stringify(relatedPerformers),
    ),
    relatedVideosJson: normalizeRelatedCatalogRecordsJson(
      JSON.stringify(relatedVideos),
    ),
    sourceLinksJson: stringifySourceLinkArray(sourceLinks),
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
  sourceLinks: SourceLinkFormValue[] = [],
): ImagePatch {
  return imageFormToCreateInput(
    values,
    categories,
    relatedPerformers,
    relatedVideos,
    galleryImagePaths,
    sourceLinks,
  );
}

function toImageCollectionItem(image: Image): ImageCollectionItem {
  const ratingSummary = createRatingSummary(image.ratingJson, imageRatingFields);

  return {
    kind: "images",
    key: image.id,
    title: image.title,
    originalTitle: image.originalTitle,
    coverPath: image.coverPath,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
    code: image.code || "No code",
    imageCount: formatImageCount(image.imageCount),
    imageCountValue: image.imageCount,
    mainResolution: image.mainResolution,
    releaseYear: deriveReleaseYear(image.releaseDate),
    ratingAverage: ratingSummary.average,
    ratingBucket: ratingSummary.bucket,
    quality: deriveQualityBucket(image),
    availability: image.availability || "Unspecified",
    censorship: image.censorship || "Unspecified",
    publisherLabel: image.publisherLabel,
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
    mainResolution: image.mainResolution,
    totalFileSizeBytes: image.totalFileSizeBytes?.toString() ?? "",
    mainFileType: image.mainFileType,
    publisherLabel: image.publisherLabel,
    notes: image.notes,
    ...Object.fromEntries(
      imageRatingFields.map((field) => [
        field.name,
        formatFormRatingValue(rating[field.name]),
      ]),
    ),
  };
}

function formRating(values: FormValues): Record<string, number> {
  return Object.fromEntries(
    imageRatingFields
      .map((field) => [field.name, normalizeFormRatingValue(values[field.name])] as const)
      .filter(([, value]) => value >= 1 && value <= 5),
  );
}

function normalizeFormRatingValue(value: FormValues[string] | unknown): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : 1;
}

function formatFormRatingValue(value: FormValues[string] | unknown): string {
  const rating = normalizeFormRatingValue(value);
  return String(rating);
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
    return DETAIL_EMPTY_VALUE;
  }

  return `${safeCount} ${safeCount === 1 ? "image" : "images"}`;
}

function formatSavedListStatus(values: string[]) {
  return values.length > 0 ? "Available" : DETAIL_EMPTY_VALUE;
}

function detailText(value: string | null | undefined) {
  return value?.trim() || DETAIL_EMPTY_VALUE;
}

function detailNotes(value: string | null | undefined) {
  return value?.trim() || "No notes saved.";
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
  credits: Credit[],
  managedCategories: ManagedCategory[],
): DetailSection[] {
  return sections.map((section) =>
    section.title.includes("Performer")
      ? {
          ...section,
          title: credits.length > 0 ? "Cast & Credits" : section.title,
          description:
            credits.length > 0
              ? "Read-only Cast & Credits saved for this Image."
              : "Read-only Related Performer links saved on this record.",
          credits: buildCreditDetailItems(
            credits,
            performers,
            managedCategories,
            relatedPerformersJson,
          ),
          relatedPerformers: buildRelatedPerformerItems(
            relatedPerformersJson,
            performers,
          ),
        }
      : section.title.includes("Video")
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
        coverPath: performer.coverPath,
        aliases: formatAliases(performer.aliasesJson),
        metadata: performer.status || undefined,
        rating: createRatingSummary(performer.ratingJson).average,
        favorite: performer.favorite,
        filmographyCount: String(derivedRelatedCount(performer.relatedVideosJson)),
        pictorialsCount: String(derivedRelatedCount(performer.relatedImagesJson)),
        routeTo: `/performers/${performer.id}`,
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
  records: Array<Pick<Video, "id" | "title" | "originalTitle" | "code" | "coverPath" | "durationMinutes" | "releaseDate" | "ratingJson" | "favorite">>,
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
        coverPath: record.coverPath,
        code: record.code || "No code",
        metadata: formatVideoDuration(record.durationMinutes),
        releaseDate: record.releaseDate,
        rating: createRatingSummary(record.ratingJson).average,
        favorite: record.favorite,
        routeTo: `/videos/${record.id}`,
        unresolved: false,
      };
    }

    return {
      title: relation.titleSnapshot || fallbackTitle,
      unresolved: true,
    };
  });
}

function formatVideoDuration(minutes: number | null) {
  if (!minutes || minutes <= 0) {
    return undefined;
  }

  return `${minutes} min`;
}

function formatAliases(value: string | null | undefined) {
  const aliases = parseTextLabelArray(value)
    .map((alias) => alias.trim())
    .filter(Boolean);

  return aliases.length > 0 ? aliases.join(", ") : "No aliases";
}

function derivedRelatedCount(value: string | null | undefined) {
  return parseRelatedCatalogRecordArray(value).length;
}
