/**
 * Runs before `next build` on Vercel (vercel.json buildCommand → `bun run vercel-build`).
 *
 * Production builds bring the hosted database up to date: apply migrations, then load reference
 * data and the researched catalog the first time (while there are no offers). Later builds never
 * re-seed, so offers edited, unpublished or archived in the admin stay as they are.
 *
 * Preview and local builds skip this: previews share the production database and must not
 * migrate it ahead of main.
 */
import { createDb } from "../src/server/db/connection";
import { runMigrations } from "./migrate";

const tag = "[prepare-db]";

async function countOffers(url: string): Promise<number> {
  const db = createDb(url, { max: 1 });
  try {
    const [row] = await db.$client<{ n: number }[]>`select count(*)::int as n from offers`;
    return row?.n ?? 0;
  } finally {
    await db.$client.end();
  }
}

async function main() {
  if (process.env.VERCEL_ENV !== "production") {
    console.log(`${tag} Skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}): only production builds touch the database.`);
    return;
  }
  // Migrations and the seed run outside the connection pooler when Neon provides a direct URL.
  const url = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set. Connect a Postgres database to this Vercel project (Storage) and redeploy.");
  }

  await runMigrations(url);
  console.log(`${tag} Migrations applied.`);

  const existing = await countOffers(url);
  if (existing > 0) {
    console.log(`${tag} Catalog already loaded (${existing} offers); seed skipped.`);
    return;
  }

  console.log(`${tag} No offers yet: loading reference data and the researched catalog…`);
  const seed = Bun.spawnSync(["bun", "scripts/seed.ts"], { env: { ...process.env, DATABASE_URL: url }, stdout: "inherit", stderr: "inherit" });
  const loaded = await countOffers(url);
  // The seed exits non-zero when some offers fail their publish checks; the others are still
  // loaded. Only an empty catalog fails the build.
  if (loaded === 0) throw new Error(`The seed loaded no offers (exit code ${seed.exitCode}).`);
  if (seed.exitCode !== 0) console.warn(`${tag} Seed finished with warnings (exit code ${seed.exitCode}); ${loaded} offers loaded.`);
  else console.log(`${tag} Catalog loaded: ${loaded} offers.`);
}

main().catch((error) => {
  console.error(`${tag} Failed:`, error instanceof Error ? error.message : error);
  process.exit(1);
});
