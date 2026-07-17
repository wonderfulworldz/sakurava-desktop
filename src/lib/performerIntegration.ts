import type {
  Credit,
  Image,
  ManagedCategory,
  NewPerformer,
  Performer,
  PerformerPatch,
  Video,
} from "../backend/types";
import {
  normalizePerformerThumbnailPathsJson,
  parsePerformerThumbnailPathArray,
  parseRatingObject,
  parseRelatedCatalogRecordArray,
  parseSourceLinkArray,
  parseTextLabelArray,
  normalizeRelatedCatalogRecordsJson,
  stringifySourceLinkArray,
  stringifyTextLabelArray,
} from "../backend/json";
import type {
  RelatedCatalogRecordFormValue,
  SourceLinkFormValue,
} from "./formData";
import type { CollectionConfig, PerformerCollectionItem } from "./collectionData";
import { collectionConfigs } from "./collectionData";
import { deriveDebutYear } from "./catalogDerivedFields";
import type { DetailSection, PerformerDetailConfig } from "./detailData";
import {
  DETAIL_EMPTY_VALUE,
  formatSystemTimestamp,
  sourceLinksFromRecord,
} from "./detailData";
import { detailConfigs } from "./detailData";
import type { FormConfig, FormMode } from "./formData";
import { formConfigs } from "./formData";
import { createRatingSummary, getDetailRatingDimensions } from "./ratingSummary";
import { MANAGED_CATEGORIES_STORAGE_KEY } from "./managedCategories";
import { mergeKnownNames } from "./performerKnownNames";
import { formatSakuravaRef } from "./sakuravaRef";
import { sakuravaRef as legacySakuravaRef } from "./exportCsv";

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
  managedCategories: ManagedCategory[] = readStoredManagedCategoryRecords(),
  credits: Credit[] = [],
): PerformerDetailConfig {
  const baseConfig = detailConfigs.performers as PerformerDetailConfig;
  const thumbnailPaths = parsePerformerThumbnailPathArray(
    performer.performerThumbnailPathsJson,
  );
  const derivedStatus = derivePerformerStatus(performer);
  const filmographyCount =
    credits.length > 0
      ? new Set(
          credits
            .filter((credit) => credit.workType === "video")
            .map((credit) => credit.workId),
        ).size
      : derivedRelatedCount(performer.relatedVideosJson);
  const pictorialsCount =
    credits.length > 0
      ? new Set(
          credits
            .filter((credit) => credit.workType === "image")
            .map((credit) => credit.workId),
        ).size
      : derivedRelatedCount(performer.relatedImagesJson);
  const performerCategories = parseTextLabelArray(performer.categoriesJson);
  const taxonomy = derivePerformerTaxonomyValues(
    performerCategories,
    managedCategories,
  );
  const genderValue = detailText(performer.gender);
  return {
    ...baseConfig,
    recordId: performer.sakuravaRef ?? performer.id,
    editTo: `/performers/${performer.sakuravaRef ?? performer.id}/edit`,
    coverPath: performer.coverPath,
    displayTitle: performer.name,
    originalTitle: performer.originalName,
    favorite: performer.favorite,
    chips: [derivedStatus],
    aliases: mergeKnownNames(
      parseTextLabelArray(performer.aliasesJson),
      credits,
    ),
    thumbnailPaths,
    categories: performerCategories,
    gender: { label: "Gender", value: genderValue },
    bodyType: {
      label: "Body Type",
      value: taxonomy.bodyType ?? DETAIL_EMPTY_VALUE,
    },
    summary: [
      {
        label: "Years Active",
        value: formatYearsActive(performer),
        secondaryValue: formatYearsActiveAges(performer),
      },
      { label: "Filmography", value: String(filmographyCount) },
      { label: "Pictorials", value: String(pictorialsCount) },
    ],
    metadata: [],
    mediaPaths: [{ label: "Profile image status", path: performer.coverPath }],
    techItems: Array.from({ length: 4 }, (_, index) => ({
      label: `Performer Thumbnail ${index + 1}`,
      value: thumbnailPaths[index] ? "Saved" : DETAIL_EMPTY_VALUE,
    })),
    techMessage: "",
    systemInfo: [
      { label: "Sakurava Ref", value: formatSakuravaRef(performer.sakuravaRef ?? "") },
      { label: "Created in Sakurava", value: formatSystemTimestamp(performer.createdAt) },
      { label: "Last edited", value: formatSystemTimestamp(performer.updatedAt) },
    ],
    personal: [
      { label: "Gender", value: genderValue },
      { label: "Birth Date", value: detailText(performer.birthDate) },
      { label: "Birthplace", value: detailText(performer.birthplace) },
      { label: "Nationality", value: detailText(performer.nationality) },
      { label: "Zodiac", value: deriveAstrologicalSign(performer.birthDate) },
      { label: "Debut Date", value: detailText(performer.debutDate) },
      { label: "Retired Date", value: detailText(performer.retiredDate) },
    ],
    physical: [
      { label: "Height", value: formatUnit(performer.heightCm, "cm") },
      { label: "Weight", value: formatUnit(performer.weightKg, "kg") },
      { label: "Measurement", value: detailText(performer.measurements) },
      { label: "Cup Size", value: detailText(performer.cupSize) },
      { label: "Blood Type", value: detailText(performer.bloodType) },
    ],
    rating: getDetailRatingDimensions(performer.ratingJson, performerRatingFields),
    notes: detailNotes(performer.notes),
    sourceLinks: sourceLinksFromRecord(performer),
    relatedSections: buildRelatedSections(
      baseConfig.relatedSections,
      performer.relatedVideosJson,
      videos,
      performer.relatedImagesJson,
      images,
      credits,
      managedCategories,
    ),
  };
}

