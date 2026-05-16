import {
  defaultAliasesJson,
  defaultCategoriesJson,
  defaultPerformerThumbnailPathsJson,
  defaultRelatedCatalogRecordsJson,
  defaultRelatedPerformersJson,
  defaultRatingJson,
} from "./json";
import type {
  Image,
  NewImage,
  NewPerformer,
  NewVideo,
  Performer,
  ValidationError,
  ValidationResult,
  Video,
} from "./types";

function requiredText(value: string | undefined, field: string): ValidationError[] {
  return value?.trim()
    ? []
    : [{ field, message: `${field} is required.` }];
}

function optionalInteger(
  value: number | null | undefined,
  field: string,
): ValidationError[] {
  if (value === null || value === undefined) {
    return [];
  }

  return Number.isInteger(value)
    ? []
    : [{ field, message: `${field} must be an integer when provided.` }];
}

function result(errors: ValidationError[]): ValidationResult {
  return { valid: errors.length === 0, errors };
}

export function validateVideoInput(input: Pick<NewVideo, "title"> & Partial<NewVideo>) {
  return result([
    ...requiredText(input.title, "title"),
    ...optionalInteger(input.durationMinutes, "durationMinutes"),
  ]);
}

export function validateImageInput(input: Pick<NewImage, "title"> & Partial<NewImage>) {
  return result([
    ...requiredText(input.title, "title"),
    ...optionalInteger(input.imageCount, "imageCount"),
  ]);
}

export function validatePerformerInput(
  input: Pick<NewPerformer, "name"> & Partial<NewPerformer>,
) {
  return result([
    ...requiredText(input.name, "name"),
    ...optionalInteger(input.filmographyCount, "filmographyCount"),
    ...optionalInteger(input.pictorialsCount, "pictorialsCount"),
  ]);
}

export function normalizeVideoDefaults(video: NewVideo): NewVideo {
  return {
    ...video,
    title: video.title.trim(),
    originalTitle: video.originalTitle ?? "",
    code: video.code ?? "",
    censorship: video.censorship ?? "",
    availability: video.availability ?? "",
    releaseDate: video.releaseDate ?? "",
    durationMinutes: video.durationMinutes ?? null,
    publisherLabel: video.publisherLabel ?? "",
    coverPath: video.coverPath ?? "",
    mediaPath: video.mediaPath ?? "",
    categoriesJson: defaultCategoriesJson(video.categoriesJson),
    relatedPerformersJson: defaultRelatedPerformersJson(
      video.relatedPerformersJson,
    ),
    relatedImagesJson: defaultRelatedCatalogRecordsJson(video.relatedImagesJson),
    ratingJson: defaultRatingJson(video.ratingJson),
    notes: video.notes ?? "",
    favorite: video.favorite ?? false,
  };
}

export function normalizeImageDefaults(image: NewImage): NewImage {
  return {
    ...image,
    title: image.title.trim(),
    originalTitle: image.originalTitle ?? "",
    code: image.code ?? "",
    censorship: image.censorship ?? "",
    availability: image.availability ?? "",
    releaseDate: image.releaseDate ?? "",
    publisherLabel: image.publisherLabel ?? "",
    coverPath: image.coverPath ?? "",
    folderPath: image.folderPath ?? "",
    imageCount: image.imageCount ?? null,
    categoriesJson: defaultCategoriesJson(image.categoriesJson),
    relatedPerformersJson: defaultRelatedPerformersJson(
      image.relatedPerformersJson,
    ),
    relatedVideosJson: defaultRelatedCatalogRecordsJson(image.relatedVideosJson),
    ratingJson: defaultRatingJson(image.ratingJson),
    notes: image.notes ?? "",
    favorite: image.favorite ?? false,
  };
}

export function normalizePerformerDefaults(performer: NewPerformer): NewPerformer {
  return {
    ...performer,
    name: performer.name.trim(),
    originalName: performer.originalName ?? "",
    aliasesJson: defaultAliasesJson(performer.aliasesJson),
    status: performer.status ?? "",
    birthDate: performer.birthDate ?? "",
    coverPath: performer.coverPath ?? "",
    performerThumbnailPathsJson: defaultPerformerThumbnailPathsJson(
      performer.performerThumbnailPathsJson,
    ),
    filmographyCount: performer.filmographyCount ?? null,
    pictorialsCount: performer.pictorialsCount ?? null,
    categoriesJson: defaultCategoriesJson(performer.categoriesJson),
    ratingJson: defaultRatingJson(performer.ratingJson),
    notes: performer.notes ?? "",
    favorite: performer.favorite ?? false,
  };
}

export function isVideo(value: unknown): value is Video {
  return Boolean(value && typeof value === "object" && "title" in value);
}

export function isImage(value: unknown): value is Image {
  return Boolean(value && typeof value === "object" && "folderPath" in value);
}

export function isPerformer(value: unknown): value is Performer {
  return Boolean(value && typeof value === "object" && "name" in value);
}
