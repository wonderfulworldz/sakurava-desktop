import {
  parseGalleryImagePathArray,
  parsePerformerThumbnailPathArray,
  parseRatingObject,
  parseRelatedCatalogRecordArray,
  parseRelatedPerformerArray,
  parseSourceLinkArray,
  parseTextLabelArray,
} from "../backend/json";
import type {
  Credit,
  GlossaryEntry,
  Image,
  ManagedCategory,
  Performer,
  Video,
} from "../backend/types";
import {
  canonicalSakuravaRef,
  formatSakuravaRef,
  legacySakuravaRef,
  recordMatchesSakuravaIdentity,
  sectionCodeForLegacyPrefix,
} from "./sakuravaRef";

export type ExportCsvEntity =
  | "videos"
  | "images"
  | "performers"
  | "categories"
  | "glossary"
  | "credits";
export type ExportFormat = "csv" | "xlsx";
export type ExportValueType =
  | "text"
  | "date"
  | "date-time"
  | "number"
  | "boolean"
  | "identifier"
  | "list/reference";

// Public exports must use the locked current vocabulary. `Create` is accepted
// only as an internal compatibility input; `Skip` is deliberately not emitted.
export const EXPORT_ACTIONS = ["Auto", "Add", "Update", "Delete"] as const;
export const EXPORT_EXAMPLE_SENTINEL = "__SKV_EXAMPLE_ONLY__";

export type CsvCell = string | number | boolean | Date | null | undefined;

export type CsvInternalField =
  | "bulkAction"
  | "sakuravaRef"
  | "importRef"
  | "importResolution"
  | "parentCategoryName"
  | "parentCategoryRef"
  | "visibility"
  | "categoryNotes"
  | keyof Video
  | keyof Image
  | keyof Performer
  | keyof ManagedCategory
  | keyof GlossaryEntry
  | keyof Credit
  | "workRef"
  | "performerRef"
  | "roleImportanceRef"
  | `${"ratingJson"}.${string}`
  | `${"galleryImagePathsJson"}.${number}`
  | `${"performerThumbnailPathsJson"}.${number}`;

export type CsvSchemaColumn<TRecord> = {
  key: string;
  header: string;
  internalField: CsvInternalField;
  required: boolean;
  editable: boolean;
  clearable: boolean;
  valueType: ExportValueType;
  value: (record: TRecord) => CsvCell;
  example?: CsvCell;
  allowedValues?: readonly string[];
  multiline?: boolean;
};

export type ExportSerializationOptions = {
  locale?: string;
  safeExport?: boolean;
};

type RatingColumn = {
  header: string;
  key: string;
};

type SakuravaRefPrefix = "VID" | "IMG" | "PER" | "CAT" | "GLO" | "R";
type CategoryCsvRecord = ManagedCategory & {
  parentCategoryName: string;
  parentCategoryRef: string;
};
export type CreditCsvRecord = Omit<Credit, "workType" | "creditedAsMode" | "characterMode"> & {
  workType: "Video" | "Image";
  creditedAsMode: "Auto" | "Custom";
  characterMode: "Text" | "Self";
  workRef?: string;
  performerRef?: string;
  roleImportanceRef?: string;
};

const BULK_EDIT_ACTION_DEFAULT = "Auto";
const PATH_SLOT_COUNT = 4;

const videoRatingColumns: RatingColumn[] = [
  { header: "Rating - Rewatch", key: "rewatch" },
  { header: "Rating - Performance", key: "performance" },
  { header: "Rating - Visual", key: "visual" },
  { header: "Rating - Intensity", key: "intensity" },
  { header: "Rating - Story", key: "story" },
  { header: "Rating - Chemistry", key: "chemistry" },
];

const imageRatingColumns: RatingColumn[] = [
  { header: "Rating - Memorability", key: "memorability" },
  { header: "Rating - Visual", key: "visual" },
  { header: "Rating - Posing", key: "posing" },
  { header: "Rating - Atmosphere", key: "atmosphere" },
  { header: "Rating - Flow", key: "flow" },
  { header: "Rating - Signature", key: "signature" },
];

