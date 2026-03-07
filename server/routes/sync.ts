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

    const { jobId, alreadyRunning } = await startSync(username, { force });
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

    const { syncJob } = await checkSyncStatus(username);
    if (!syncJob) {
      return res.json({ status: "not_started" });
    }

    res.json({
      job_id: syncJob.job_id,
      status: syncJob.status,
      step: syncJob.step,
      detail: syncJob.detail,
      leagues_total: syncJob.leagues_total,
      leagues_done: syncJob.leagues_done,
      error: syncJob.error,
    });
  } catch (err) {
    console.error("[sync] Error checking status:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
