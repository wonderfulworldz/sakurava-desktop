import {
  parseGalleryImagePathArray,
  parsePerformerThumbnailPathArray,
  parseRatingObject,
  parseRelatedCatalogRecordArray,
  parseRelatedPerformerArray,
  parseTextLabelArray,
} from "../backend/json";
import type { Image, ManagedCategory, Performer, Video } from "../backend/types";

export type ExportCsvEntity = "videos" | "images" | "performers" | "categories";

type CsvCell = string | number | boolean | null | undefined;

export type CsvInternalField =
  | "bulkAction"
  | "sakuravaRef"
  | "parentCategoryName"
  | "visibility"
  | "categoryNotes"
  | keyof Video
  | keyof Image
  | keyof Performer
  | keyof ManagedCategory
  | `${"ratingJson"}.${string}`
  | `${"galleryImagePathsJson"}.${number}`
  | `${"performerThumbnailPathsJson"}.${number}`;

export type CsvSchemaColumn<TRecord> = {
  header: string;
  internalField: CsvInternalField;
  value: (record: TRecord) => CsvCell;
};

type RatingColumn = {
  header: string;
  key: string;
};

type SakuravaRefPrefix = "VID" | "IMG" | "PER" | "CAT";
type CategoryCsvRecord = ManagedCategory & { parentCategoryName: string };

const BULK_EDIT_ACTION_DEFAULT = "Auto";
const PATH_SLOT_COUNT = 4;

const videoRatingColumns: RatingColumn[] = [
  { header: "Rating - Visual", key: "visual" },
  { header: "Rating - Story", key: "story" },
  { header: "Rating - Performance", key: "performance" },
  { header: "Rating - Chemistry", key: "chemistry" },
  { header: "Rating - Intensity", key: "intensity" },
  { header: "Rating - Rewatch", key: "rewatch" },
];

const imageRatingColumns: RatingColumn[] = [
  { header: "Rating - Visual", key: "visual" },
  { header: "Rating - Posing", key: "posing" },
  { header: "Rating - Atmosphere", key: "atmosphere" },
  { header: "Rating - Flow", key: "flow" },
  { header: "Rating - Memorability", key: "memorability" },
  { header: "Rating - Signature", key: "signature" },
];

const performerRatingColumns: RatingColumn[] = [
  { header: "Rating - Visual", key: "visual" },
  { header: "Rating - Performance", key: "performance" },
  { header: "Rating - Popularity", key: "popularity" },
  { header: "Rating - Versatility", key: "versatility" },
  { header: "Rating - Attraction", key: "attraction" },
  { header: "Rating - Exceptional", key: "exceptional" },
];

export const videoCsvSchema: CsvSchemaColumn<Video>[] = [
  actionColumn(),
  refColumn("VID", "id"),
  textColumn("Code", "code"),
  textColumn("Title", "title"),
  textColumn("Original Title", "originalTitle"),
  dateColumn("Release Date", "releaseDate"),
  textColumn("Publisher / Label", "publisherLabel"),
  textColumn("Censorship", "censorship"),
  listColumn("Categories", "categoriesJson", (record) =>
    parseTextLabelArray(record.categoriesJson),
  ),
  ...ratingColumns<Video>(videoRatingColumns),
  textColumn("Media Path", "mediaPath"),
  textColumn("Cover Path", "coverPath"),
  listColumn("Related Performers", "relatedPerformersJson", (record) =>
    parseRelatedPerformerArray(record.relatedPerformersJson).map((reference) =>
      relatedDisplay("PER", reference.performerId, reference.nameSnapshot),
    ),
  ),
  listColumn("Related Images", "relatedImagesJson", (record) =>
    parseRelatedCatalogRecordArray(record.relatedImagesJson).map((reference) =>
      relatedDisplay("IMG", reference.recordId, reference.titleSnapshot),
    ),
  ),
  textColumn("Notes", "notes"),
];

