export type EntityId = string;
export type IsoDateString = string;
export type IsoDateTimeString = string;
export type JsonText = string;

export type Censorship = "Censored" | "Uncensored" | "Reduced" | "";
export type Availability = "Owned" | "Not Owned" | "Missing" | "";
export type PerformerStatus = "Unknown" | "Active" | "Retired" | "";

export interface BaseCatalogRecord {
  id: EntityId;
  categoriesJson: JsonText;
  ratingJson: JsonText;
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
  relatedPerformersJson: JsonText;
  relatedVideosJson: JsonText;
}

export interface Performer extends BaseCatalogRecord {
  name: string;
  originalName: string;
  aliasesJson: JsonText;
  status: PerformerStatus;
  birthDate: IsoDateString;
  coverPath: string;
  performerThumbnailPathsJson: JsonText;
  filmographyCount: number | null;
  pictorialsCount: number | null;
}

type GeneratedFields = "id" | "createdAt" | "updatedAt";

export type NewVideo = Pick<Video, "title"> &
  Partial<Omit<Video, GeneratedFields | "title">>;
export type VideoPatch = Partial<NewVideo>;

export type NewImage = Pick<Image, "title"> &
  Partial<Omit<Image, GeneratedFields | "title">>;
export type ImagePatch = Partial<NewImage>;

export type NewPerformer = Pick<Performer, "name"> &
  Partial<Omit<Performer, GeneratedFields | "name">>;
export type PerformerPatch = Partial<NewPerformer>;

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
