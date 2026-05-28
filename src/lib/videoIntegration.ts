import type { Image, NewVideo, Performer, Video, VideoPatch } from "../backend/types";
import {
  normalizeRelatedCatalogRecordsJson,
  normalizeRelatedPerformersJson,
  parseRatingObject,
  parseRelatedCatalogRecordArray,
  parseRelatedPerformerArray,
  parseTextLabelArray,
  stringifyTextLabelArray,
} from "../backend/json";
import type { CollectionConfig, VideoCollectionItem } from "./collectionData";
import { collectionConfigs } from "./collectionData";
import { deriveQualityBucket, deriveReleaseYear } from "./catalogDerivedFields";
import type { DetailSection, VideoDetailConfig } from "./detailData";
import { formatSystemTimestamp } from "./detailData";
import { detailConfigs } from "./detailData";
import type {
  FormConfig,
  FormMode,
  RelatedCatalogRecordFormValue,
  RelatedPerformerFormValue,
} from "./formData";
import { formConfigs } from "./formData";
import { createRatingSummary, getRatingDimensions } from "./ratingSummary";
import { formatFileSize, formatOptionalText } from "./mediaTechInfo";

type FormValues = Record<string, string | boolean>;

const videoRatingFields = formConfigs.videos.ratingFields;

export function buildVideoCollectionConfig(videos: Video[]): CollectionConfig {
  return {
    ...collectionConfigs.videos,
    countLabel: `${videos.length} ${videos.length === 1 ? "video" : "videos"}`,
    items: videos.map(toVideoCollectionItem),
  };
}

export function buildVideoDetailConfig(
  video: Video,
  performers: Performer[] = [],
  images: Image[] = [],
): VideoDetailConfig {
  const baseConfig = detailConfigs.videos as VideoDetailConfig;
  return {
    ...baseConfig,
    editTo: `/videos/${video.id}/edit`,
    coverPath: video.coverPath,
    displayTitle: video.title,
    originalTitle: video.originalTitle,
    code: video.code || "No code",
    favorite: video.favorite,
    chips: [video.availability || "Unspecified", video.censorship || "Unspecified"],
    categories: parseTextLabelArray(video.categoriesJson),
    metadata: [
      { label: "Release Date", value: video.releaseDate || "Not set" },
      { label: "Publisher / Label", value: video.publisherLabel || "Not set" },
    ],
    mediaPaths: [
      { label: "Cover status", path: video.coverPath },
      { label: "Media status", path: video.mediaPath, playable: true },
    ],
    systemInfo: [
      { label: "Created in Sakurava", value: formatSystemTimestamp(video.createdAt) },
      { label: "Last edited", value: formatSystemTimestamp(video.updatedAt) },
    ],
    rating: getRatingDimensions(video.ratingJson, videoRatingFields),
    techItems: [
      { label: "Duration", value: formatDuration(video.durationMinutes) },
      { label: "Resolution", value: formatDetectedText(video.resolution) },
      { label: "File Size", value: formatFileSize(video.fileSizeBytes) },
      { label: "File Type", value: formatOptionalText(video.fileType) },
    ],
    notes: video.notes || "No notes saved.",
    relatedSections: buildRelatedSections(
      baseConfig.relatedSections,
      video.relatedPerformersJson,
      performers,
      video.relatedImagesJson,
      images,
    ),
  };
}

export function buildVideoFormConfig(video: Video | null, mode: FormMode): FormConfig {
  if (!video) {
    return formConfigs.videos;
  }

  const values = videoToFormValues(video);
  return {
    ...formConfigs.videos,
    editCancelTo: `/videos/${video.id}`,
    initialValues: {
      ...formConfigs.videos.initialValues,
      [mode]: values,
    },
    initialCategories: {
      ...formConfigs.videos.initialCategories,
      [mode]: parseTextLabelArray(video.categoriesJson),
    },
    initialRelatedPerformers: {
      create: formConfigs.videos.initialRelatedPerformers?.create ?? [],
      edit: formConfigs.videos.initialRelatedPerformers?.edit ?? [],
      [mode]: parseRelatedPerformerArray(video.relatedPerformersJson),
    },
    initialRelatedCatalogRecords: {
      create: formConfigs.videos.initialRelatedCatalogRecords?.create ?? [],
      edit: formConfigs.videos.initialRelatedCatalogRecords?.edit ?? [],
      [mode]: parseRelatedCatalogRecordArray(video.relatedImagesJson),
    },
  };
}