const performerRatingColumns: RatingColumn[] = [
  { header: "Rating - Attraction", key: "attraction" },
  { header: "Rating - Visual", key: "visual" },
  { header: "Rating - Performance", key: "performance" },
  { header: "Rating - Popularity", key: "popularity" },
  { header: "Rating - Exceptional", key: "exceptional" },
  { header: "Rating - Versatility", key: "versatility" },
];

export const videoCsvSchema: CsvSchemaColumn<Video>[] = [
  actionColumn(),
  refColumn("VID", "id"),
  textColumn("Title", "title"),
  textColumn("Original Title", "originalTitle"),
  textColumn("Code", "code"),
  listColumn("Categories", "categoriesJson", (record) =>
    parseTextLabelArray(record.categoriesJson),
  ),
  booleanColumn("R+", "rPlus"),
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
  booleanColumn("Favorite", "favorite"),
  enumColumn("Availability", "availability", ["Owned", "Not Owned", "Missing"]),
  enumColumn("Censorship", "censorship", ["Censored", "Uncensored", "Reduced", "Reduced / Reduced Mosaic", "Leaked", "Unknown"]),
  dateColumn("Release Date", "releaseDate"),
  textColumn("Publisher / Label", "publisherLabel"),
  numberColumn("Duration (minutes)", "durationMinutes"),
  textColumn("Resolution", "resolution"),
  numberColumn("File Size (bytes)", "fileSizeBytes"),
  textColumn("File Type", "fileType"),
  sourceLinksColumn<Video>(),
  ...ratingColumns<Video>(videoRatingColumns),
  multilineTextColumn("Notes", "notes"),
];

export const imageCsvSchema: CsvSchemaColumn<Image>[] = [
  actionColumn(),
  refColumn("IMG", "id"),
  textColumn("Title", "title"),
  textColumn("Original Title", "originalTitle"),
  textColumn("Code", "code"),
  listColumn("Categories", "categoriesJson", (record) =>
    parseTextLabelArray(record.categoriesJson),
  ),
  booleanColumn("R+", "rPlus"),
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
  booleanColumn("Favorite", "favorite"),
  enumColumn("Availability", "availability", ["Owned", "Not Owned", "Missing"]),
  enumColumn("Censorship", "censorship", ["Censored", "Uncensored", "Reduced", "Reduced / Reduced Mosaic", "Leaked", "Unknown"]),
  dateColumn("Release Date", "releaseDate"),
  textColumn("Publisher / Label", "publisherLabel"),
  numberColumn("Image Count", "imageCount"),
  textColumn("Main Resolution", "mainResolution"),
  numberColumn("Total File Size (bytes)", "totalFileSizeBytes"),
  textColumn("Main File Type", "mainFileType"),
  sourceLinksColumn<Image>(),
  ...ratingColumns<Image>(imageRatingColumns),
  multilineTextColumn("Notes", "notes"),
];

export const performerCsvSchema: CsvSchemaColumn<Performer>[] = [
  actionColumn(),
  refColumn("PER", "id"),
  textColumn("Name", "name"),
  textColumn("Original Name", "originalName"),
  listColumn("Aliases", "aliasesJson", (record) =>
    parseTextLabelArray(record.aliasesJson),
  ),
  listColumn("Categories", "categoriesJson", (record) =>
    parseTextLabelArray(record.categoriesJson),
  ),
  booleanColumn("R+", "rPlus"),
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
  booleanColumn("Favorite", "favorite"),
  textColumn("Gender", "gender"),
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
  sourceLinksColumn<Performer>(),
  ...ratingColumns<Performer>(performerRatingColumns),
  multilineTextColumn("Notes", "notes"),
];

export const categoryCsvSchema: CsvSchemaColumn<CategoryCsvRecord>[] = [
  actionColumn(),
  refColumn("CAT", "key"),
  textColumn("Category Name", "name"),
  {
    key: "parentCategoryRef",
    header: "Parent Ref",
    internalField: "parentCategoryRef",
    required: false,
    editable: true,
    clearable: true,
    valueType: "list/reference",
    value: (record) => record.parentCategoryRef,
    example: "CAT-EXAMPLE-PARENT",
  },
  multilineTextColumn("Description", "description"),
  booleanColumn("R+", "rPlus"),
  booleanColumn("Show in Videos", "showInVideos"),
  booleanColumn("Show in Images", "showInImages"),
  booleanColumn("Show in Performers", "showInPerformers"),
  booleanColumn("Show in Credits", "showInCredits"),
];

