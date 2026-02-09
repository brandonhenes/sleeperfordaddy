import { eq, desc } from "drizzle-orm";
import { db } from "../connection.js";
import { sync_jobs } from "../schema.js";

export async function createSyncJob(jobId: string, username: string) {
  await db.insert(sync_jobs).values({
    job_id: jobId,
    username: username.toLowerCase(),
    status: "running",
    step: "starting",
    leagues_total: 0,
    leagues_done: 0,
    started_at: Date.now(),
    updated_at: Date.now(),
  });
}

export async function updateSyncJob(
  jobId: string,
  updates: {
    status?: string;
    step?: string;
    detail?: string;
    leagues_total?: number;
    leagues_done?: number;
    error?: string;
  }
) {
  await db
    .update(sync_jobs)
    .set({ ...updates, updated_at: Date.now() })
    .where(eq(sync_jobs.job_id, jobId));
}

export async function getLatestSyncJob(username: string) {
  const rows = await db
    .select()
    .from(sync_jobs)
    .where(eq(sync_jobs.username, username.toLowerCase()))
    .orderBy(desc(sync_jobs.started_at))
    .limit(1);
  return rows[0] ?? null;
}
