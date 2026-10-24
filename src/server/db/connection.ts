import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** The embedded development database (scripts/db-start.ts). Never used in production. */
export const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:5433/claimable";

export type Db = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql };

/**
 * The database URL for this process. Development and tests fall back to the embedded database;
 * production never does, so a missing DATABASE_URL fails with a clear error instead of trying
 * to reach 127.0.0.1.
 */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is not set. Add your hosted Postgres connection string to the environment " +
        "(on Vercel: Project → Settings → Environment Variables) and redeploy.",
    );
  }
  return DEFAULT_DATABASE_URL;
}

/**
 * libpq options that postgres.js doesn't understand and would otherwise send to the server as
 * settings, which Postgres rejects (Neon's connection strings include `channel_binding=require`).
 */
const CLIENT_ONLY_PARAMS = ["channel_binding", "gssencmode", "sslcert", "sslkey", "sslcrl", "sslpassword", "sslrootcert"];

export function connectionSettings(rawUrl: string) {
  const url = new URL(rawUrl);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  const verifyWithSystemCAs = url.searchParams.get("sslrootcert") === "system";
  const hasSslMode = url.searchParams.has("sslmode");
  for (const param of CLIENT_ONLY_PARAMS) url.searchParams.delete(param);
  // Hosted Postgres requires TLS. An explicit sslmode in the URL is honoured by postgres.js.
  const ssl = verifyWithSystemCAs ? "verify-full" : !hasSslMode && !local ? "require" : null;
  return {
    url: url.toString(),
    ssl,
    // Transaction-mode poolers (Neon's "-pooler" host, PgBouncer) don't keep prepared statements.
    pooled: url.hostname.includes("-pooler.") || url.searchParams.get("pgbouncer") === "true",
  };
}

/** Creates a Drizzle database handle. Scripts and tests call this directly; the app uses `db` from ./index. */
export function createDb(url = databaseUrl(), options: { max?: number } = {}): Db {
  const settings = connectionSettings(url);
  // Each serverless instance holds its own small pool; the provider's pooler fans out from there.
  const serverless = Boolean(process.env.VERCEL);
  const client = postgres(settings.url, {
    ...(settings.ssl ? { ssl: settings.ssl as "require" | "verify-full" } : {}),
    max: options.max ?? (serverless ? 5 : 10),
    idle_timeout: serverless ? 20 : 30,
    connect_timeout: 15,
    prepare: !settings.pooled,
    onnotice: () => {},
  });
  return drizzle({ client, schema, casing: "snake_case" }) as Db;
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
