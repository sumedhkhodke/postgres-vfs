import postgres, { type Sql } from "postgres";

export type DbClient = Sql;

export function createClient(databaseUrl?: string): DbClient {
  const url = databaseUrl ?? process.env.DATABASE_URL ?? "postgres://localhost:5432/postgres_vfs";
  return postgres(url, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
  });
}
