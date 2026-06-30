export type EntityId = string;
export type IsoDateString = string;
export type IsoDateTimeString = string;
export type JsonText = string;

export type Censorship = "Censored" | "Uncensored" | "Reduced" | "";
export type Availability = "Owned" | "Not Owned" | "Missing" | "";
export type PerformerStatus = "Unknown" | "Active" | "Retired" | "";
export type CreditWorkType = "video" | "image";
export type CreditedAsMode = "auto" | "custom";
export type CreditCharacterMode = "text" | "self" | "linked";

export interface BaseCatalogRecord {
  id: EntityId;
  categoriesJson: JsonText;
  ratingJson: JsonText;
  sourceLinksJson: JsonText;
  notes: string;
  favorite: boolean;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface Video extends BaseCatalogRecord {
  title: string;
  originalTitle: string;
  code: string;
  censorship: Censorship;
  availability: Availability;
  releaseDate: IsoDateString;
  durationMinutes: number | null;
  resolution: string;
  fileSizeBytes: number | null;
  fileType: string;
  publisherLabel: string;
  coverPath: string;
  mediaPath: string;
  relatedPerformersJson: JsonText;
  relatedImagesJson: JsonText;
}

export interface Image extends BaseCatalogRecord {
  title: string;
  originalTitle: string;
  code: string;
  censorship: Censorship;
  availability: Availability;
  releaseDate: IsoDateString;
  publisherLabel: string;
  coverPath: string;
  folderPath: string;
  imageCount: number | null;
  mainResolution: string;
  totalFileSizeBytes: number | null;
  mainFileType: string;
  galleryImagePathsJson: JsonText;
  relatedPerformersJson: JsonText;
  relatedVideosJson: JsonText;
}

export interface Performer extends BaseCatalogRecord {
  name: string;
  originalName: string;
  aliasesJson: JsonText;
  status: PerformerStatus;
  debutDate: IsoDateString;
  retiredDate: IsoDateString;
  birthDate: IsoDateString;
  gender?: string;
  birthplace: string;
  nationality: string;
  bloodType: string;
  heightCm: number | null;
  weightKg: number | null;
  measurements: string;
  cupSize: string;
  coverPath: string;
  performerThumbnailPathsJson: JsonText;
  filmographyCount: number | null;
  pictorialsCount: number | null;
  relatedVideosJson: JsonText;
  relatedImagesJson: JsonText;
}

export interface ManagedCategory {
  key: EntityId;
  name: string;
  parentKey: EntityId | null;
  description: string;
  thumbnailPath: string;
  showInVideos: boolean;
  showInImages: boolean;
  showInPerformers: boolean;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface Credit {
  id: EntityId;
  workType: CreditWorkType;
  workId: EntityId;
  performerId: EntityId;
  characterName: string;
  characterOriginalName: string | null;
  creditedAs: string | null;
  creditedAsMode: CreditedAsMode;
  creditTypeCategoryId: string | null;
  roleImportanceCategoryId: string | null;
  characterMode: CreditCharacterMode;
  characterId: EntityId | null;
  billingOrder: number | null;
  note: string | null;
  legacySourceKey: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface GlossaryEntry {
  id: EntityId;
  term: string;
  definition: string;
  synonymsJson: JsonText;
  category: string;
  parentId: string;
  thumbnailPath: string;
  favorite: boolean;
  sourceTitle: string;
  sourceUrl: string;
  createdAt: number;
  updatedAt: number;
}

type GeneratedFields = "id" | "createdAt" | "updatedAt";
type ManagedCategoryGeneratedFields = "createdAt" | "updatedAt";

export type NewVideo = Pick<Video, "title"> &
  Partial<Omit<Video, GeneratedFields | "title">>;
export type VideoPatch = Partial<NewVideo>;

export type NewImage = Pick<Image, "title"> &
  Partial<Omit<Image, GeneratedFields | "title">>;
export type ImagePatch = Partial<NewImage>;

export type NewPerformer = Pick<Performer, "name"> &
  Partial<Omit<Performer, GeneratedFields | "name">>;
export type PerformerPatch = Partial<NewPerformer>;

export type NewCredit = Pick<Credit, "workType" | "workId" | "performerId"> &
  Partial<Omit<Credit, GeneratedFields | "workType" | "workId" | "performerId" | "legacySourceKey">>;
export type CreditPatch = Partial<Omit<NewCredit, "workType" | "workId" | "performerId">> &
  Partial<Pick<Credit, "workType" | "workId" | "performerId">>;

export type NewManagedCategory = Pick<ManagedCategory, "name"> &
  Partial<Omit<ManagedCategory, ManagedCategoryGeneratedFields | "name">>;
export type ManagedCategoryPatch = Partial<
  Omit<ManagedCategory, ManagedCategoryGeneratedFields | "key">
>;

export type NewGlossaryEntry = Pick<GlossaryEntry, "term" | "definition"> &
  Partial<Omit<GlossaryEntry, GeneratedFields | "term" | "definition">>;
export type GlossaryEntryPatch = Partial<NewGlossaryEntry>;

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
