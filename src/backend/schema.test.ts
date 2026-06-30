import {
  APP_DATA_FOLDER_NAME,
  ADD_PERFORMER_GENDER_COLUMN_SQL,
  CREATE_IMAGES_TABLE_SQL,
  CREATE_GLOSSARY_ENTRIES_TABLE_SQL,
  CREATE_CREDITS_TABLE_SQL,
  CREATE_MANAGED_CATEGORIES_TABLE_SQL,
  CREATE_PERFORMERS_TABLE_SQL,
  CREATE_VIDEOS_TABLE_SQL,
  DATABASE_FILE_NAME,
  SCHEMA_SQL,
  TABLE_NAMES,
} from "./schema";

describe("SQLite schema foundation", () => {
  it("uses the approved database file and app data folder names", () => {
    expect(DATABASE_FILE_NAME).toBe("sakurava.sqlite");
    expect(APP_DATA_FOLDER_NAME).toBe("app.sakurava.desktop");
  });

  it("defines the catalog record tables plus managed category metadata", () => {
    expect(TABLE_NAMES).toEqual([
      "videos",
      "images",
      "performers",
      "managedCategories",
      "glossary_entries",
      "credits",
    ]);
    expect(SCHEMA_SQL).toHaveLength(6);
  });

  it("defines the videos table with JSON text fields and no relation tables", () => {
    expect(CREATE_VIDEOS_TABLE_SQL).toContain("CREATE TABLE IF NOT EXISTS videos");
    for (const column of [
      "id TEXT PRIMARY KEY NOT NULL",
      "title TEXT NOT NULL",
      "durationMinutes INTEGER",
      "resolution TEXT NOT NULL DEFAULT ''",
      "fileSizeBytes INTEGER",
      "fileType TEXT NOT NULL DEFAULT ''",
      "categoriesJson TEXT NOT NULL DEFAULT '[]'",
      "relatedPerformersJson TEXT NOT NULL DEFAULT '[]'",
      "relatedImagesJson TEXT NOT NULL DEFAULT '[]'",
      "ratingJson TEXT NOT NULL DEFAULT '{}'",
      "favorite INTEGER NOT NULL DEFAULT 0",
      "createdAt TEXT NOT NULL",
      "updatedAt TEXT NOT NULL",
    ]) {
      expect(CREATE_VIDEOS_TABLE_SQL).toContain(column);
    }

    expect(CREATE_VIDEOS_TABLE_SQL).not.toContain("categoryIds");
    expect(CREATE_VIDEOS_TABLE_SQL).not.toContain("related_performers");
  });

  it("defines the images table with folder metadata", () => {
    expect(CREATE_IMAGES_TABLE_SQL).toContain("CREATE TABLE IF NOT EXISTS images");
    expect(CREATE_IMAGES_TABLE_SQL).toContain("folderPath TEXT NOT NULL DEFAULT ''");
    expect(CREATE_IMAGES_TABLE_SQL).toContain("imageCount INTEGER");
    expect(CREATE_IMAGES_TABLE_SQL).toContain("mainResolution TEXT NOT NULL DEFAULT ''");
    expect(CREATE_IMAGES_TABLE_SQL).toContain("totalFileSizeBytes INTEGER");
    expect(CREATE_IMAGES_TABLE_SQL).toContain("mainFileType TEXT NOT NULL DEFAULT ''");
    expect(CREATE_IMAGES_TABLE_SQL).toContain(
      "galleryImagePathsJson TEXT NOT NULL DEFAULT '[]'",
    );
    expect(CREATE_IMAGES_TABLE_SQL).toContain("categoriesJson TEXT NOT NULL DEFAULT '[]'");
    expect(CREATE_IMAGES_TABLE_SQL).toContain(
      "relatedPerformersJson TEXT NOT NULL DEFAULT '[]'",
    );
    expect(CREATE_IMAGES_TABLE_SQL).toContain(
      "relatedVideosJson TEXT NOT NULL DEFAULT '[]'",
    );
    expect(CREATE_IMAGES_TABLE_SQL).toContain("ratingJson TEXT NOT NULL DEFAULT '{}'");
    expect(CREATE_IMAGES_TABLE_SQL).not.toContain("categoryIds");
    expect(CREATE_IMAGES_TABLE_SQL).not.toContain("related_performers");
  });

  it("defines the performers table with aliasesJson and count fields", () => {
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain(
      "CREATE TABLE IF NOT EXISTS performers",
    );
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain(
      "aliasesJson TEXT NOT NULL DEFAULT '[]'",
    );
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain(
      "performerThumbnailPathsJson TEXT NOT NULL DEFAULT '[]'",
    );
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("debutDate TEXT NOT NULL DEFAULT ''");
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("retiredDate TEXT NOT NULL DEFAULT ''");
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("gender TEXT NOT NULL DEFAULT ''");
    expect(ADD_PERFORMER_GENDER_COLUMN_SQL).toBe(
      "ALTER TABLE performers ADD COLUMN gender TEXT NOT NULL DEFAULT ''",
    );
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("birthplace TEXT NOT NULL DEFAULT ''");
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("nationality TEXT NOT NULL DEFAULT ''");
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("bloodType TEXT NOT NULL DEFAULT ''");
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("heightCm INTEGER");
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("weightKg INTEGER");
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("measurements TEXT NOT NULL DEFAULT ''");
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("cupSize TEXT NOT NULL DEFAULT ''");
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("filmographyCount INTEGER");
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("pictorialsCount INTEGER");
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain(
      "relatedVideosJson TEXT NOT NULL DEFAULT '[]'",
    );
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain(
      "relatedImagesJson TEXT NOT NULL DEFAULT '[]'",
    );
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain(
      "categoriesJson TEXT NOT NULL DEFAULT '[]'",
    );
    expect(CREATE_PERFORMERS_TABLE_SQL).not.toContain("categoryIds");
  });

  it("does not define relational category or content tables", () => {
    const schemaText = SCHEMA_SQL.join("\n").toLowerCase();

    expect(CREATE_MANAGED_CATEGORIES_TABLE_SQL).toContain(
      "CREATE TABLE IF NOT EXISTS managedCategories",
    );
    expect(CREATE_MANAGED_CATEGORIES_TABLE_SQL).toContain(
      "key TEXT PRIMARY KEY NOT NULL",
    );
    expect(CREATE_MANAGED_CATEGORIES_TABLE_SQL).toContain(
      "thumbnailPath TEXT NOT NULL DEFAULT ''",
    );
    expect(CREATE_MANAGED_CATEGORIES_TABLE_SQL).toContain(
      "showInVideos INTEGER NOT NULL DEFAULT 1",
    );
    expect(CREATE_MANAGED_CATEGORIES_TABLE_SQL).toContain(
      "showInImages INTEGER NOT NULL DEFAULT 1",
    );
    expect(CREATE_MANAGED_CATEGORIES_TABLE_SQL).toContain(
      "showInPerformers INTEGER NOT NULL DEFAULT 1",
    );
    expect(CREATE_MANAGED_CATEGORIES_TABLE_SQL).toContain(
      "FOREIGN KEY(parentKey) REFERENCES managedCategories(key)",
    );
    expect(schemaText).not.toContain("video_categories");
    expect(schemaText).not.toContain("image_categories");
    expect(schemaText).not.toContain("performer_categories");
    expect(schemaText).not.toContain("related_videos");
    expect(schemaText).not.toContain("related_images");
    expect(schemaText).not.toContain("related_performers");
  });

  it("defines the independent glossary entries table", () => {
    expect(CREATE_GLOSSARY_ENTRIES_TABLE_SQL).toContain(
      "CREATE TABLE IF NOT EXISTS glossary_entries",
    );
    for (const column of [
      "id TEXT PRIMARY KEY NOT NULL",
      "term TEXT NOT NULL",
      "definition TEXT NOT NULL",
      "synonyms_json TEXT NOT NULL DEFAULT '[]'",
      "category TEXT NOT NULL DEFAULT ''",
      "parent_id TEXT NOT NULL DEFAULT ''",
      "thumbnail_path TEXT NOT NULL DEFAULT ''",
      "favorite INTEGER NOT NULL DEFAULT 0",
      "source_title TEXT NOT NULL DEFAULT ''",
      "source_url TEXT NOT NULL DEFAULT ''",
      "created_at INTEGER NOT NULL",
      "updated_at INTEGER NOT NULL",
    ]) {
      expect(CREATE_GLOSSARY_ENTRIES_TABLE_SQL).toContain(column);
    }

    expect(CREATE_GLOSSARY_ENTRIES_TABLE_SQL).not.toContain("categoriesJson");
    expect(CREATE_GLOSSARY_ENTRIES_TABLE_SQL).not.toContain("managedCategories");
    expect(CREATE_GLOSSARY_ENTRIES_TABLE_SQL).not.toContain("FOREIGN KEY");
  });

  it("defines the independent credits table without restricting performer multiplicity", () => {
    expect(CREATE_CREDITS_TABLE_SQL).toContain(
      "CREATE TABLE IF NOT EXISTS credits",
    );
    for (const column of [
      "workType TEXT NOT NULL",
      "workId TEXT NOT NULL",
      "performerId TEXT NOT NULL",
      "characterName TEXT NOT NULL DEFAULT ''",
      "creditedAsMode TEXT NOT NULL DEFAULT 'auto'",
      "characterMode TEXT NOT NULL DEFAULT 'text'",
      "legacySourceKey TEXT",
    ]) {
      expect(CREATE_CREDITS_TABLE_SQL).toContain(column);
    }
    expect(CREATE_CREDITS_TABLE_SQL).not.toContain(
      "UNIQUE(workType, workId, performerId)",
    );
  });
});
