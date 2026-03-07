import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { useStartSync, useSyncStatus } from "../hooks/use-sleeper";

interface SourceFreshness {
  last_synced: string | null;
  player_count: number;
}

interface FreshnessData {
  fantasycalc: SourceFreshness;
  ktc: SourceFreshness;
  dynastyprocess: SourceFreshness;
}

function timeAgo(dateStr: string | null): { label: string; color: string } {
  if (!dateStr) return { label: "never", color: "var(--red)" };
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = diff / 3_600_000;
  const days = hours / 24;

  const color = hours < 24 ? "var(--green)" : days < 3 ? "var(--amber)" : "var(--red)";

  if (hours < 1) return { label: `${Math.round(hours * 60)}m ago`, color };
  if (hours < 24) return { label: `${Math.round(hours)}h ago`, color };
  return { label: `${Math.round(days)}d ago`, color };
}

export default function FreshnessBar({
  leagueId,
}: {
  leagueId?: string;
}) {
  const queryClient = useQueryClient();
  const username = useMemo(
    () => (typeof window !== "undefined" ? localStorage.getItem("edge_username") ?? "" : ""),
    []
  );
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const { data } = useQuery<FreshnessData>({
    queryKey: ["freshness"],
    queryFn: () => apiFetch("/api/meta/freshness"),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const startSync = useStartSync();
  const syncStatus = useSyncStatus(username || undefined, syncing && !!username);

  useEffect(() => {
    const data = syncStatus.data;
    const status = data?.status;
    if (!status) return;

    if (status === "running") {
      const done = data?.leagues_done ?? 0;
      const total = data?.leagues_total ?? 0;
      setSyncMessage(total > 0 ? `Syncing ${done}/${total}` : "Syncing...");
      return;
    }

    if (status === "completed" || status === "complete" || status === "done") {
      setSyncing(false);
      setSyncMessage("Synced");
      queryClient.invalidateQueries();
      return;
    }

    if (status === "failed" || status === "error") {
      setSyncing(false);
      setSyncMessage(data?.error || "Sync failed");
    }
  }, [syncStatus.data, queryClient]);

  if (!data) return null;

  const sources = [
    { key: "FC", data: data.fantasycalc },
    { key: "KTC", data: data.ktc },
    { key: "DP", data: data.dynastyprocess },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        flexWrap: "wrap",
        fontSize: 11,
        color: "var(--text-muted)",
        padding: "6px 0",
      }}
    >
      {sources.map((s) => {
        const { label, color } = timeAgo(s.data.last_synced);
        return (
          <span key={s.key}>
            <span style={{ fontWeight: 600 }}>{s.key}:</span>{" "}
            <span style={{ color, fontWeight: 700 }}>{label}</span>
          </span>
        );
      })}
      {username ? (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {syncMessage ? (
            <span style={{ fontWeight: 700, color: syncing ? "var(--amber)" : "var(--text-muted)" }}>
              {syncMessage}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setSyncMessage("");
              setSyncing(true);
              startSync.mutate(
                leagueId
                  ? { username, force: true, leagueId }
                  : { username, force: true, scope: "latest" },
                {
                  onError: (err) => {
                    setSyncing(false);
                    setSyncMessage(err.message || "Sync failed");
                  },
                }
              );
            }}
            disabled={syncing || startSync.isPending}
            style={{
              border: "1px solid rgba(245,158,11,0.3)",
              background: syncing ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.14)",
              color: "var(--amber)",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 700,
              cursor: syncing || startSync.isPending ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              opacity: syncing || startSync.isPending ? 0.7 : 1,
            }}
          >
            {syncing || startSync.isPending
              ? "Resyncing..."
              : leagueId
                ? "Resync League"
                : "Resync Site"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
