import type { DbClient } from "./client.js";

/**
 * Run `fn` inside a transaction scoped to one tenant: assume the non-bypassing
 * `vfs_app` role and set the `app.tenant_id` GUC, both transaction-local, so
 * Row-Level Security policies enforce isolation. Role and GUC auto-revert at
 * COMMIT/ROLLBACK, so nothing leaks back onto the pooled connection.
 *
 * `SET LOCAL ROLE vfs_app` uses a hardcoded role identifier (safe — never user
 * input); the tenant value is bind-parameterized.
 */
export function withTenant<T>(
  sql: DbClient,
  tenantId: string,
  fn: (tx: DbClient) => Promise<T>
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE vfs_app`;
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx as unknown as DbClient);
  }) as Promise<T>;
}
