import type { Image, NewPerformer, Performer, PerformerPatch, Video } from "../backend/types";
import {
  normalizePerformerThumbnailPathsJson,
  parsePerformerThumbnailPathArray,
  parseRatingObject,
  parseRelatedCatalogRecordArray,
  parseTextLabelArray,
  normalizeRelatedCatalogRecordsJson,
  stringifyTextLabelArray,
} from "../backend/json";
import type { RelatedCatalogRecordFormValue } from "./formData";
import type { CollectionConfig, PerformerCollectionItem } from "./collectionData";
import { collectionConfigs } from "./collectionData";
import { deriveDebutYear } from "./catalogDerivedFields";
import type { DetailSection, PerformerDetailConfig } from "./detailData";
import { formatSystemTimestamp } from "./detailData";
import { detailConfigs } from "./detailData";
import type { FormConfig, FormMode } from "./formData";
import { formConfigs } from "./formData";
import { createRatingSummary, getRatingDimensions } from "./ratingSummary";

type FormValues = Record<string, string | boolean>;

const performerRatingFields = formConfigs.performers.ratingFields;
export type DerivedPerformerStatus = "Unknown" | "Active" | "Retired";

export function buildPerformerCollectionConfig(
  performers: Performer[],
): CollectionConfig {
  return {
    ...collectionConfigs.performers,
    countLabel: `${performers.length} ${
      performers.length === 1 ? "performer" : "performers"
    }`,
    items: performers.map(toPerformerCollectionItem),
  };
}

export function buildPerformerDetailConfig(
  performer: Performer,
  videos: Video[] = [],
  images: Image[] = [],
): PerformerDetailConfig {
  const baseConfig = detailConfigs.performers as PerformerDetailConfig;
  const thumbnailPaths = parsePerformerThumbnailPathArray(
    performer.performerThumbnailPathsJson,
  );
  const derivedStatus = derivePerformerStatus(performer);
  const filmographyCount = derivedRelatedCount(performer.relatedVideosJson);
  const pictorialsCount = derivedRelatedCount(performer.relatedImagesJson);
  return {
    ...baseConfig,
    editTo: `/performers/${performer.id}/edit`,
    coverPath: performer.coverPath,
    displayTitle: performer.name,
    originalTitle: performer.originalName,
    favorite: performer.favorite,
    chips: [derivedStatus],
    aliases: parseTextLabelArray(performer.aliasesJson),
    thumbnailPaths,
    categories: parseTextLabelArray(performer.categoriesJson),
    summary: [
      {
        label: "Years Active",
        value: formatYearsActive(performer),
        secondaryValue: formatYearsActiveAges(performer),
      },
      { label: "Filmography", value: String(filmographyCount) },
      { label: "Pictorials", value: String(pictorialsCount) },
    ],
    metadata: [
      { label: "Debut Date", value: performer.debutDate || "Not set" },
      { label: "Retired Date", value: performer.retiredDate || "Not set" },
      { label: "Birth Date", value: performer.birthDate || "Not set" },
    ],
    mediaPaths: [{ label: "Profile image status", path: performer.coverPath }],
    techItems: Array.from({ length: 4 }, (_, index) => ({
      label: `Performer Thumbnail ${index + 1}`,
      value: thumbnailPaths[index] ? "Saved" : "Not set",
    })),
    techMessage: "Mini thumbnails use explicit saved local image paths.",
    systemInfo: [
      { label: "Created in Sakurava", value: formatSystemTimestamp(performer.createdAt) },
      { label: "Last edited", value: formatSystemTimestamp(performer.updatedAt) },
    ],
    personal: [
      { label: "Birth Date", value: performer.birthDate || "Not set" },
      { label: "Birthplace", value: performer.birthplace || "Not set" },
      { label: "Nationality", value: performer.nationality || "Not set" },
      { label: "Astrological Sign", value: deriveAstrologicalSign(performer.birthDate) },
      { label: "Blood Type", value: performer.bloodType || "Not set" },
    ],
    physical: [
      { label: "Height", value: formatUnit(performer.heightCm, "cm") },
      { label: "Weight", value: formatUnit(performer.weightKg, "kg") },
      { label: "Measurement", value: performer.measurements || "Not set" },
      { label: "Cup Size", value: performer.cupSize || "Not set" },
    ],
    rating: getRatingDimensions(performer.ratingJson, performerRatingFields),
    notes: performer.notes || "No notes saved.",
    relatedSections: buildRelatedSections(
      baseConfig.relatedSections,
      performer.relatedVideosJson,
      videos,
      performer.relatedImagesJson,
      images,
    ),
  };
}

