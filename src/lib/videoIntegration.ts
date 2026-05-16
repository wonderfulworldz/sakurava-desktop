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
  const rating = parseRatingObject(video.ratingJson);
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
      { label: "Duration", value: formatDuration(video.durationMinutes) },
      { label: "Publisher / Label", value: video.publisherLabel || "Not set" },
      { label: "Cover Path", value: video.coverPath || "Not set" },
      { label: "Media Path", value: video.mediaPath || "Not set" },
    ],
    systemInfo: [
      { label: "Created in Sakurava", value: formatSystemTimestamp(video.createdAt) },
      { label: "Last edited", value: formatSystemTimestamp(video.updatedAt) },
    ],
    rating: videoRatingFields.map((field) => ({
      label: field.label,
      value: numberFromRating(rating[field.name]),
    })),
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
    durationMinutes: optionalInteger(values.durationMinutes),
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
    coverPath: video.coverPath,
    duration: formatDuration(video.durationMinutes),
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
    durationMinutes: video.durationMinutes?.toString() ?? "",
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

function formatDuration(minutes: number | null) {
  if (!minutes) {
    return "Not set";
  }

  return `${minutes} min`;
}

function buildRelatedSections(
  sections: DetailSection[],
  relatedPerformersJson: string | null | undefined,
  performers: Performer[],
  relatedImagesJson: string | null | undefined,
  images: Image[],
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
      : section.title === "Related Images"
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
  records: Array<Pick<Image, "id" | "title" | "originalTitle">>,
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
