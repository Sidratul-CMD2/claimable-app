import { createDb, databaseUrl, type Db } from "./connection";

export * from "./connection";

declare global {
  var __claimableDb: Db | undefined;
}

/**
 * Shared connection pool, created on first use from DATABASE_URL (so builds never connect).
 * In production a missing DATABASE_URL throws a clear error here instead of using localhost.
 * Reused across hot reloads in development and across test files.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, property, receiver) {
    globalThis.__claimableDb ??= createDb(databaseUrl());
    const value = Reflect.get(globalThis.__claimableDb, property, receiver);
    return typeof value === "function" ? value.bind(globalThis.__claimableDb) : value;
  },
});

export async function closeDb() {
  if (globalThis.__claimableDb) {
    await globalThis.__claimableDb.$client.end({ timeout: 5 });
    globalThis.__claimableDb = undefined;
  }
}
