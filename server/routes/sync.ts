import { Router } from "express";
import { startSync, checkSyncStatus } from "../services/sync.js";
import { getLatestSyncJob } from "../db/queries/sync.js";

const router = Router();

/** POST /api/sync — Start a sync job for a username */
router.post("/api/sync", async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== "string") {
      return res.status(400).json({ message: "username is required" });
    }

    const force = req.body.force === true;

    if (!force) {
      const { needsSync, syncJob } = await checkSyncStatus(username);
      if (!needsSync && syncJob) {
        return res.json({
          job_id: syncJob.job_id,
          status: syncJob.status,
          message: "Sync is fresh or already running",
        });
      }
    }

    const { jobId, alreadyRunning } = await startSync(username);
    res.json({
      job_id: jobId,
      status: alreadyRunning ? "running" : "running",
      message: alreadyRunning ? "Sync already in progress" : "Sync started",
    });
  } catch (err) {
    console.error("[sync] Error starting sync:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/sync/status?username=xxx — Check sync status */
router.get("/api/sync/status", async (req, res) => {
  try {
    const username = req.query.username as string;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }

    const job = await getLatestSyncJob(username);
    if (!job) {
      return res.json({ status: "not_started" });
    }

    res.json({
      job_id: job.job_id,
      status: job.status,
      step: job.step,
      detail: job.detail,
      leagues_total: job.leagues_total,
      leagues_done: job.leagues_done,
      error: job.error,
    });
  } catch (err) {
    console.error("[sync] Error checking status:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