function derivePerformerTaxonomyValues(
  performerCategories: string[],
  managedCategories: ManagedCategory[],
) {
  const categoryByKey = new Map(
    managedCategories.map((category) => [category.key, category]),
  );
  const performerCategoryKeys = new Set(
    performerCategories.map((category) => category.trim().toLowerCase()),
  );
  const values = {
    bodyType: null as string | null,
  };

  for (const category of managedCategories) {
    if (!category.parentKey || !performerCategoryKeys.has(category.name.trim().toLowerCase())) {
      continue;
    }

    const parent = categoryByKey.get(category.parentKey);
    const parentKey = normalizeTaxonomyParentName(parent?.name ?? "");
    if (parentKey === "bodyType" && !values.bodyType) {
      values.bodyType = category.name;
    }
  }

  return values;
}

function normalizeTaxonomyParentName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "bodytype" ||
    normalized === "body type" ||
    normalized === "body-type" ||
    normalized === "body_type"
  ) {
    return "bodyType";
  }

  return "";
}

function readStoredManagedCategoryRecords(): ManagedCategory[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(MANAGED_CATEGORIES_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isManagedCategoryRecord);
  } catch {
    return [];
  }
}

function isManagedCategoryRecord(value: unknown): value is ManagedCategory {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<ManagedCategory>;
  return (
    typeof record.key === "string" &&
    typeof record.name === "string" &&
    (typeof record.parentKey === "string" || record.parentKey === null)
  );
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
    editCancelTo: `/performers/${performer.sakuravaRef ?? performer.id}`,
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
    initialSourceLinks: {
      create: formConfigs.performers.initialSourceLinks?.create ?? [],
      edit: formConfigs.performers.initialSourceLinks?.edit ?? [],
      [mode]: parseSourceLinkArray(performer.sourceLinksJson),
    },
  };
}

export function performerFormToCreateInput(
  values: FormValues,
  categories: string[],
  aliases: string[],
  relatedVideos: RelatedCatalogRecordFormValue[] = [],
  relatedImages: RelatedCatalogRecordFormValue[] = [],
  sourceLinks: SourceLinkFormValue[] = [],
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
    gender: textValue(values.gender),
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
    sourceLinksJson: stringifySourceLinkArray(sourceLinks),
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
  sourceLinks: SourceLinkFormValue[] = [],
): PerformerPatch {
  return performerFormToCreateInput(
    values,
    categories,
    aliases,
    relatedVideos,
    relatedImages,
    sourceLinks,
  );
}

