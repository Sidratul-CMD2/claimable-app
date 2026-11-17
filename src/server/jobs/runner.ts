/** Runs due jobs with per-job time limits. Used by the worker, the cron endpoint and admin "run now". */
import { handlers } from "./handlers";
import { claimDueJobs, finishJob, type JobOutcome } from "./queue";

export interface RunSummary {
  jobId: string;
  kind: string;
  status: JobOutcome["status"];
  message?: string;
}

export async function runDueJobs(opts: { workerId: string; limit?: number; onlyJobId?: string; timeBudgetMs?: number }): Promise<RunSummary[]> {
  const deadline = Date.now() + (opts.timeBudgetMs ?? Number.POSITIVE_INFINITY);
  const jobs = await claimDueJobs(opts.workerId, opts.limit ?? 10, opts.onlyJobId);
  const summary: RunSummary[] = [];
  for (const job of jobs) {
    const startedAt = new Date();
    let outcome: JobOutcome;
    if (Date.now() > deadline) {
      outcome = { status: "skipped", message: "Time budget exhausted; will run next tick", nextIntervalMinutes: 1 };
    } else {
      const handler = handlers[job.kind];
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        outcome = await Promise.race([
          handler(job),
          new Promise<JobOutcome>((resolve) => {
            timer = setTimeout(() => resolve({ status: "timeout", message: `Exceeded ${job.timeoutSeconds}s limit`, retry: true }), job.timeoutSeconds * 1000);
          }),
        ]);
      } catch (error) {
        console.error(`[jobs] ${job.kind} ${job.targetId ?? ""} crashed`, error);
        outcome = { status: "failure", message: (error as Error)?.message ?? "Unknown error", retry: true };
      } finally {
        clearTimeout(timer);
      }
    }
    await finishJob(job, startedAt, outcome);
    summary.push({ jobId: job.id, kind: job.kind, status: outcome.status, message: outcome.message });
  }
  return summary;
}

/**
 * Runs due jobs batch after batch until none are left or the time budget is spent. Used by the
 * cron endpoint, where a host such as Vercel Hobby may only call it once a day, so one call has to
 * cover the whole queue. Retried failures back off for at least five minutes, so a job does not
 * run twice within one call.
 */
export async function drainDueJobs(opts: { workerId: string; timeBudgetMs: number; batchSize?: number }): Promise<RunSummary[]> {
  const deadline = Date.now() + opts.timeBudgetMs;
  const batchSize = opts.batchSize ?? 10;
  const summary: RunSummary[] = [];
  while (Date.now() < deadline) {
    const batch = await runDueJobs({ workerId: opts.workerId, limit: batchSize, timeBudgetMs: deadline - Date.now() });
    summary.push(...batch);
    if (batch.length < batchSize) break;
  }
  return summary;
}