export const imageCsvSchema: CsvSchemaColumn<Image>[] = [
  actionColumn(),
  refColumn("IMG", "id"),
  textColumn("Code", "code"),
  textColumn("Title", "title"),
  textColumn("Original Title", "originalTitle"),
  dateColumn("Release Date", "releaseDate"),
  textColumn("Publisher / Label", "publisherLabel"),
  textColumn("Censorship", "censorship"),
  listColumn("Categories", "categoriesJson", (record) =>
    parseTextLabelArray(record.categoriesJson),
  ),
  ...ratingColumns<Image>(imageRatingColumns),
  textColumn("Cover Path", "coverPath"),
  textColumn("Gallery Folder Path", "folderPath"),
  ...pathColumns<Image>(
    "Gallery Image",
    "galleryImagePathsJson",
    (record) => parseGalleryImagePathArray(record.galleryImagePathsJson),
  ),
  listColumn("Related Performers", "relatedPerformersJson", (record) =>
    parseRelatedPerformerArray(record.relatedPerformersJson).map((reference) =>
      relatedDisplay("PER", reference.performerId, reference.nameSnapshot),
    ),
  ),
  listColumn("Related Videos", "relatedVideosJson", (record) =>
    parseRelatedCatalogRecordArray(record.relatedVideosJson).map((reference) =>
      relatedDisplay("VID", reference.recordId, reference.titleSnapshot),
    ),
  ),
  textColumn("Notes", "notes"),
];

export const performerCsvSchema: CsvSchemaColumn<Performer>[] = [
  actionColumn(),
  refColumn("PER", "id"),
  textColumn("Name", "name"),
  textColumn("Original Name", "originalName"),
  listColumn("Aliases", "aliasesJson", (record) =>
    parseTextLabelArray(record.aliasesJson),
  ),
  dateColumn("Birth Date", "birthDate"),
  dateColumn("Debut Date", "debutDate"),
  dateColumn("Retired Date", "retiredDate"),
  textColumn("Birthplace", "birthplace"),
  textColumn("Nationality", "nationality"),
  textColumn("Blood Type", "bloodType"),
  textColumn("Height (cm)", "heightCm"),
  textColumn("Weight (kg)", "weightKg"),
  textColumn("Measurements", "measurements"),
  textColumn("Cup Size", "cupSize"),
  listColumn("Categories", "categoriesJson", (record) =>
    parseTextLabelArray(record.categoriesJson),
  ),
  ...ratingColumns<Performer>(performerRatingColumns),
  textColumn("Cover Path", "coverPath"),
  ...pathColumns<Performer>(
    "Mini Thumbnail",
    "performerThumbnailPathsJson",
    (record) =>
      parsePerformerThumbnailPathArray(record.performerThumbnailPathsJson),
  ),
  listColumn("Related Videos", "relatedVideosJson", (record) =>
    parseRelatedCatalogRecordArray(record.relatedVideosJson).map((reference) =>
      relatedDisplay("VID", reference.recordId, reference.titleSnapshot),
    ),
  ),
  listColumn("Related Images", "relatedImagesJson", (record) =>
    parseRelatedCatalogRecordArray(record.relatedImagesJson).map((reference) =>
      relatedDisplay("IMG", reference.recordId, reference.titleSnapshot),
    ),
  ),
  textColumn("Notes", "notes"),
];

export const categoryCsvSchema: CsvSchemaColumn<CategoryCsvRecord>[] = [
  actionColumn(),
  refColumn("CAT", "key"),
  {
    header: "Parent Category",
    internalField: "parentCategoryName",
    value: (record) => record.parentCategoryName,
  },
  textColumn("Category Name", "name"),
  textColumn("Description", "description"),
  textColumn("Thumbnail Path", "thumbnailPath"),
  textColumn("Show in Videos", "showInVideos"),
  textColumn("Show in Images", "showInImages"),
  textColumn("Show in Performers", "showInPerformers"),
  {
    header: "Visibility",
    internalField: "visibility",
    value: () => "",
  },
  {
    header: "Notes",
    internalField: "notes",
    value: () => "",
  },
];

export function escapeCsvValue(value: CsvCell) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function buildCsv<TRecord>(
  columns: CsvSchemaColumn<TRecord>[],
  records: TRecord[],
) {
  return [
    columns.map((column) => escapeCsvValue(column.header)).join(","),
    ...records.map((record) =>
      columns.map((column) => escapeCsvValue(column.value(record))).join(","),
    ),
  ].join("\r\n");
}

export function buildVideosCsv(videos: Video[]) {
  return buildCsv(videoCsvSchema, videos);
}

export function buildImagesCsv(images: Image[]) {
  return buildCsv(imageCsvSchema, images);
}

export function buildPerformersCsv(performers: Performer[]) {
  return buildCsv(performerCsvSchema, performers);
}

export function buildCategoriesCsv(categories: ManagedCategory[]) {
  const categoryNameByKey = new Map(
    categories.map((category) => [category.key, category.name]),
  );
  const rows = categories.map((category) => ({
    ...category,
    parentCategoryName: category.parentKey
      ? (categoryNameByKey.get(category.parentKey) ?? "")
      : "",
  }));

  return buildCsv(categoryCsvSchema, rows);
}