export const glossaryCsvSchema: CsvSchemaColumn<GlossaryEntry>[] = [
  actionColumn(),
  refColumn("GLO", "id"),
  textColumn("Term", "term"),
  textColumn("Definition", "definition"),
  {
    key: "parentId",
    header: "Parent Ref",
    internalField: "parentId",
    required: false,
    editable: true,
    clearable: true,
    valueType: "list/reference",
    value: (record) => record.parentId ? sakuravaRef("GLO", record.parentId) : "",
  },
  listColumn("Synonyms", "synonymsJson", (record) =>
    parseTextLabelArray(record.synonymsJson),
  ),
  textColumn("Category", "category"),
  booleanColumn("R+", "rPlus"),
  booleanColumn("Favorite", "favorite"),
  textColumn("Source Title", "sourceTitle"),
  textColumn("Source URL", "sourceUrl"),
];

/**
 * Public Credits spreadsheet contract.  Relationship columns deliberately
 * hold public Ref values; technical ids remain internal to the runtime.
 */
export const creditCsvSchema: CsvSchemaColumn<CreditCsvRecord>[] = [
  actionColumn(),
  refColumn("R", "id"),
  enumColumn("Work Type", "workType", ["Video", "Image"]),
  referenceColumn("Work Ref", "workRef", true),
  referenceColumn("Performer Ref", "performerRef", true),
  textColumn("Character / Role", "characterName"),
  textColumn("Original Character", "characterOriginalName"),
  enumColumn("Credited As Mode", "creditedAsMode", ["Auto", "Custom"]),
  textColumn("Credited As", "creditedAs"),
  textColumn("Credit Type", "creditTypeText"),
  referenceColumn("Role Importance", "roleImportanceRef", false),
  enumColumn("Character Mode", "characterMode", ["Text", "Self"]),
  numberColumn("Billing Order", "billingOrder"),
  multilineTextColumn("Note", "note"),
];

const legacyImportColumns: Record<ExportCsvEntity, CsvSchemaColumn<any>[]> = {
  videos: [
    listColumn<Video>("Glossary Refs", "glossaryRefsJson", (record) =>
      parseTextLabelArray(record.glossaryRefsJson ?? "[]"),
    ),
    textColumn<Video>("Media Path", "mediaPath"),
    textColumn<Video>("Cover Path", "coverPath"),
  ],
  images: [
    listColumn<Image>("Glossary Refs", "glossaryRefsJson", (record) =>
      parseTextLabelArray(record.glossaryRefsJson ?? "[]"),
    ),
    textColumn<Image>("Cover Path", "coverPath"),
    textColumn<Image>("Gallery Folder Path", "folderPath"),
    ...pathColumns<Image>("Gallery Image", "galleryImagePathsJson", (record) =>
      parseGalleryImagePathArray(record.galleryImagePathsJson)),
  ],
  performers: [
    listColumn<Performer>("Glossary Refs", "glossaryRefsJson", (record) =>
      parseTextLabelArray(record.glossaryRefsJson ?? "[]"),
    ),
    textColumn<Performer>("Cover Path", "coverPath"),
    ...pathColumns<Performer>("Mini Thumbnail", "performerThumbnailPathsJson", (record) =>
      parsePerformerThumbnailPathArray(record.performerThumbnailPathsJson)),
  ],
  categories: [
    textColumn<CategoryCsvRecord>("Thumbnail Path", "thumbnailPath"),
    {
      key: "legacy.parentCategoryName",
      header: "Parent Category",
      internalField: "parentCategoryName",
      required: false,
      editable: true,
      clearable: true,
      valueType: "list/reference",
      value: (record) => record.parentCategoryName,
    },
    compatibilityPlaceholderColumn("Visibility", "visibility"),
    compatibilityPlaceholderColumn("Notes", "categoryNotes"),
  ],
  glossary: [textColumn<GlossaryEntry>("Thumbnail Path", "thumbnailPath")],
  credits: [],
};

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
  options: ExportSerializationOptions = {},
  exampleRow?: CsvCell[],
) {
  const rows = records.length > 0
    ? records.map((record) =>
        columns.map((column) => escapeCsvValue(
          serializeExportCell(column.value(record), column.valueType, options),
        )).join(","),
      )
    : exampleRow
      ? [exampleRow.map((value) => escapeCsvValue(value)).join(",")]
      : [];
  return [
    columns.map((column) => escapeCsvValue(column.header)).join(","),
    ...rows,
  ].join("\r\n");
}

