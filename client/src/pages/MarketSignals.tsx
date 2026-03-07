import { useState, useMemo } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
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
          {sig.fc_score != null && <span>FC: {sig.fc_score.toFixed(1)}</span>}
          {sig.ktc_score != null && <span>KTC: {sig.ktc_score.toFixed(1)}</span>}
          {sig.fp_score != null && <span>FP: {sig.fp_score.toFixed(1)}</span>}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
        {sig.reason}
      </div>
    </div>
  );
}

// ─── Clickable Stat Card ───

function ClickableStatCard({ label, value, accent, active, onClick }: {
  label: string; value: number; accent: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "var(--card)",
        border: active ? `2px solid ${accent}` : "1px solid var(--border)",
        borderRadius: 10, padding: "20px 24px", flex: 1, minWidth: 140,
        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        outline: active ? `1px solid ${accent}` : "none",
      }}
    >
      <div className="label" style={{ marginBottom: 8 }}>{label}</div>
      <div className="font-mono" style={{ fontSize: 28, fontWeight: 800, color: accent }}>{value}</div>
    </button>
  );
}

// ─── Signal Explainer ───

const SIGNAL_EXPLAINERS: { key: string; label: string; color: string; text: string }[] = [
  { key: "SMART_MONEY_BUY", label: "Smart Money Buy", color: "#16a34a",
    text: "Real trade values (FantasyCalc) are significantly higher than crowd sentiment (KTC). Managers are actually paying more for this player than the community thinks they're worth. The crowd tends to catch up to real trade data over time. Consider buying before they do." },
  { key: "HYPE_SELL", label: "Hype Sell", color: "#dc2626",
    text: "Crowd sentiment (KTC) is significantly higher than real trade values (FantasyCalc). The community thinks this player is worth more than what managers are actually paying in trades. Sell into the hype before real values pull crowd sentiment down." },
  { key: "EXPERT_BUY", label: "Expert Buy", color: "#7c3aed",
    text: "Top analyst rankings (FP-Elite) are significantly higher than crowd sentiment (KTC). The best analysts see something the average dynasty manager doesn't. Expert consensus tends to predict future value shifts. Buy before the crowd catches on." },
  { key: "EXPERT_FADE", label: "Expert Fade", color: "#ea580c",
    text: "Top analyst rankings (FP-Elite) are significantly lower than crowd sentiment and trade values. The experts are fading this player while the market still values them highly. Consider selling before the market follows the expert view." },
  { key: "CONSENSUS_LOCK", label: "Locked Value", color: "#64748b",
    text: "All sources agree within a few points. This player is fairly priced by everyone. Don't overpay in trades and don't sell cheap. Focus your trade energy on disagreement players where you can find value." },
];

function SignalExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
          color: "var(--text-dim)", fontSize: 12, fontWeight: 600, padding: 0,
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <span>{open ? "\u25BC" : "\u25B6"}</span>
        What do these signals mean?
      </button>
      {open && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
          {SIGNAL_EXPLAINERS.map((s) => (
            <div key={s.key} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span className="font-mono" style={{
                background: s.color, color: "#fff", padding: "2px 8px",
                borderRadius: 4, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", marginTop: 2,
              }}>
                {s.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{s.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Filters ───

type FilterType = "all" | "buys" | "sells" | "locked" | "mine";
type SignalFilter = SignalType | null;
type SortType = "strength" | "edge" | "name";

// ─── Page ───

export default function MarketSignals() {
  const { username } = useParams<{ username: string }>();
  const [filter, setFilter] = useState<FilterType>("all");
  const [signalFilter, setSignalFilter] = useState<SignalFilter>(null);
  const [sort, setSort] = useState<SortType>("strength");

  const isMine = filter === "mine";
  const { data, isLoading, error } = useMarketSignals(isMine ? username : undefined);

  // When a stat card is clicked, clear the filter-bar filter and set signal-type filter (or toggle off)
  function handleStatClick(signal: SignalType) {
    if (signalFilter === signal) {
      setSignalFilter(null);
    } else {
      setSignalFilter(signal);
      setFilter("all");
    }
  }

  // When a filter-bar button is clicked, clear any stat-card filter
  function handleFilterClick(f: FilterType) {
    setFilter(f);
    setSignalFilter(null);
  }

  const signals = useMemo(() => {
    let items = data ?? [];

    // Direct signal-type filter from stat cards takes priority
    if (signalFilter) {
      items = items.filter((s) => s.signal === signalFilter);
    } else if (filter === "buys") {
      items = items.filter((s) => s.action === "BUY");
    } else if (filter === "sells") {
      items = items.filter((s) => s.action === "SELL");
    } else if (filter === "locked") {
      items = items.filter((s) => s.signal === "CONSENSUS_LOCK");
    }

    // Sort
    if (sort === "edge") items = [...items].sort((a, b) => b.edge_score - a.edge_score);
    else if (sort === "name") items = [...items].sort((a, b) => a.full_name.localeCompare(b.full_name));
    // default "strength" is already sorted from API

    return items;
  }, [data, filter, signalFilter, sort]);

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
          {/* Stat Cards — clickable to filter */}
          <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
            <ClickableStatCard label="Smart Money Buys" value={counts.smartMoney} accent="#16a34a" active={signalFilter === "SMART_MONEY_BUY"} onClick={() => handleStatClick("SMART_MONEY_BUY")} />
            <ClickableStatCard label="Hype Sells" value={counts.hype} accent="#dc2626" active={signalFilter === "HYPE_SELL"} onClick={() => handleStatClick("HYPE_SELL")} />
            <ClickableStatCard label="Expert Buys" value={counts.expert} accent="#7c3aed" active={signalFilter === "EXPERT_BUY"} onClick={() => handleStatClick("EXPERT_BUY")} />
            <ClickableStatCard label="Locked Values" value={counts.locked} accent="#64748b" active={signalFilter === "CONSENSUS_LOCK"} onClick={() => handleStatClick("CONSENSUS_LOCK")} />
          </div>

          {/* Signal Explainer */}
          <SignalExplainer />

          {/* Filter Bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 20,
            flexWrap: "wrap",
          }}>
            {(["all", "buys", "sells", "locked", "mine"] as FilterType[]).map((f) => {
              const isActive = filter === f && signalFilter === null;
              return (
                <button
                  key={f}
                  onClick={() => handleFilterClick(f)}
                  style={{
                    background: isActive ? "var(--amber)" : "var(--card)",
                    color: isActive ? "var(--dark-base)" : "var(--text-muted)",
                    border: "1px solid var(--border)", borderRadius: 6,
                    padding: "6px 14px", fontSize: 12, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {f === "all" ? "All" : f === "buys" ? "Buys" : f === "sells" ? "Sells" : f === "locked" ? "Locked" : "My Players"}
                </button>
              );
            })}

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
