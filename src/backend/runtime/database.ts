import {
  APP_DATA_FOLDER_NAME,
  DATABASE_FILE_NAME,
  SCHEMA_SQL,
} from "../schema";
import {
  initializeSakuravaSchema,
  type SqliteDatabase,
} from "../sqlite/database";

export interface RuntimeDatabasePathPlan {
  appDataFolderName: typeof APP_DATA_FOLDER_NAME;
  databaseFileName: typeof DATABASE_FILE_NAME;
  databaseRelativePath: string;
}

export function createRuntimeDatabasePathPlan(): RuntimeDatabasePathPlan {
  return {
    appDataFolderName: APP_DATA_FOLDER_NAME,
    databaseFileName: DATABASE_FILE_NAME,
    databaseRelativePath: `${APP_DATA_FOLDER_NAME}/${DATABASE_FILE_NAME}`,
  };
}

export function getRuntimeSchemaStatements() {
  return SCHEMA_SQL;
}

export async function initializeRuntimeDatabaseSchema(
  database: Pick<SqliteDatabase, "execute">,
) {
  await initializeSakuravaSchema(database);
}