export function videoFormToCreateInput(
  values: FormValues,
  categories: string[],
  relatedPerformers: RelatedPerformerFormValue[] = [],
  relatedImages: RelatedCatalogRecordFormValue[] = [],
): NewVideo {
  return {
    title: textValue(values.title),
    originalTitle: textValue(values.originalTitle),
    code: textValue(values.code),
    favorite: Boolean(values.favorite),
    availability: textValue(values.availability) as NewVideo["availability"],
    censorship: textValue(values.censorship) as NewVideo["censorship"],
    coverPath: textValue(values.coverPath),
    mediaPath: textValue(values.mediaPath),
    releaseDate: textValue(values.releaseDate),
    durationMinutes: optionalPositiveInteger(values.durationMinutes),
    resolution: textValue(values.resolution),
    fileSizeBytes: optionalInteger(values.fileSizeBytes),
    fileType: textValue(values.fileType),
    publisherLabel: textValue(values.publisherLabel),
    categoriesJson: stringifyTextLabelArray(categories),
    relatedPerformersJson: normalizeRelatedPerformersJson(
      JSON.stringify(relatedPerformers),
    ),
    relatedImagesJson: normalizeRelatedCatalogRecordsJson(
      JSON.stringify(relatedImages),
    ),
    ratingJson: JSON.stringify(formRating(values)),
    notes: textValue(values.notes),
  };
}

export function videoFormToPatch(
  values: FormValues,
  categories: string[],
  relatedPerformers: RelatedPerformerFormValue[] = [],
  relatedImages: RelatedCatalogRecordFormValue[] = [],
): VideoPatch {
  return videoFormToCreateInput(
    values,
    categories,
    relatedPerformers,
    relatedImages,
  );
}

function toVideoCollectionItem(video: Video): VideoCollectionItem {
  return {
    kind: "videos",
    key: video.id,
    title: video.title,
    originalTitle: video.originalTitle,
    code: video.code || "No code",
    coverPath: video.coverPath,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
    duration: formatDuration(video.durationMinutes),
    durationMinutes: video.durationMinutes,
    resolution: video.resolution,
    releaseYear: deriveReleaseYear(video.releaseDate),
    ratingBucket: createRatingSummary(video.ratingJson, videoRatingFields).bucket,
    quality: deriveQualityBucket(video),
    availability: video.availability || "Unspecified",
    censorship: video.censorship || "Unspecified",
    categories: parseTextLabelArray(video.categoriesJson),
    favorite: video.favorite,
  };
}

function videoToFormValues(video: Video): FormValues {
  const rating = parseRatingObject(video.ratingJson);
  return {
    title: video.title,
    originalTitle: video.originalTitle,
    code: video.code,
    favorite: video.favorite,
    availability: video.availability || "Owned",
    censorship: video.censorship || "Censored",
    coverPath: video.coverPath,
    mediaPath: video.mediaPath,
    releaseDate: video.releaseDate,
    durationMinutes:
      typeof video.durationMinutes === "number" && video.durationMinutes > 0
        ? video.durationMinutes.toString()
        : "",
    resolution: video.resolution,
    fileSizeBytes: video.fileSizeBytes?.toString() ?? "",
    fileType: video.fileType,
    publisherLabel: video.publisherLabel,
    notes: video.notes,
    ...Object.fromEntries(
      videoRatingFields.map((field) => [
        field.name,
        rating[field.name] === undefined ? "" : String(rating[field.name]),
      ]),
    ),
  };
}

function formRating(values: FormValues): Record<string, number> {
  return Object.fromEntries(
    videoRatingFields
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

function optionalPositiveInteger(value: FormValues[string]) {
  const number = optionalInteger(value);
  return number !== null && number > 0 ? number : null;
}

function formatDuration(minutes: number | null) {
  if (!minutes || minutes <= 0) {
    return "Not detected yet";
  }

  return `${minutes} min`;
}

function formatDetectedText(value: string | null | undefined) {
  return value?.trim() || "Not detected yet";
}

function buildRelatedSections(
  sections: DetailSection[],
  relatedPerformersJson: string | null | undefined,
  performers: Performer[],
  relatedImagesJson: string | null | undefined,
  images: Image[],
): DetailSection[] {
  return sections.map((section) =>
    section.title.includes("Performer")
      ? {
          ...section,
          description: "Read-only Related Performer links saved on this record.",
          relatedPerformers: buildRelatedPerformerItems(
            relatedPerformersJson,
            performers,
          ),
        }
      : section.title.includes("Image")
        ? {
            ...section,
            description: "Read-only Related Image links saved on this record.",
            relatedCatalogRecords: buildRelatedCatalogItems(
              relatedImagesJson,
              images,
              "Unresolved Image",
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
  records: Array<Pick<Image, "id" | "title" | "originalTitle" | "code" | "coverPath" | "imageCount" | "releaseDate" | "ratingJson">>,
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
        metadata: formatImageCount(record.imageCount),
        releaseDate: record.releaseDate,
        rating: createRatingSummary(record.ratingJson).average,
        routeTo: `/images/${record.id}`,
        unresolved: false,
      };
    }

    return {
      title: relation.titleSnapshot || fallbackTitle,
      unresolved: true,
    };
  });
}

function formatImageCount(count: number | null) {
  if (!count) {
    return undefined;
  }

  return `${count} ${count === 1 ? "image" : "images"}`;
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
