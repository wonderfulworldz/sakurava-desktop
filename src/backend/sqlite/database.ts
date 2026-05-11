import { SCHEMA_SQL } from "../schema";

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
  database: Pick<SqliteDatabase, "execute">,
) {
  for (const statement of SCHEMA_SQL) {
    await database.execute(statement);
  }
}
