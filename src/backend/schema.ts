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
  publisherLabel TEXT NOT NULL DEFAULT '',
  coverPath TEXT NOT NULL DEFAULT '',
  mediaPath TEXT NOT NULL DEFAULT '',
  categoriesJson TEXT NOT NULL DEFAULT '[]',
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
  categoriesJson TEXT NOT NULL DEFAULT '[]',
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
  birthDate TEXT NOT NULL DEFAULT '',
  coverPath TEXT NOT NULL DEFAULT '',
  filmographyCount INTEGER,
  pictorialsCount INTEGER,
  categoriesJson TEXT NOT NULL DEFAULT '[]',
  ratingJson TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
`;

export const SCHEMA_SQL = [
  CREATE_VIDEOS_TABLE_SQL,
  CREATE_IMAGES_TABLE_SQL,
  CREATE_PERFORMERS_TABLE_SQL,
] as const;

export const TABLE_NAMES = ["videos", "images", "performers"] as const;