export function buildPerformerFormConfig(
  performer: Performer | null,
  mode: FormMode,
): FormConfig {
  if (!performer) {
    return formConfigs.performers;
  }

  const values = performerToFormValues(performer);
  return {
    ...formConfigs.performers,
    editCancelTo: `/performers/${performer.id}`,
    initialValues: {
      ...formConfigs.performers.initialValues,
      [mode]: values,
    },
    initialCategories: {
      ...formConfigs.performers.initialCategories,
      [mode]: parseTextLabelArray(performer.categoriesJson),
    },
    initialAliases: {
      ...(formConfigs.performers.initialAliases ?? { create: [], edit: [] }),
      [mode]: parseTextLabelArray(performer.aliasesJson),
    },
    initialPerformerRelatedVideos: {
      ...(formConfigs.performers.initialPerformerRelatedVideos ?? {
        create: [],
        edit: [],
      }),
      [mode]: parseRelatedCatalogRecordArray(performer.relatedVideosJson),
    },
    initialPerformerRelatedImages: {
      ...(formConfigs.performers.initialPerformerRelatedImages ?? {
        create: [],
        edit: [],
      }),
      [mode]: parseRelatedCatalogRecordArray(performer.relatedImagesJson),
    },
  };
}

export function performerFormToCreateInput(
  values: FormValues,
  categories: string[],
  aliases: string[],
  relatedVideos: RelatedCatalogRecordFormValue[] = [],
  relatedImages: RelatedCatalogRecordFormValue[] = [],
): NewPerformer {
  return {
    name: textValue(values.name),
    originalName: textValue(values.originalName),
    aliasesJson: stringifyTextLabelArray(aliases),
    favorite: Boolean(values.favorite),
    status: derivePerformerStatusFromDates(
      textValue(values.debutDate),
      textValue(values.retiredDate),
    ),
    debutDate: textValue(values.debutDate),
    retiredDate: textValue(values.retiredDate),
    birthDate: textValue(values.birthDate),
    birthplace: textValue(values.birthplace),
    nationality: textValue(values.nationality),
    bloodType: textValue(values.bloodType),
    heightCm: optionalInteger(values.heightCm),
    weightKg: optionalInteger(values.weightKg),
    measurements: formatMeasurements(values),
    cupSize: textValue(values.cupSize),
    coverPath: textValue(values.coverPath),
    performerThumbnailPathsJson: formThumbnailPathsJson(values),
    filmographyCount: relatedVideos.length,
    pictorialsCount: relatedImages.length,
    relatedVideosJson: normalizeRelatedCatalogRecordsJson(
      JSON.stringify(relatedVideos),
    ),
    relatedImagesJson: normalizeRelatedCatalogRecordsJson(
      JSON.stringify(relatedImages),
    ),
    categoriesJson: stringifyTextLabelArray(categories),
    ratingJson: JSON.stringify(formRating(values)),
    notes: textValue(values.notes),
  };
}

export function performerFormToPatch(
  values: FormValues,
  categories: string[],
  aliases: string[],
  relatedVideos: RelatedCatalogRecordFormValue[] = [],
  relatedImages: RelatedCatalogRecordFormValue[] = [],
): PerformerPatch {
  return performerFormToCreateInput(values, categories, aliases, relatedVideos, relatedImages);
}

