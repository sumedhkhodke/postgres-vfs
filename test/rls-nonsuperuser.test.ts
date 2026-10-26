import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createClient, type DbClient } from "../src/db/client.js";
import { withTenant } from "../src/db/tenant.js";
import { PostgresFs } from "../src/fs/postgres-fs.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Managed Postgres (Neon, Supabase, RDS) runs migrations as a non-superuser owner
// with CREATEROLE, and the app should connect as a least-privilege login role.
// The main suite runs as superuser, which can always SET ROLE, so it cannot catch
// membership bugs. This suite needs a FRESH cluster where `vfs_app` doesn't exist
// yet, reached through a superuser URL it uses only for setup:
//   RLS_NONSUPERUSER_ADMIN_URL=postgres://postgres:postgres@localhost:55433/postgres
const ADMIN_URL = process.env.RLS_NONSUPERUSER_ADMIN_URL;

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(__dirname, "../src/db/schema.sql"), "utf-8");

const DB = "pvfs_nonsuper";
const OWNER = "pvfs_owner";
const APP = "pvfs_login";
const PASSWORD = "test-only-password";
const A = "ns-a";
const B = "ns-b";

function urlFor(user?: string): string {
  const u = new URL(ADMIN_URL!);
  if (user) {
    u.username = user;
    u.password = PASSWORD;
  }
  u.pathname = `/${DB}`;
  return u.toString();
}

describe.skipIf(!ADMIN_URL)("RLS as a non-superuser owner + least-privilege login role", () => {
  let admin: DbClient;
  let owner: DbClient;
  let app: DbClient;

  beforeAll(async () => {
    admin = createClient(ADMIN_URL);
    const [{ exists }] = await admin`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vfs_app') AS exists`;
    if (exists) throw new Error("needs a fresh cluster: role vfs_app already exists");

    // Mirror a managed-Postgres owner: LOGIN + CREATEROLE, no superuser, owns the database.
    await admin.unsafe(`CREATE ROLE ${OWNER} LOGIN CREATEROLE PASSWORD '${PASSWORD}'`);
    await admin.unsafe(`CREATE DATABASE ${DB} OWNER ${OWNER}`);
    const dbAdmin = createClient(urlFor());
    // Providers pre-install extensions for the owner; schema.sql's IF NOT EXISTS then no-ops.
    await dbAdmin.unsafe("CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;");
    await dbAdmin.unsafe(`GRANT CREATE ON SCHEMA public TO ${OWNER}`);
    await dbAdmin.end();

    owner = createClient(urlFor(OWNER));
    await owner.unsafe(schema);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
      await admin.unsafe(`DROP ROLE IF EXISTS ${APP}`);
      await admin.unsafe(`DROP ROLE IF EXISTS vfs_app`);
      await admin.unsafe(`DROP ROLE IF EXISTS ${OWNER}`);
      await admin.end();
    }
  });

  test("the migrating owner can SET ROLE vfs_app after running schema.sql", async () => {
    const [{ who }] = await withTenant(owner, A, (tx) => tx`SELECT current_user AS who`);
    expect(who).toBe("vfs_app");
  });

  test("schema.sql is idempotent when re-run by the same owner", async () => {
    await owner.unsafe(schema);
    const [{ who }] = await withTenant(owner, A, (tx) => tx`SELECT current_user AS who`);
    expect(who).toBe("vfs_app");
  });

  test("a NOINHERIT login role granted only SET on vfs_app works through withTenant", async () => {
    await owner.unsafe(`CREATE ROLE ${APP} LOGIN NOINHERIT PASSWORD '${PASSWORD}'`);
    await owner.unsafe(`GRANT vfs_app TO ${APP} WITH INHERIT FALSE, SET TRUE`);
    app = createClient(urlFor(APP));

    const fsA = new PostgresFs(app, A);
    await fsA.writeFile("/a.txt", "tenant A");
    expect(await fsA.readFile("/a.txt")).toBe("tenant A");

    const fsB = new PostgresFs(app, B);
    await fsB.writeFile("/b.txt", "tenant B");
    expect(await fsA.exists("/b.txt")).toBe(false);

    const visibleToA = await withTenant(app, A, (tx) => tx`SELECT tenant_id FROM vfs_files`);
    expect(visibleToA.length).toBeGreaterThan(0);
    expect(visibleToA.every((r) => r.tenant_id === A)).toBe(true);
  });

  test("the login role has no table access outside withTenant (fails loudly, not silently)", async () => {
    // postgres.js queries are lazy thenables; wrap so expect().rejects gets a real Promise.
    await expect((async () => await app`SELECT count(*) FROM vfs_files`)()).rejects.toThrow(/permission denied/i);
  });
});
