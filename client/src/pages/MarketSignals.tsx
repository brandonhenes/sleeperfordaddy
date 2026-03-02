import { useState, useMemo } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import { StatCard } from "../components/ui";
import EdgeScoreBadge from "../components/EdgeScoreBadge";
import { posColor } from "../lib/position-colors";
import {
  useMarketSignals,
  type MarketSignal,
  type SignalType,
} from "../hooks/use-market-signals";

// ─── Signal Badge ───

const SIGNAL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  SMART_MONEY_BUY: { bg: "#16a34a", text: "#fff", label: "Smart Money Buy" },
  HYPE_SELL:       { bg: "#dc2626", text: "#fff", label: "Hype Sell" },
  EXPERT_BUY:      { bg: "#7c3aed", text: "#fff", label: "Expert Buy" },
  EXPERT_FADE:     { bg: "#ea580c", text: "#fff", label: "Expert Fade" },
  CONSENSUS_LOCK:  { bg: "#64748b", text: "#fff", label: "Locked Value" },
};

function SignalBadge({ signal }: { signal: SignalType }) {
  const s = SIGNAL_STYLES[signal] ?? SIGNAL_STYLES.CONSENSUS_LOCK;
  return (
    <span
      className="font-mono"
      style={{
        background: s.bg, color: s.text, padding: "3px 10px",
        borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

// ─── Strength Bar ───

function StrengthBar({ value }: { value: number }) {
  const color = value >= 70 ? "var(--green)" : value >= 50 ? "var(--amber)" : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 80 }}>
      <div style={{ flex: 1, background: "var(--dark-base)", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <span className="font-mono" style={{ fontSize: 10, color: "var(--text-dim)", width: 20, textAlign: "right" }}>{value}</span>
    </div>
  );
}

// ─── Signal Card ───

function SignalCard({ sig }: { sig: MarketSignal }) {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "14px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <EdgeScoreBadge score={sig.edge_score} size="md" />
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{sig.full_name}</span>
        <span style={{ color: posColor(sig.position), fontWeight: 700, fontSize: 11 }}>{sig.position}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{sig.team}</span>
        <SignalBadge signal={sig.signal} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <StrengthBar value={sig.signal_strength} />
        </div>
        <div className="font-mono" style={{ fontSize: 10, color: "var(--text-dim)", display: "flex", gap: 12 }}>
          {sig.fc_score != null && <span>FC: {sig.fc_score}</span>}
          {sig.ktc_score != null && <span>KTC: {sig.ktc_score}</span>}
          {sig.fp_score != null && <span>FP: {sig.fp_score}</span>}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
        {sig.reason}
      </div>
    </div>
  );
}

// ─── Filters ───

type FilterType = "all" | "buys" | "sells" | "locked" | "mine";
type SortType = "strength" | "edge" | "name";

// ─── Page ───

export default function MarketSignals() {
  const { username } = useParams<{ username: string }>();
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("strength");

  const isMine = filter === "mine";
  const { data, isLoading, error } = useMarketSignals(isMine ? username : undefined);

  const signals = useMemo(() => {
    let items = data ?? [];

    // Filter by signal type
    if (filter === "buys") items = items.filter((s) => s.action === "BUY");
    else if (filter === "sells") items = items.filter((s) => s.action === "SELL");
    else if (filter === "locked") items = items.filter((s) => s.signal === "CONSENSUS_LOCK");

    // Sort
    if (sort === "edge") items = [...items].sort((a, b) => b.edge_score - a.edge_score);
    else if (sort === "name") items = [...items].sort((a, b) => a.full_name.localeCompare(b.full_name));
    // default "strength" is already sorted from API

    return items;
  }, [data, filter, sort]);

  // Summary counts
  const counts = useMemo(() => {
    const all = data ?? [];
    return {
      smartMoney: all.filter((s) => s.signal === "SMART_MONEY_BUY").length,
      hype: all.filter((s) => s.signal === "HYPE_SELL").length,
      expert: all.filter((s) => s.signal === "EXPERT_BUY").length,
      locked: all.filter((s) => s.signal === "CONSENSUS_LOCK").length,
    };
  }, [data]);

  if (isLoading) return <AppShell><LoadingSkeleton /></AppShell>;

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Market Signals</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Buy/sell signals from disagreements between FC, KTC, and FP-Elite
        </p>
      </div>

      {error ? (
        <ErrorCard message={(error as Error).message} />
      ) : (
        <>
          {/* Stat Cards */}
          <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
            <StatCard label="Smart Money Buys" value={counts.smartMoney} accent="#16a34a" />
            <StatCard label="Hype Sells" value={counts.hype} accent="#dc2626" />
            <StatCard label="Expert Buys" value={counts.expert} accent="#7c3aed" />
            <StatCard label="Locked Values" value={counts.locked} accent="#64748b" />
          </div>

          {/* Filter Bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 20,
            flexWrap: "wrap",
          }}>
            {(["all", "buys", "sells", "locked", "mine"] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? "var(--amber)" : "var(--card)",
                  color: filter === f ? "var(--dark-base)" : "var(--text-muted)",
                  border: "1px solid var(--border)", borderRadius: 6,
                  padding: "6px 14px", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {f === "all" ? "All" : f === "buys" ? "Buys" : f === "sells" ? "Sells" : f === "locked" ? "Locked" : "My Players"}
              </button>
            ))}

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Sort:</span>
              {(["strength", "edge", "name"] as SortType[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  style={{
                    background: sort === s ? "var(--border)" : "none",
                    color: "var(--text-dim)", border: "none", borderRadius: 4,
                    padding: "4px 10px", fontSize: 11, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {s === "strength" ? "Strength" : s === "edge" ? "Edge Score" : "Name"}
                </button>
              ))}
            </div>
          </div>

          {/* Signal Count */}
          <div style={{ margin: "16px 0 10px", fontSize: 13, color: "var(--text-dim)" }}>
            {signals.length} signal{signals.length !== 1 ? "s" : ""}
          </div>

          {/* Signal List */}
          <div style={{ display: "grid", gap: 10 }}>
            {signals.map((s) => (
              <SignalCard key={s.player_id} sig={s} />
            ))}
          </div>

          {signals.length === 0 && (
            <div style={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 10, padding: 40, textAlign: "center",
              color: "var(--text-muted)", marginTop: 8,
            }}>
              No signals found for this filter
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

// ─── Shared ───

const skel = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10 } as const;

function LoadingSkeleton() {
  return (
    <>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Market Signals</h1>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        {[1, 2, 3, 4].map((i) => <div key={i} className="animate-pulse" style={{ ...skel, flex: 1, minWidth: 120, height: 90 }} />)}
      </div>
      {[1, 2, 3, 4, 5].map((i) => <div key={i} className="animate-pulse" style={{ ...skel, height: 100, marginTop: 10 }} />)}
    </>
  );
}

function ErrorCard({ message }: { message: string }) {
  return <div style={{ ...skel, padding: 40, textAlign: "center", color: "var(--red)" }}>Error: {message}</div>;
}
