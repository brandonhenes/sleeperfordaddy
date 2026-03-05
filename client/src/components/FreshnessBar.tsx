import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

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

export default function FreshnessBar() {
  const { data } = useQuery<FreshnessData>({
    queryKey: ["freshness"],
    queryFn: () => apiFetch("/api/meta/freshness"),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

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
    </div>
  );
}