function toPerformerCollectionItem(
  performer: Performer,
): PerformerCollectionItem {
  return {
    kind: "performers",
    key: performer.id,
    name: performer.name,
    originalName: performer.originalName,
    coverPath: performer.coverPath,
    createdAt: performer.createdAt,
    updatedAt: performer.updatedAt,
    status: derivePerformerStatus(performer),
    debutYear: deriveDebutYear(performer),
    ratingBucket: createRatingSummary(performer.ratingJson, performerRatingFields).bucket,
    filmographyCount: `Filmography ${derivedRelatedCount(performer.relatedVideosJson)}`,
    filmographyCountValue: derivedRelatedCount(performer.relatedVideosJson),
    pictorialsCount: `Pictorials ${derivedRelatedCount(performer.relatedImagesJson)}`,
    pictorialsCountValue: derivedRelatedCount(performer.relatedImagesJson),
    categories: parseTextLabelArray(performer.categoriesJson),
    favorite: performer.favorite,
  };
}

function performerToFormValues(performer: Performer): FormValues {
  const rating = parseRatingObject(performer.ratingJson);
  const thumbnailPaths = parsePerformerThumbnailPathArray(
    performer.performerThumbnailPathsJson,
  );
  return {
    name: performer.name,
    originalName: performer.originalName,
    favorite: performer.favorite,
    debutDate: performer.debutDate,
    retiredDate: performer.retiredDate,
    coverPath: performer.coverPath,
    thumbnail1: thumbnailPaths[0] ?? "",
    thumbnail2: thumbnailPaths[1] ?? "",
    thumbnail3: thumbnailPaths[2] ?? "",
    thumbnail4: thumbnailPaths[3] ?? "",
    birthDate: performer.birthDate,
    birthplace: performer.birthplace,
    nationality: performer.nationality,
    astrologicalSign: deriveAstrologicalSign(performer.birthDate),
    bloodType: performer.bloodType,
    heightCm: performer.heightCm?.toString() ?? "",
    weightKg: performer.weightKg?.toString() ?? "",
    measurements: performer.measurements,
    cupSize: performer.cupSize,
    notes: performer.notes,
    ...Object.fromEntries(
      performerRatingFields.map((field) => [
        field.name,
        rating[field.name] === undefined ? "" : String(rating[field.name]),
      ]),
    ),
  };
}

function formThumbnailPathsJson(values: FormValues) {
  return normalizePerformerThumbnailPathsJson(
    JSON.stringify([
      textValue(values.thumbnail1),
      textValue(values.thumbnail2),
      textValue(values.thumbnail3),
      textValue(values.thumbnail4),
    ]),
  );
}

