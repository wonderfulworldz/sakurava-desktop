import {
  APP_DATA_FOLDER_NAME,
  CREATE_IMAGES_TABLE_SQL,
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
    ]);
    expect(SCHEMA_SQL).toHaveLength(4);
  });

  it("defines the videos table with JSON text fields and no relation tables", () => {
    expect(CREATE_VIDEOS_TABLE_SQL).toContain("CREATE TABLE IF NOT EXISTS videos");
    for (const column of [
      "id TEXT PRIMARY KEY NOT NULL",
      "title TEXT NOT NULL",
      "durationMinutes INTEGER",
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
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("filmographyCount INTEGER");
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain("pictorialsCount INTEGER");
    expect(CREATE_PERFORMERS_TABLE_SQL).toContain(
      "categoriesJson TEXT NOT NULL DEFAULT '[]'",
    );
    expect(CREATE_PERFORMERS_TABLE_SQL).not.toContain("categoryIds");
    expect(CREATE_PERFORMERS_TABLE_SQL).not.toContain("related");
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
      "FOREIGN KEY(parentKey) REFERENCES managedCategories(key)",
    );
    expect(schemaText).not.toContain("video_categories");
    expect(schemaText).not.toContain("image_categories");
    expect(schemaText).not.toContain("performer_categories");
    expect(schemaText).not.toContain("related_videos");
    expect(schemaText).not.toContain("related_images");
    expect(schemaText).not.toContain("related_performers");
  });
});