export function buildEntityCsv(entity: ExportCsvEntity, records: unknown[]) {
  if (entity === "videos") {
    return buildVideosCsv(records as Video[]);
  }

  if (entity === "images") {
    return buildImagesCsv(records as Image[]);
  }

  if (entity === "performers") {
    return buildPerformersCsv(records as Performer[]);
  }

  return buildCategoriesCsv(records as ManagedCategory[]);
}

export function exportEntityLabel(entity: ExportCsvEntity) {
  if (entity === "videos") {
    return "Videos";
  }

  if (entity === "images") {
    return "Images";
  }

  if (entity === "performers") {
    return "Performers";
  }

  return "Categories";
}

export function sakuravaRef(prefix: SakuravaRefPrefix, sourceId: string) {
  const normalized = sourceId.trim();
  if (!normalized) {
    return "";
  }

  return `${prefix}-${stableRefToken(normalized)}`;
}

function actionColumn<TRecord>(): CsvSchemaColumn<TRecord> {
  return {
    header: "Action",
    internalField: "bulkAction",
    value: () => BULK_EDIT_ACTION_DEFAULT,
  };
}

function refColumn<TRecord>(
  prefix: SakuravaRefPrefix,
  sourceField: keyof TRecord & string,
): CsvSchemaColumn<TRecord> {
  return {
    header: "Sakurava Ref",
    internalField: "sakuravaRef",
    value: (record) =>
      sakuravaRef(
        prefix,
        String((record as Record<string, CsvCell>)[sourceField] ?? ""),
      ),
  };
}

function textColumn<TRecord>(
  header: string,
  internalField: CsvInternalField,
): CsvSchemaColumn<TRecord> {
  return {
    header,
    internalField,
    value: (record) => (record as Record<string, CsvCell>)[internalField],
  };
}

function dateColumn<TRecord>(
  header: string,
  internalField: CsvInternalField,
): CsvSchemaColumn<TRecord> {
  return {
    header,
    internalField,
    value: (record) =>
      normalizeDateOnlyForCsv(
        (record as Record<string, CsvCell>)[internalField],
      ),
  };
}

function listColumn<TRecord>(
  header: string,
  internalField: CsvInternalField,
  getValues: (record: TRecord) => string[],
): CsvSchemaColumn<TRecord> {
  return {
    header,
    internalField,
    value: (record) => joinReadableList(getValues(record)),
  };
}

function ratingColumns<TRecord>(
  columns: RatingColumn[],
): CsvSchemaColumn<TRecord>[] {
  return columns.map((column) => ({
    header: column.header,
    internalField: `ratingJson.${column.key}`,
    value: (record) =>
      ratingCellValue(
        parseRatingObject((record as { ratingJson?: string }).ratingJson),
        column.key,
      ),
  }));
}

function pathColumns<TRecord>(
  headerPrefix: string,
  internalFieldPrefix:
    | "galleryImagePathsJson"
    | "performerThumbnailPathsJson",
  getValues: (record: TRecord) => string[],
) {
  return Array.from({ length: PATH_SLOT_COUNT }, (_, index) => ({
    header: `${headerPrefix} ${index + 1}`,
    internalField: `${internalFieldPrefix}.${index + 1}` as CsvInternalField,
    value: (record: TRecord) => getValues(record)[index] ?? "",
  }));
}

function ratingCellValue(rating: Record<string, unknown>, key: string) {
  const value = rating[key];
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  return "";
}

function relatedDisplay(
  prefix: SakuravaRefPrefix,
  sourceId: string,
  displayText: string,
) {
  const display = displayText.trim();
  const ref = sakuravaRef(prefix, sourceId);

  if (ref && display) {
    return `${ref} | ${display}`;
  }

  return display;
}

function joinReadableList(values: string[]) {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .join("; ");
}

function stableRefToken(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(-7);
}

export function normalizeDateOnlyForCsv(value: CsvCell) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value).trim();
  if (!text) {
    return "";
  }

  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (ymd && isValidDateParts(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]))) {
    return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  }

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = Number(slash[3]);
    if (isValidDateParts(year, month, day)) {
      return [
        String(year).padStart(4, "0"),
        String(month).padStart(2, "0"),
        String(day).padStart(2, "0"),
      ].join("-");
    }
  }

  return text;
}

function isValidDateParts(year: number, month: number, day: number) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}