export function exportExampleRowValues(schema: CsvSchemaColumn<any>[]): CsvCell[] {
  return schema.map((column) => {
    if (column.key === "action") return EXPORT_EXAMPLE_SENTINEL;
    if (column.valueType === "identifier") return "";
    if (column.valueType === "date") return "2026-01-02";
    if (column.valueType === "date-time") return "2026-01-02 09:30";
    if (column.valueType === "number") return 0;
    if (column.valueType === "boolean") return false;
    if (column.allowedValues?.length) return column.allowedValues[0];
    return column.required ? `Example ${column.header}` : (column.example ?? "");
  });
}

export function isExportExampleRow(headers: string[], row: string[]) {
  const actionIndex = headers.indexOf("Action");
  return actionIndex >= 0 && row[actionIndex]?.trim() === EXPORT_EXAMPLE_SENTINEL;
}

function buildExportCsv<TRecord>(
  columns: CsvSchemaColumn<TRecord>[],
  records: TRecord[],
  options?: ExportSerializationOptions,
) {
  return buildCsv(columns, records, options, records.length === 0 ? exportExampleRowValues(columns) : undefined);
}

export function buildVideosCsv(videos: Video[], options?: ExportSerializationOptions) {
  return buildExportCsv(exportSchemaFor("videos", options), videos, options);
}

export function buildImagesCsv(images: Image[], options?: ExportSerializationOptions) {
  return buildExportCsv(exportSchemaFor("images", options), images, options);
}

export function buildPerformersCsv(performers: Performer[], options?: ExportSerializationOptions) {
  return buildExportCsv(exportSchemaFor("performers", options), performers, options);
}

export function buildCategoriesCsv(
  categories: ManagedCategory[],
  options?: ExportSerializationOptions,
) {
  const categoryNameByKey = new Map(
    categories.map((category) => [category.key, category.name]),
  );
  const categoryRefByKey = new Map(
    categories.map((category) => [category.key, category.sakuravaRef ?? category.key]),
  );
  const rows = categories.map((category) => ({
    ...category,
    parentCategoryName: category.parentKey
      ? (categoryNameByKey.get(category.parentKey) ?? "")
      : "",
    parentCategoryRef: category.parentKey
      ? sakuravaRef("CAT", categoryRefByKey.get(category.parentKey) ?? category.parentKey)
      : "",
  }));

  return buildExportCsv(exportSchemaFor("categories", options), rows, options);
}

export function buildGlossaryCsv(
  entries: GlossaryEntry[],
  options?: ExportSerializationOptions,
) {
  const refById = new Map(entries.map((entry) => [entry.id, entry.sakuravaRef ?? entry.id]));
  const rows = entries.map((entry) => ({
    ...entry,
    parentId: entry.parentId ? (refById.get(entry.parentId) ?? entry.parentId) : "",
  }));
  return buildExportCsv(exportSchemaFor("glossary", options), rows, options);
}

export function buildCreditsCsv(
  credits: CreditCsvRecord[],
  options?: ExportSerializationOptions,
) {
  const rows = exportRowsFor("credits", credits) as CreditCsvRecord[];
  return buildExportCsv(creditCsvSchema, rows, options);
}

