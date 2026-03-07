import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOverview, useStartSync, useSyncStatus } from "./use-sleeper";

export type EnsurePhase = "idle" | "checking" | "syncing" | "ready" | "error";

interface EnsureUserResult {
  /** Current phase of the check/sync flow */
  phase: EnsurePhase;
  /** Progress info while syncing */
  syncProgress: { done: number; total: number } | null;
  /** Error message if phase is "error" */
  errorMsg: string;
  /** Manually retry the flow */
  retry: () => void;
}

/**
 * Shared hook: ensures a Sleeper user's data is synced before any page loads.
 *
 * Flow:
 * 1. Check if overview data exists for the username
 * 2. If yes → phase = "ready"
 * 3. If no → trigger sync → poll until done → phase = "ready"
 *
 * Used by Landing, Dashboard, and any other page that needs user data.
 */
export function useEnsureUser(username: string | undefined): EnsureUserResult {
  const [phase, setPhase] = useState<EnsurePhase>(username ? "checking" : "idle");
  const [errorMsg, setErrorMsg] = useState("");
  const syncTriggered = useRef(false);
  const queryClient = useQueryClient();

  // Step 1: Try loading overview (quick existence check)
  const overview = useOverview(phase === "checking" && !!username ? username : undefined);

  // Transition from idle to checking when username is set
  useEffect(() => {
    if (username && phase === "idle") {
      syncTriggered.current = false;
      setPhase("checking");
    }
    if (!username) {
      setPhase("idle");
    }
  }, [username, phase]);

  // Step 2: Sync mutation
  const sync = useStartSync();

  // Step 3: Poll sync status while syncing
  const syncStatus = useSyncStatus(username, phase === "syncing");

  // Handle overview result
  useEffect(() => {
    if (phase !== "checking" || !username) return;

    if (overview.data && overview.data.totals?.leagues > 0) {
      // User data exists with actual leagues — we're good
      setPhase("ready");
      return;
    }

    if ((overview.error || (overview.data && overview.data.totals?.leagues === 0)) && !syncTriggered.current) {
      // User data doesn't exist — kick off sync
      syncTriggered.current = true;
      setPhase("syncing");
      sync.mutate({ username }, {
        onError: (err) => {
          setPhase("error");
          setErrorMsg(err.message);
        },
      });
    }
  }, [phase, username, overview.data, overview.error, sync]);

  // Handle sync completion
  useEffect(() => {
    if (phase !== "syncing" || !syncStatus.data) return;

    const s = syncStatus.data.status;
    if (s === "done" || s === "complete" || s === "completed") {
      // Invalidate all queries so pages refetch with fresh data
      queryClient.invalidateQueries();
      setPhase("ready");
    } else if (s === "error" || s === "failed") {
      setPhase("error");
      setErrorMsg(syncStatus.data.error || "Sync failed");
    }
  }, [phase, syncStatus.data, queryClient]);

  // Sync progress
  const syncProgress =
    phase === "syncing" &&
    syncStatus.data?.leagues_done != null &&
    syncStatus.data?.leagues_total
      ? { done: syncStatus.data.leagues_done, total: syncStatus.data.leagues_total }
      : null;

  // Retry handler
  const retry = useCallback(() => {
    syncTriggered.current = false;
    setErrorMsg("");
    setPhase("checking");
    if (username) {
      queryClient.invalidateQueries({ queryKey: ["overview", username] });
      queryClient.invalidateQueries({ queryKey: ["syncStatus", username] });
    }
  }, [username, queryClient]);

  return { phase, syncProgress, errorMsg, retry };
}
