import {
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
    });

    expect(executed).toEqual(SCHEMA_SQL);
  });
});