export function buildEntityCsv(
  entity: ExportCsvEntity,
  records: unknown[],
  options?: ExportSerializationOptions,
) {
  if (entity === "videos") {
    return buildVideosCsv(records as Video[], options);
  }

  if (entity === "images") {
    return buildImagesCsv(records as Image[], options);
  }

  if (entity === "performers") {
    return buildPerformersCsv(records as Performer[], options);
  }

  if (entity === "glossary") {
    return buildGlossaryCsv(records as GlossaryEntry[], options);
  }

  if (entity === "credits") {
    return buildCreditsCsv(records as CreditCsvRecord[], options);
  }

  return buildCategoriesCsv(records as ManagedCategory[], options);
}

export function exportSchemaFor(
  entity: ExportCsvEntity,
  options: Pick<ExportSerializationOptions, "safeExport"> = {},
): CsvSchemaColumn<any>[] {
  const schema = entity === "videos"
    ? videoCsvSchema
    : entity === "images"
      ? imageCsvSchema
      : entity === "performers"
        ? performerCsvSchema
        : entity === "glossary"
          ? glossaryCsvSchema
          : entity === "credits"
            ? creditCsvSchema
            : categoryCsvSchema;
  if (!options.safeExport) return schema;
  return schema.filter((column) => !["R+", "Censorship", "Measurements", "Cup Size"].includes(column.header));
}

export function importSchemaFor(entity: ExportCsvEntity): CsvSchemaColumn<any>[] {
  const current = exportSchemaFor(entity);
  const seen = new Set(current.map((column) => column.header));
  return [
    ...current,
    ...legacyImportColumns[entity].filter((column) => !seen.has(column.header)),
  ];
}

export function legacyImportHeadersFor(entity: ExportCsvEntity) {
  return legacyImportColumns[entity].map((column) => column.header);
}

export function exportRowsFor(entity: ExportCsvEntity, records: unknown[]) {
  if (entity === "glossary") {
    const entries = records as GlossaryEntry[];
    const refById = new Map(entries.map((entry) => [entry.id, entry.sakuravaRef ?? entry.id]));
    return entries.map((entry) => ({
      ...entry,
      parentId: entry.parentId ? (refById.get(entry.parentId) ?? entry.parentId) : "",
    }));
  }
  if (entity === "credits") {
    return [...records].sort((left, right) => {
      const leftRecord = left as CreditCsvRecord;
      const rightRecord = right as CreditCsvRecord;
      return String(leftRecord.sakuravaRef ?? "").localeCompare(String(rightRecord.sakuravaRef ?? ""))
        || leftRecord.id.localeCompare(rightRecord.id);
    });
  }
  if (entity !== "categories") return records;
  const categories = records as ManagedCategory[];
  const categoryNameByKey = new Map(categories.map((category) => [category.key, category.name]));
  const categoryRefByKey = new Map(categories.map((category) => [category.key, category.sakuravaRef ?? category.key]));
  return categories.map((category) => ({
    ...category,
    parentCategoryName: category.parentKey
      ? (categoryNameByKey.get(category.parentKey) ?? "")
      : "",
    parentCategoryRef: category.parentKey
      ? sakuravaRef("CAT", categoryRefByKey.get(category.parentKey) ?? category.parentKey)
      : "",
  }));
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

  if (entity === "glossary") {
    return "Glossary";
  }

  if (entity === "credits") {
    return "Credits";
  }

  return "Managed Categories";
}

export function sakuravaRef(prefix: SakuravaRefPrefix, sourceId: string) {
  const normalized = sourceId.trim();
  if (!normalized) {
    return "";
  }

  const canonical = canonicalSakuravaRef(normalized);
  if (canonical) return formatSakuravaRef(canonical);
  // Credit technical ids are never public spreadsheet identities. An invalid
  // or missing stored Credit Ref remains blank rather than becoming a legacy
  // technical identifier.
  return prefix === "R" ? "" : legacySakuravaRef(prefix, normalized);
}

export function sakuravaRefMatches(
  prefix: SakuravaRefPrefix,
  reference: string,
  record: { id?: string; key?: string; sakuravaRef?: string },
) {
  return recordMatchesSakuravaIdentity(
    prefix === "R" ? "R" : sectionCodeForLegacyPrefix(prefix),
    reference,
    record,
  );
}

