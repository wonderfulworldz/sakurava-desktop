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
}

export interface Performer extends BaseCatalogRecord {
  name: string;
  originalName: string;
  aliasesJson: JsonText;
  status: PerformerStatus;
  birthDate: IsoDateString;
  coverPath: string;
  filmographyCount: number | null;
  pictorialsCount: number | null;
}

export type NewVideo = Omit<Video, "id" | "createdAt" | "updatedAt">;
export type VideoPatch = Partial<NewVideo>;

export type NewImage = Omit<Image, "id" | "createdAt" | "updatedAt">;
export type ImagePatch = Partial<NewImage>;

export type NewPerformer = Omit<Performer, "id" | "createdAt" | "updatedAt">;
export type PerformerPatch = Partial<NewPerformer>;

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
