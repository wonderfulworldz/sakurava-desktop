import type { NewPerformer, Performer, PerformerPatch } from "../backend/types";
import { parseRatingObject, parseTextLabelArray, stringifyTextLabelArray } from "../backend/json";
import type { CollectionConfig, PerformerCollectionItem } from "./collectionData";
import { collectionConfigs } from "./collectionData";
import type { PerformerDetailConfig } from "./detailData";
import { formatSystemTimestamp } from "./detailData";
import { detailConfigs } from "./detailData";
import type { FormConfig, FormMode } from "./formData";
import { formConfigs } from "./formData";

type FormValues = Record<string, string | boolean>;

const performerRatingFields = formConfigs.performers.ratingFields;

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
): PerformerDetailConfig {
  const baseConfig = detailConfigs.performers as PerformerDetailConfig;
  const rating = parseRatingObject(performer.ratingJson);
  return {
    ...baseConfig,
    editTo: `/performers/${performer.id}/edit`,
    displayTitle: performer.name,
    originalTitle: performer.originalName,
    favorite: performer.favorite,
    chips: [performer.status || "Unknown"],
    aliases: parseTextLabelArray(performer.aliasesJson),
    categories: parseTextLabelArray(performer.categoriesJson),
    summary: [
      { label: "Years Active", value: "Not tracked in MVP" },
      { label: "Filmography", value: formatCount(performer.filmographyCount) },
      { label: "Pictorials", value: formatCount(performer.pictorialsCount) },
    ],
    metadata: [
      { label: "Birth Date", value: performer.birthDate || "Not set" },
      { label: "Status", value: performer.status || "Unknown" },
      { label: "Cover Path", value: performer.coverPath || "Not set" },
    ],
    systemInfo: [
      { label: "Created in Sakurava", value: formatSystemTimestamp(performer.createdAt) },
      { label: "Last edited", value: formatSystemTimestamp(performer.updatedAt) },
    ],
    personal: [
      { label: "Birth Date", value: performer.birthDate || "Not set" },
      { label: "Birthplace", value: "Not saved in MVP" },
      { label: "Nationality", value: "Not saved in MVP" },
      { label: "Astrological Sign", value: "Not saved in MVP" },
      { label: "Blood Type", value: "Not saved in MVP" },
    ],
    physical: [
      { label: "Height", value: "Not saved in MVP" },
      { label: "Weight", value: "Not saved in MVP" },
      { label: "Measurement", value: "Not saved in MVP" },
      { label: "Cup Size", value: "Not saved in MVP" },
    ],
    rating: performerRatingFields.map((field) => ({
      label: field.label,
      value: numberFromRating(rating[field.name]),
    })),
    notes: performer.notes || "No notes saved.",
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
  };
}

export function performerFormToCreateInput(
  values: FormValues,
  categories: string[],
  aliases: string[],
): NewPerformer {
  return {
    name: textValue(values.name),
    originalName: textValue(values.originalName),
    aliasesJson: stringifyTextLabelArray(aliases),
    favorite: Boolean(values.favorite),
    status: textValue(values.status) as NewPerformer["status"],
    birthDate: textValue(values.birthDate),
    coverPath: textValue(values.coverPath),
    filmographyCount: optionalInteger(values.filmography),
    pictorialsCount: optionalInteger(values.pictorials),
    categoriesJson: stringifyTextLabelArray(categories),
    ratingJson: JSON.stringify(formRating(values)),
    notes: textValue(values.notes),
  };
}

export function performerFormToPatch(
  values: FormValues,
  categories: string[],
  aliases: string[],
): PerformerPatch {
  return performerFormToCreateInput(values, categories, aliases);
}

function toPerformerCollectionItem(
  performer: Performer,
): PerformerCollectionItem {
  return {
    kind: "performers",
    key: performer.id,
    name: performer.name,
    originalName: performer.originalName,
    status: performer.status || "Unknown",
    filmographyCount: `Filmography ${formatCount(performer.filmographyCount)}`,
    pictorialsCount: `Pictorials ${formatCount(performer.pictorialsCount)}`,
    categories: parseTextLabelArray(performer.categoriesJson),
    favorite: performer.favorite,
  };
}

function performerToFormValues(performer: Performer): FormValues {
  const rating = parseRatingObject(performer.ratingJson);
  return {
    name: performer.name,
    originalName: performer.originalName,
    favorite: performer.favorite,
    status: performer.status || "Active",
    coverPath: performer.coverPath,
    thumbnail1: "Not saved in MVP",
    thumbnail2: "Not saved in MVP",
    thumbnail3: "Not saved in MVP",
    thumbnail4: "Not saved in MVP",
    yearsActive: "Not saved in MVP",
    filmography: performer.filmographyCount?.toString() ?? "",
    pictorials: performer.pictorialsCount?.toString() ?? "",
    birthDate: performer.birthDate,
    birthplace: "Not saved in MVP",
    nationality: "Not saved in MVP",
    astrologicalSign: "Not saved in MVP",
    bloodType: "Not saved in MVP",
    height: "Not saved in MVP",
    weight: "Not saved in MVP",
    measurement: "Not saved in MVP",
    cupSize: "Not saved in MVP",
    notes: performer.notes,
    ...Object.fromEntries(
      performerRatingFields.map((field) => [
        field.name,
        rating[field.name] === undefined ? "" : String(rating[field.name]),
      ]),
    ),
  };
}

function formRating(values: FormValues): Record<string, number> {
  return Object.fromEntries(
    performerRatingFields
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

function formatCount(count: number | null) {
  return count === null ? "Not set" : String(count);
}