function actionColumn<TRecord>(): CsvSchemaColumn<TRecord> {
  return {
    key: "action",
    header: "Action",
    internalField: "bulkAction",
    required: true,
    editable: true,
    clearable: false,
    valueType: "text",
    value: () => BULK_EDIT_ACTION_DEFAULT,
    example: "Auto",
  };
}

function refColumn<TRecord>(
  prefix: SakuravaRefPrefix,
  sourceField: keyof TRecord & string,
): CsvSchemaColumn<TRecord> {
  return {
    key: "identifier",
    header: "Sakurava Ref",
    internalField: "sakuravaRef",
    required: false,
    editable: false,
    clearable: false,
    valueType: "identifier",
    value: (record) =>
      sakuravaRef(prefix, String(
        (record as Record<string, CsvCell>).sakuravaRef
          ?? (record as Record<string, CsvCell>)[sourceField]
          ?? "",
      )),
  };
}

function referenceColumn<TRecord>(
  header: string,
  internalField: "workRef" | "performerRef" | "roleImportanceRef",
  required: boolean,
): CsvSchemaColumn<TRecord> {
  return {
    key: internalField,
    header,
    internalField,
    required,
    editable: true,
    clearable: !required,
    valueType: "list/reference",
    value: (record) => (record as Record<string, CsvCell>)[internalField] ?? "",
  };
}

/** File-local identity for new rows. It is intentionally blank in exports. */
function importRefColumn<TRecord>(): CsvSchemaColumn<TRecord> {
  return {
    key: "importRef",
    header: "Import Ref",
    internalField: "importRef",
    required: false,
    editable: true,
    clearable: false,
    valueType: "identifier",
    value: () => "",
    example: "NEW-001",
  };
}

function textColumn<TRecord>(
  header: string,
  internalField: CsvInternalField,
): CsvSchemaColumn<TRecord> {
  return {
    key: String(internalField),
    header,
    internalField,
    required:
      header === "Title" ||
      header === "Name" ||
      header === "Category Name" ||
      header === "Term" ||
      header === "Definition",
    editable: true,
    clearable: !(
      header === "Title" ||
      header === "Name" ||
      header === "Category Name" ||
      header === "Term" ||
      header === "Definition" ||
      (typeof internalField === "string" && internalField.startsWith("showIn")) ||
      internalField === "favorite"
    ),
    valueType: (typeof internalField === "string" && internalField.startsWith("showIn"))
      || internalField === "favorite"
      ? "boolean"
      : header.startsWith("Rating - ") || header.includes("(cm)") || header.includes("(kg)")
        ? "number"
        : "text",
    value: (record) => (record as Record<string, CsvCell>)[internalField],
  };
}

function multilineTextColumn<TRecord>(
  header: string,
  internalField: CsvInternalField,
): CsvSchemaColumn<TRecord> {
  return {
    ...textColumn<TRecord>(header, internalField),
    multiline: true,
  };
}

function numberColumn<TRecord>(
  header: string,
  internalField: CsvInternalField,
): CsvSchemaColumn<TRecord> {
  return {
    key: String(internalField),
    header,
    internalField,
    required: false,
    editable: true,
    clearable: true,
    valueType: "number",
    value: (record) => (record as Record<string, CsvCell>)[internalField],
  };
}

function booleanColumn<TRecord>(
  header: string,
  internalField: CsvInternalField,
): CsvSchemaColumn<TRecord> {
  return {
    key: String(internalField),
    header,
    internalField,
    required: false,
    editable: true,
    clearable: false,
    valueType: "boolean",
    allowedValues: ["true", "false"],
    value: (record) => (record as Record<string, CsvCell>)[internalField],
  };
}

function enumColumn<TRecord>(
  header: string,
  internalField: CsvInternalField,
  allowedValues: readonly string[],
): CsvSchemaColumn<TRecord> {
  return {
    ...textColumn<TRecord>(header, internalField),
    allowedValues,
  };
}