function toPerformerCollectionItem(
  performer: Performer,
): PerformerCollectionItem {
  const ratingSummary = createRatingSummary(performer.ratingJson, performerRatingFields);

  return {
    kind: "performers",
    key: performer.sakuravaRef ?? performer.id,
    sakuravaRef: performer.sakuravaRef,
    identityAliases: [performer.id, legacySakuravaRef("PER", performer.id)],
    name: performer.name,
    originalName: performer.originalName,
    aliases: formatAliases(performer.aliasesJson),
    yearsActive: formatYearsActive(performer),
    activeAges: formatYearsActiveAges(performer),
    coverPath: performer.coverPath,
    createdAt: performer.createdAt,
    updatedAt: performer.updatedAt,
    status: derivePerformerStatus(performer),
    gender: performer.gender ?? "",
    birthDate: performer.birthDate,
    nationality: performer.nationality,
    heightCm: performer.heightCm,
    cupSize: performer.cupSize,
    debutYear: deriveDebutYear(performer),
    ratingAverage: ratingSummary.average,
    ratingBucket: ratingSummary.bucket,
    filmographyCount: `Filmography ${derivedRelatedCount(performer.relatedVideosJson)}`,
    filmographyCountValue: derivedRelatedCount(performer.relatedVideosJson),
    pictorialsCount: `Pictorials ${derivedRelatedCount(performer.relatedImagesJson)}`,
    pictorialsCountValue: derivedRelatedCount(performer.relatedImagesJson),
    categories: parseTextLabelArray(performer.categoriesJson),
    favorite: performer.favorite,
  };
}

function formatAliases(value: string | null | undefined) {
  const aliases = parseTextLabelArray(value)
    .map((alias) => alias.trim())
    .filter(Boolean);

  return aliases.length > 0 ? aliases.join(", ") : "No aliases";
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
    gender: performer.gender ?? "",
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
        formatFormRatingValue(rating[field.name]),
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
  credits: Credit[],
  managedCategories: ManagedCategory[],
): DetailSection[] {
  if (credits.length > 0) {
    const categoryByKey = new Map(
      managedCategories.map((category) => [category.key, category.name]),
    );
    return sections.map((section) => {
      const workType = section.title.includes("Video") ? "video" : "image";
      const recordsByWorkId = new Map<
        string,
        NonNullable<DetailSection["relatedCatalogRecords"]>[number]
      >();
      credits
        .filter((credit) => credit.workType === workType)
        .forEach((credit) => {
          const baseItem =
            workType === "video"
              ? buildRelatedVideoItems(
                  JSON.stringify([{ recordId: credit.workId, titleSnapshot: "" }]),
                  videos,
                )[0]
              : buildRelatedImageItems(
                  JSON.stringify([{ recordId: credit.workId, titleSnapshot: "" }]),
                  images,
                )[0];
          const roleName =
            credit.characterMode === "self"
              ? "Self"
              : credit.characterName.trim() || undefined;
          const creditTypeKey =
            credit.creditTypeCategoryId || credit.roleImportanceCategoryId;

          if (!baseItem || recordsByWorkId.has(credit.workId)) {
            return;
          }
          recordsByWorkId.set(credit.workId, {
            ...baseItem,
            roleName,
            creditType: creditTypeKey
              ? categoryByKey.get(creditTypeKey)?.trim() || creditTypeKey
              : undefined,
          });
        });
      const records = [...recordsByWorkId.values()];

      return {
        ...section,
        controls: "performer-related" as const,
        relatedCatalogRecords: records,
      };
    });
  }

  return sections.map((section) =>
    section.title.includes("Video")
      ? {
          ...section,
          controls: "performer-related" as const,
          relatedCatalogRecords: buildRelatedVideoItems(relatedVideosJson, videos),
        }
      : section.title.includes("Image")
        ? {
            ...section,
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
        availability: video.availability,
        censorship: video.censorship,
        code: video.code || "No code",
        publisherLabel: video.publisherLabel,
        metadata: formatVideoDuration(video.durationMinutes),
        releaseDate: video.releaseDate,
        rating: createRatingSummary(video.ratingJson).average,
        favorite: video.favorite,
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
        availability: image.availability,
        censorship: image.censorship,
        code: image.code || "No code",
        publisherLabel: image.publisherLabel,
        metadata: formatImageCount(image.imageCount),
        releaseDate: image.releaseDate,
        rating: createRatingSummary(image.ratingJson).average,
        favorite: image.favorite,
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
  return value === null ? DETAIL_EMPTY_VALUE : `${value} ${unit}`;
}

function formatYearsActive(performer: Performer) {
  const debutYear = yearFromIsoDate(performer.debutDate);
  const retiredYear = yearFromIsoDate(performer.retiredDate);

  if (!debutYear && !retiredYear) {
    return DETAIL_EMPTY_VALUE;
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
    return DETAIL_EMPTY_VALUE;
  }

  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    return DETAIL_EMPTY_VALUE;
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

  return DETAIL_EMPTY_VALUE;
}

function detailText(value: string | null | undefined) {
  return value?.trim() || DETAIL_EMPTY_VALUE;
}

function detailNotes(value: string | null | undefined) {
  return value?.trim() || "No notes saved.";
}