function formRating(values: FormValues): Record<string, number> {
  return Object.fromEntries(
    performerRatingFields
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

function formatCount(count: number | null) {
  return count === null ? "Not set" : String(count);
}

export function derivePerformerStatus(performer: Pick<Performer, "debutDate" | "retiredDate">) {
  return derivePerformerStatusFromDates(performer.debutDate, performer.retiredDate);
}

export function derivePerformerStatusFromDates(
  debutDate: string,
  retiredDate: string,
): DerivedPerformerStatus {
  if (retiredDate.trim()) {
    return "Retired";
  }

  if (debutDate.trim()) {
    return "Active";
  }

  return "Unknown";
}

function derivedRelatedCount(value: string | null | undefined) {
  return parseRelatedCatalogRecordArray(value).length;
}

function buildRelatedSections(
  sections: DetailSection[],
  relatedVideosJson: string | null | undefined,
  videos: Video[],
  relatedImagesJson: string | null | undefined,
  images: Image[],
): DetailSection[] {
  return sections.map((section) =>
    section.title.includes("Video")
      ? {
          ...section,
          description: "Read-only Related Video links saved on this performer.",
          controls: "performer-related" as const,
          relatedCatalogRecords: buildRelatedVideoItems(relatedVideosJson, videos),
        }
      : section.title.includes("Image")
        ? {
            ...section,
            description: "Read-only Related Image links saved on this performer.",
            controls: "performer-related" as const,
            relatedCatalogRecords: buildRelatedImageItems(relatedImagesJson, images),
          }
        : section,
  );
}

function buildRelatedVideoItems(
  relatedCatalogJson: string | null | undefined,
  videos: Video[],
) {
  const videoById = new Map(videos.map((video) => [video.id, video]));

  return parseRelatedCatalogRecordArray(relatedCatalogJson).map((relation) => {
    const video = relation.recordId ? videoById.get(relation.recordId) : undefined;

    if (video) {
      const title =
        video.title || video.originalTitle || relation.titleSnapshot || "Unresolved Video";
      return {
        title,
        originalTitle:
          video.originalTitle && video.originalTitle !== title
            ? video.originalTitle
            : undefined,
        coverPath: video.coverPath,
        publisherLabel: video.publisherLabel,
        metadata: formatVideoDuration(video.durationMinutes),
        releaseDate: video.releaseDate,
        rating: createRatingSummary(video.ratingJson).average,
        routeTo: `/videos/${video.id}`,
        unresolved: false,
      };
    }

    return {
      title: relation.titleSnapshot || "Unresolved Video",
      unresolved: true,
    };
  });
}

function buildRelatedImageItems(
  relatedCatalogJson: string | null | undefined,
  images: Image[],
) {
  const imageById = new Map(images.map((image) => [image.id, image]));

  return parseRelatedCatalogRecordArray(relatedCatalogJson).map((relation) => {
    const image = relation.recordId ? imageById.get(relation.recordId) : undefined;

    if (image) {
      const title =
        image.title || image.originalTitle || relation.titleSnapshot || "Unresolved Image";
      return {
        title,
        originalTitle:
          image.originalTitle && image.originalTitle !== title
            ? image.originalTitle
            : undefined,
        coverPath: image.coverPath,
        publisherLabel: image.publisherLabel,
        metadata: formatImageCount(image.imageCount),
        releaseDate: image.releaseDate,
        rating: createRatingSummary(image.ratingJson).average,
        routeTo: `/images/${image.id}`,
        unresolved: false,
      };
    }

    return {
      title: relation.titleSnapshot || "Unresolved Image",
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

function formatImageCount(count: number | null) {
  if (!count) {
    return undefined;
  }

  return `${count} ${count === 1 ? "image" : "images"}`;
}

function formatUnit(value: number | null, unit: string) {
  return value === null ? "Not set" : `${value} ${unit}`;
}

function formatYearsActive(performer: Performer) {
  const debutYear = yearFromIsoDate(performer.debutDate);
  const retiredYear = yearFromIsoDate(performer.retiredDate);

  if (!debutYear && !retiredYear) {
    return "Not set";
  }

  const start = debutYear ? String(debutYear) : "Unknown";
  const end = retiredYear ? String(retiredYear) : "Now";
  return `${start} - ${end}`;
}

function formatYearsActiveAges(performer: Performer) {
  const birthYear = yearFromIsoDate(performer.birthDate);
  const debutYear = yearFromIsoDate(performer.debutDate);
  const retiredYear = yearFromIsoDate(performer.retiredDate);

  if (!birthYear || !debutYear) {
    return "Age range not set";
  }

  const endYear = retiredYear ?? new Date().getFullYear();

  if (endYear < debutYear || debutYear < birthYear) {
    return "Age range not set";
  }

  return `(${debutYear - birthYear} - ${endYear - birthYear} y)`;
}

function formatMeasurements(values: FormValues) {
  const measurementValue = textValue(values.measurements).trim();
  if (!measurementValue) {
    return "";
  }

  return normalizeMeasurements(measurementValue) ?? "";
}

function normalizeMeasurements(value: string) {
  const normalizedValue = value
    .toLowerCase()
    .replace(/\bcm\b/g, "")
    .trim();
  const compactMatch = /^(\d{2,3})(\d{2,3})(\d{2,3})$/.exec(normalizedValue);
  const parts = compactMatch
    ? compactMatch.slice(1)
    : normalizedValue
    .split(/[\/\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (
    parts.length !== 3 ||
    parts.some((part) => !/^\d+$/.test(part))
  ) {
    return null;
  }

  return `${Number(parts[0])} / ${Number(parts[1])} / ${Number(parts[2])} cm`;
}

function yearFromIsoDate(value: string) {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  return Number.isInteger(year) ? year : null;
}

function deriveAstrologicalSign(birthDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);

  if (!match) {
    return "Not set";
  }

  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    return "Not set";
  }

  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return "Aries";
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return "Taurus";
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return "Gemini";
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return "Cancer";
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return "Leo";
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return "Virgo";
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return "Libra";
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return "Scorpio";
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return "Sagittarius";
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return "Capricorn";
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return "Aquarius";
  if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return "Pisces";

  return "Not set";
}