function sourceLinksColumn<TRecord extends { sourceLinksJson: string }>(): CsvSchemaColumn<TRecord> {
  return {
    key: "sourceLinksJson",
    header: "Source Links",
    internalField: "sourceLinksJson",
    required: false,
    editable: true,
    clearable: true,
    valueType: "list/reference",
    multiline: true,
    value: (record) => parseSourceLinkArray(record.sourceLinksJson)
      .map((link) => link.title.trim() ? `${link.title.trim()} | ${link.url.trim()}` : link.url.trim())
      .filter(Boolean)
      .join("\n"),
    example: "Official source | https://example.invalid/source",
  };
}

function compatibilityPlaceholderColumn<TRecord>(
  header: string,
  internalField: "visibility" | "categoryNotes",
): CsvSchemaColumn<TRecord> {
  return {
    key: `legacy.${internalField}`,
    header,
    internalField,
    required: false,
    editable: false,
    clearable: false,
    valueType: "text",
    value: () => "",
  };
}

function dateColumn<TRecord>(
  header: string,
  internalField: CsvInternalField,
): CsvSchemaColumn<TRecord> {
  return {
    key: String(internalField),
    header,
    internalField,
    required: false,
    editable: true,
    clearable: true,
    valueType: "date",
    value: (record) => (record as Record<string, CsvCell>)[internalField],
  };
}

function listColumn<TRecord>(
  header: string,
  internalField: CsvInternalField,
  getValues: (record: TRecord) => string[],
): CsvSchemaColumn<TRecord> {
  return {
    key: String(internalField),
    header,
    internalField,
    required: false,
    editable: true,
    clearable: true,
    valueType: "list/reference",
    value: (record) => joinReadableList(getValues(record)),
  };
}

function ratingColumns<TRecord>(
  columns: RatingColumn[],
): CsvSchemaColumn<TRecord>[] {
  return columns.map((column) => ({
    key: `rating.${column.key}`,
    header: column.header,
    internalField: `ratingJson.${column.key}`,
    required: false,
    editable: true,
    clearable: true,
    valueType: "number" as const,
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
    key: `${internalFieldPrefix}.${index + 1}`,
    header: `${headerPrefix} ${index + 1}`,
    internalField: `${internalFieldPrefix}.${index + 1}` as CsvInternalField,
    required: false,
    editable: true,
    clearable: true,
    valueType: "text" as const,
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

export function serializeExportCell(
  value: CsvCell,
  valueType: ExportValueType,
  options: ExportSerializationOptions = {},
): CsvCell {
  if (valueType !== "date" && valueType !== "date-time") return value;
  if (!options.locale) return normalizeDateOnlyForCsv(value);
  const date = parseExportDate(value, valueType === "date-time", options.locale);
  if (!date) return value == null ? "" : String(value);
  return valueType === "date-time"
    ? new Intl.DateTimeFormat(options.locale, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date)
    : new Intl.DateTimeFormat(options.locale, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      }).format(date);
}

export function parseExportDate(
  value: CsvCell,
  includeTime = false,
  locale?: string,
): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](.*))?$/);
  if (ymd && isValidDateParts(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]))) {
    if (includeTime && ymd[4]) {
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  }

  if (locale) {
    const localDate = parseLocaleNumericDate(text, locale);
    if (localDate) return localDate;
  }

  const normalized = normalizeDateOnlyForCsv(text);
  const normalizedMatch = String(normalized).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return normalizedMatch
    ? new Date(Number(normalizedMatch[1]), Number(normalizedMatch[2]) - 1, Number(normalizedMatch[3]))
    : null;
}

function parseLocaleNumericDate(value: string, locale: string) {
  const match = value.match(/^(\d{1,4})\D(\d{1,2})\D(\d{1,4})$/);
  if (!match) return null;

  const order = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(2006, 10, 22))
    .map((part) => part.type)
    .filter((part): part is "year" | "month" | "day" =>
      part === "year" || part === "month" || part === "day",
    );
  if (order.length !== 3) return null;

  const values = Object.fromEntries(
    order.map((part, index) => [part, Number(match[index + 1])]),
  ) as Record<"year" | "month" | "day", number>;
  if (!isValidDateParts(values.year, values.month, values.day)) return null;
  return new Date(values.year, values.month - 1, values.day);
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
