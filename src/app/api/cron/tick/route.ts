import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { drainDueJobs } from "@/server/jobs/runner";
import { ensureRecurringJobs } from "@/server/jobs/schedule";

export const dynamic = "force-dynamic";
// 300s is the most Vercel allows on every plan (with Fluid compute, the default for new projects).
export const maxDuration = 300;
// Stop starting new jobs after this, leaving headroom for the job already running.
const TIME_BUDGET_MS = 240_000;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * For serverless hosts: a scheduler calls this with the bearer secret. Vercel Cron (vercel.json)
 * calls it once a day on Hobby; any interval works, because each call drains whatever is due.
 */
async function handle(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRecurringJobs();
  const summary = await drainDueJobs({ workerId: "cron", timeBudgetMs: TIME_BUDGET_MS });
  return NextResponse.json({ ran: summary.length, summary });
}

export const GET = handle;
export const POST = handle;
