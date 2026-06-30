import {
  ADD_PERFORMER_GENDER_COLUMN_SQL,
  APP_DATA_FOLDER_NAME,
  DATABASE_FILE_NAME,
  SCHEMA_SQL,
} from "../schema";
import {
  createRuntimeDatabasePathPlan,
  getRuntimeSchemaStatements,
  initializeRuntimeDatabaseSchema,
} from "./database";

describe("runtime database boundary", () => {
  it("defines the approved app data folder and database file names", () => {
    expect(createRuntimeDatabasePathPlan()).toEqual({
      appDataFolderName: APP_DATA_FOLDER_NAME,
      databaseFileName: DATABASE_FILE_NAME,
      databaseRelativePath: "app.sakurava.desktop/sakurava.sqlite",
    });
  });

  it("exposes the existing schema statements for runtime initialization", () => {
    expect(getRuntimeSchemaStatements()).toBe(SCHEMA_SQL);
  });

  it("delegates schema initialization without requiring a real SQLite driver", async () => {
    const executed: string[] = [];

    await initializeRuntimeDatabaseSchema({
      async execute(sql) {
        executed.push(sql);
      },
      async queryAll() {
        executed.push(
          executed.includes("PRAGMA table_info(performers)")
            ? "PRAGMA table_info(managedCategories)"
            : "PRAGMA table_info(performers)",
        );
        return [];
      },
    });

    expect(executed).toEqual([
      ...SCHEMA_SQL,
      "PRAGMA table_info(performers)",
      ADD_PERFORMER_GENDER_COLUMN_SQL,
      "PRAGMA table_info(managedCategories)",
      "ALTER TABLE managedCategories ADD COLUMN showInCredits INTEGER NOT NULL DEFAULT 0 CHECK (showInCredits IN (0, 1))",
    ]);
  });
});
