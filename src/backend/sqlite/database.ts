import { ADD_PERFORMER_GENDER_COLUMN_SQL, SCHEMA_SQL } from "../schema";

export type SqliteValue = string | number | null;

export interface SqliteDatabase {
  execute(sql: string, params?: readonly SqliteValue[]): Promise<void>;
  queryOne<TRecord>(
    sql: string,
    params?: readonly SqliteValue[],
  ): Promise<TRecord | null>;
  queryAll<TRecord>(
    sql: string,
    params?: readonly SqliteValue[],
  ): Promise<TRecord[]>;
}

export async function initializeSakuravaSchema(
  database: Pick<SqliteDatabase, "execute" | "queryAll">,
) {
  for (const statement of SCHEMA_SQL) {
    await database.execute(statement);
  }

  await ensurePerformerGenderColumn(database);
}

async function ensurePerformerGenderColumn(
  database: Pick<SqliteDatabase, "execute" | "queryAll">,
) {
  const columns = await database.queryAll<{ name?: SqliteValue }>(
    "PRAGMA table_info(performers)",
  );
  const hasGender = columns.some(
    (column) => String(column.name ?? "").toLowerCase() === "gender",
  );

  if (!hasGender) {
    await database.execute(ADD_PERFORMER_GENDER_COLUMN_SQL);
  }
}
