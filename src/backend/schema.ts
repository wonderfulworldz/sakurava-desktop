export const DATABASE_FILE_NAME = "sakurava.sqlite";
export const APP_DATA_FOLDER_NAME = "app.sakurava.desktop";

export const CREATE_VIDEOS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  originalTitle TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  censorship TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT '',
  releaseDate TEXT NOT NULL DEFAULT '',
  durationMinutes INTEGER,
  resolution TEXT NOT NULL DEFAULT '',
  fileSizeBytes INTEGER,
  fileType TEXT NOT NULL DEFAULT '',
  publisherLabel TEXT NOT NULL DEFAULT '',
  coverPath TEXT NOT NULL DEFAULT '',
  mediaPath TEXT NOT NULL DEFAULT '',
  categoriesJson TEXT NOT NULL DEFAULT '[]',
  relatedPerformersJson TEXT NOT NULL DEFAULT '[]',
  relatedImagesJson TEXT NOT NULL DEFAULT '[]',
  ratingJson TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
`;

export const CREATE_IMAGES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  originalTitle TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  censorship TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT '',
  releaseDate TEXT NOT NULL DEFAULT '',
  publisherLabel TEXT NOT NULL DEFAULT '',
  coverPath TEXT NOT NULL DEFAULT '',
  folderPath TEXT NOT NULL DEFAULT '',
  imageCount INTEGER,
  mainResolution TEXT NOT NULL DEFAULT '',
  totalFileSizeBytes INTEGER,
  mainFileType TEXT NOT NULL DEFAULT '',
  galleryImagePathsJson TEXT NOT NULL DEFAULT '[]',
  categoriesJson TEXT NOT NULL DEFAULT '[]',
  relatedPerformersJson TEXT NOT NULL DEFAULT '[]',
  relatedVideosJson TEXT NOT NULL DEFAULT '[]',
  ratingJson TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
`;

export const CREATE_PERFORMERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS performers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  originalName TEXT NOT NULL DEFAULT '',
  aliasesJson TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT '',
  debutDate TEXT NOT NULL DEFAULT '',
  retiredDate TEXT NOT NULL DEFAULT '',
  birthDate TEXT NOT NULL DEFAULT '',
  birthplace TEXT NOT NULL DEFAULT '',
  nationality TEXT NOT NULL DEFAULT '',
  bloodType TEXT NOT NULL DEFAULT '',
  heightCm INTEGER,
  weightKg INTEGER,
  measurements TEXT NOT NULL DEFAULT '',
  cupSize TEXT NOT NULL DEFAULT '',
  coverPath TEXT NOT NULL DEFAULT '',
  performerThumbnailPathsJson TEXT NOT NULL DEFAULT '[]',
  filmographyCount INTEGER,
  pictorialsCount INTEGER,
  relatedVideosJson TEXT NOT NULL DEFAULT '[]',
  relatedImagesJson TEXT NOT NULL DEFAULT '[]',
  categoriesJson TEXT NOT NULL DEFAULT '[]',
  ratingJson TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
`;

export const CREATE_MANAGED_CATEGORIES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS managedCategories (
  key TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  parentKey TEXT,
  description TEXT NOT NULL DEFAULT '',
  thumbnailPath TEXT NOT NULL DEFAULT '',
  showInVideos INTEGER NOT NULL DEFAULT 1 CHECK (showInVideos IN (0, 1)),
  showInImages INTEGER NOT NULL DEFAULT 1 CHECK (showInImages IN (0, 1)),
  showInPerformers INTEGER NOT NULL DEFAULT 1 CHECK (showInPerformers IN (0, 1)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(name COLLATE NOCASE),
  FOREIGN KEY(parentKey) REFERENCES managedCategories(key)
);
`;

export const CREATE_GLOSSARY_ENTRIES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS glossary_entries (
  id TEXT PRIMARY KEY NOT NULL,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  synonyms_json TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT '',
  parent_id TEXT NOT NULL DEFAULT '',
  thumbnail_path TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  source_title TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export const SCHEMA_SQL = [
  CREATE_VIDEOS_TABLE_SQL,
  CREATE_IMAGES_TABLE_SQL,
  CREATE_PERFORMERS_TABLE_SQL,
  CREATE_MANAGED_CATEGORIES_TABLE_SQL,
  CREATE_GLOSSARY_ENTRIES_TABLE_SQL,
] as const;

export const TABLE_NAMES = [
  "videos",
  "images",
  "performers",
  "managedCategories",
  "glossary_entries",
] as const;
