import { useParams, Link } from "wouter";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import AppShell from "../components/AppShell";
import { useCurrentUser } from "../components/CurrentUserContext";
import EdgeScoreBadge from "../components/EdgeScoreBadge";
import ShareButton from "../components/ShareButton";
import {
  Card,
  ErrorState,
  LoadingSkeleton as UiLoadingSkeleton,
  PageHeader,
  PlayerLink,
  PositionBadge,
  SectionHeader,
  TrendArrow,
} from "../components/ui";
import { dirColor } from "../lib/position-colors";
import {
  usePlayer,
} from "../hooks/use-player";
import type {
  ExposureInfo,
  Mention,
  OwnershipEntry,
  PlayerDetail as PD,
  PlayerSummary,
  PlayerTradeComp,
  ProspectInfo,
  RecInfo,
} from "@shared/types";
import { useComparables } from "../hooks/use-comparables";
import { useCurrentUsername } from "../hooks/use-current-user";

const ZONE_COLORS: Record<string, string> = {
  Prime: "#f59e0b", Ascent: "#22c55e", Decline: "#f97316", Cliff: "#ef4444", Unknown: "#94a3b8",
};

function agreementColor(agr: "high" | "medium" | "low"): string {
  if (agr === "high") return "#22c55e";
  if (agr === "medium") return "#f59e0b";
  return "#ef4444";
}

function SourceBar({ label, score, max }: { label: string; score: number | null; max: number }) {
  const pct = score != null ? Math.max(2, (score / max) * 100) : 0;
  const color = score != null
    ? score >= 85 ? "#22c55e" : score >= 70 ? "#3b82f6" : score >= 55 ? "#f59e0b" : "#ef4444"
    : "var(--border)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
      <span style={{ width: 32, fontWeight: 700, color: "var(--text-muted)", textAlign: "right" }}>{label}</span>
      <div style={{ flex: 1, background: "var(--dark-base)", borderRadius: 4, height: 12, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
      <span className="font-mono" style={{ width: 32, fontWeight: 700, textAlign: "right", color: score != null ? "var(--text)" : "var(--text-muted)" }}>
        {score != null ? score.toFixed(1) : "N/A"}
      </span>
    </div>
  );
}

function PlayerHeader({ summary }: { summary: PlayerSummary }) {
  const ac = summary.age_curve;
  const subtitle = [
    summary.position,
    summary.team,
    summary.age != null ? `Age ${summary.age} - ${ac.zone}` : null,
  ].filter(Boolean).join(" | ");

  return (
    <>
      <PageHeader title={summary.player_name} subtitle={subtitle} />

      <Card style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <EdgeScoreBadge score={summary.edge_score} size="md" />
          <span style={{ fontSize: 10, fontWeight: 700, color: agreementColor(summary.source_agreement) }}>
            {summary.source_agreement === "high" ? "Sources Agree" : summary.source_agreement === "medium" ? "Mixed" : "Sources Disagree"}
          </span>
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
            {summary.sources_available}/3 sources
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 200, maxWidth: 400, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {summary.position && <PositionBadge position={summary.position} />}
            {summary.team && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{summary.team}</span>}
            {summary.age != null && (
              <span style={{ fontSize: 12, fontWeight: 700, color: ZONE_COLORS[ac.zone] ?? "#94a3b8" }}>
                Age {summary.age} - {ac.zone}
              </span>
            )}
          </div>
          <SourceBar label="FC" score={summary.fc_score} max={99} />
          <SourceBar label="KTC" score={summary.ktc_score} max={99} />
          <SourceBar label="FP" score={summary.dp_score} max={99} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          {summary.dynasty_value != null && (
            <span className="font-mono" style={{ fontSize: 22, fontWeight: 800, color: "var(--amber)" }}>
              {summary.dynasty_value.toLocaleString()}
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TrendArrow value={summary.trend_30day} />
            {summary.overall_rank != null && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                FC Rank #{summary.overall_rank}
              </span>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}

function ExposureSection({ exposure, ownership, username }: { exposure: ExposureInfo; ownership: OwnershipEntry[]; username: string }) {
  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
        You own this player in{" "}
        <span style={{ color: "var(--amber)", fontWeight: 800 }}>{exposure.owned_leagues}</span>
        /{exposure.total_leagues} leagues ({exposure.exposure_pct}%)
      </div>
      {ownership.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {ownership.map((l) => (
            <Link
              key={l.league_id}
              href={`/trade-finder/${encodeURIComponent(username)}?league=${encodeURIComponent(l.league_id)}`}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                background: "rgba(96,165,250,0.12)",
                color: "var(--blue)",
                border: "1px solid rgba(96,165,250,0.2)",
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              {l.league_name}
            </Link>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Not on any of your rosters</div>
      )}
    </Card>
  );
}

function ValueChart({ data }: { data: PD["valueHistory"] }) {
  if (data.length === 0) return null;
  const formatted = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: d.value,
  }));

  return (
    <Card style={{ padding: "16px 12px 8px" }}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={formatted}>
          <CartesianGrid stroke="rgba(35,41,54,0.2)" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 10 }} tickLine={false} />
          <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} tickLine={false} width={45} />
          <Tooltip
            contentStyle={{ background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
            labelStyle={{ color: "var(--text-muted)" }}
            itemStyle={{ color: "var(--amber)" }}
          />
          <Line type="monotone" dataKey="value" stroke="var(--amber)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

function MentionCard({ m }: { m: Mention }) {
  const sentimentColor =
    m.sentiment === "positive" ? "var(--green)" : m.sentiment === "negative" ? "var(--red)" : "var(--text-muted)";
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {m.source && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--blue)" }}>{m.source}</span>}
        {m.sentiment && (
          <span style={{ fontSize: 10, fontWeight: 600, color: sentimentColor, textTransform: "uppercase" }}>
            {m.sentiment}
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
          {new Date(m.mention_date).toLocaleDateString()}
        </span>
      </div>
      {m.article_title && (
        <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>{m.article_title}</div>
      )}
      {m.key_quote && (
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "4px 0 0", fontStyle: "italic", lineHeight: 1.5 }}>
          &ldquo;{m.key_quote}&rdquo;
        </p>
      )}
    </Card>
  );
}

function MentionsSection({ mentions }: { mentions: Mention[] }) {
  if (mentions.length === 0) {
    return (
      <Card className="edge-state-card">
        <p>No newsletter mentions yet.</p>
      </Card>
    );
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {mentions.map((m, i) => (
        <MentionCard key={`${m.mention_date}-${i}`} m={m} />
      ))}
    </div>
  );
}

function ProspectSection({ prospect: p }: { prospect: ProspectInfo }) {
  return (
    <Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
        {p.school && <Field label="School" value={p.school} />}
        {p.tier && <Field label="Tier" value={p.tier.toUpperCase()} />}
        {p.consensus_comp && <Field label="Comp" value={p.consensus_comp} />}
        {p.draft_capital && <Field label="Draft Capital" value={p.draft_capital} />}
      </div>
      {p.key_strengths && p.key_strengths.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 }}>
            STRENGTHS
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            {p.key_strengths.map((s) => (
              <span
                key={s}
                style={{
                  padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: "rgba(74,222,128,0.12)", color: "var(--green)",
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {p.notes && (
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "10px 0 0", lineHeight: 1.5 }}>
          {p.notes}
        </p>
      )}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 }}>
        {label.toUpperCase()}
      </span>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function RecSection({ rec }: { rec: RecInfo }) {
  const color = dirColor(rec.direction);
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            padding: "4px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700, letterSpacing: 0.8,
            background: `color-mix(in srgb, ${color} 15%, transparent)`, color,
          }}
        >
          {rec.direction.toUpperCase()}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {new Date(rec.rec_date).toLocaleDateString()}
        </span>
        {rec.fc_at_rec != null && (
          <span className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--amber)", marginLeft: "auto" }}>
            FC {rec.fc_at_rec.toLocaleString()}
          </span>
        )}
      </div>
      {rec.rationale && (
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "10px 0 0", lineHeight: 1.5 }}>
          {rec.rationale}
        </p>
      )}
    </Card>
  );
}

function TradeComps({ trades }: { trades: PlayerTradeComp[] }) {
  if (trades.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {trades.map((t) => (
        <Card
          key={t.trade_id}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{t.league_name}</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>{t.date}</span>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", marginBottom: 4, letterSpacing: 0.5 }}>GAVE</div>
              {t.gave.map((a, i) => (
                <div key={i} style={{ color: "var(--text-dim)", padding: "1px 0" }}>{a}</div>
              ))}
              {t.gave.length === 0 && <div style={{ color: "var(--text-muted)" }}>-</div>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", marginBottom: 4, letterSpacing: 0.5 }}>RECEIVED</div>
              {t.received.map((a, i) => (
                <div key={i} style={{ color: "var(--text-dim)", padding: "1px 0" }}>{a}</div>
              ))}
              {t.received.length === 0 && <div style={{ color: "var(--text-muted)" }}>-</div>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function QuickActions({ playerName, playerId }: { playerName: string; playerId: string | null }) {
  const { username } = useCurrentUser();
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {username && (
        <Link href={`/trade-finder/${encodeURIComponent(username)}?mode=shop&player=${encodeURIComponent(playerId ?? "")}`}>
          <button
            className="edge-primary-button"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            Find trades involving {playerName}
          </button>
        </Link>
      )}
      <Link href="/trade-calculator">
        <button className="edge-primary-button">
          Open Trade Calculator
        </button>
      </Link>
    </div>
  );
}

export default function PlayerDetail() {
  const { playerName } = useParams<{ playerName: string }>();
  const decoded = playerName ? decodeURIComponent(playerName) : undefined;
  const { username } = useCurrentUsername();
  const { data, isLoading, error } = usePlayer(decoded, username);
  const { data: comparables } = useComparables(decoded);

  if (isLoading) {
    return (
      <AppShell>
        <PageHeader title={decoded ?? "Player"} subtitle="Loading player profile." />
        <UiLoadingSkeleton label="Loading player profile" rows={5} />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <PageHeader title={decoded ?? "Player"} />
        <ErrorState
          title="Could not load player"
          message={error ? (error as Error).message : "Player not found"}
        />
      </AppShell>
    );
  }

  const shareText = `[The Edge] ${data.summary.player_name} (${data.summary.position})\nEdge Score: ${Math.round(data.summary.edge_score)} | FC: ${data.summary.fc_score ?? "N/A"} | KTC: ${data.summary.ktc_score ?? "N/A"} | FP: ${data.summary.dp_score ?? "N/A"}\nAge: ${data.summary.age ?? "?"} (${data.summary.age_curve.zone})`;

  return (
    <AppShell>
      <PlayerHeader summary={data.summary} />

      <div style={{ marginBottom: 16 }}>
        <ShareButton textSummary={shareText} />
      </div>

      <SectionHeader icon="Own" title="EXPOSURE" subtitle="Your ownership across leagues" />
      <ExposureSection exposure={data.exposure} ownership={data.ownership} username={username} />

      <SectionHeader icon="Val" title="VALUE HISTORY" subtitle="FantasyCalc dynasty value (90 days)" />
      <ValueChart data={data.valueHistory} />

      <SectionHeader icon="Go" title="QUICK ACTIONS" subtitle="" />
      <QuickActions playerName={data.summary.player_name} playerId={data.summary.player_id} />

      {comparables && comparables.length > 0 && (
        <>
          <SectionHeader icon="Sim" title="SIMILAR PLAYERS" subtitle="Comparable edge scores at same position" />
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {comparables.map((c) => (
              <div
                key={c.player_name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 13,
                }}
              >
                <EdgeScoreBadge score={c.edge_score} size="sm" />
                <PlayerLink name={c.player_name} style={{ flex: 1 }} />
                <PositionBadge position={c.position} />
                {c.team && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{c.team}</span>}
                {c.age != null && <span style={{ color: "var(--text-dim)", fontSize: 11 }}>Age {c.age}</span>}
              </div>
            ))}
          </Card>
        </>
      )}

      {data.recent_trades && data.recent_trades.length > 0 && (
        <>
          <SectionHeader icon="Trd" title="RECENT TRADES" subtitle="Completed trades involving this player" />
          <TradeComps trades={data.recent_trades} />
        </>
      )}

      {data.mentions.length > 0 && (
        <>
          <SectionHeader icon="News" title="NEWSLETTER INTEL" subtitle="Recent mentions" />
          <MentionsSection mentions={data.mentions} />
        </>
      )}
      {data.prospect && (
        <>
          <SectionHeader icon="Pros" title="PROSPECT PROFILE" subtitle="Draft scouting report" />
          <ProspectSection prospect={data.prospect} />
        </>
      )}
      {data.recommendation && (
        <>
          <SectionHeader icon="Rec" title="CURRENT REC" subtitle="Latest recommendation" />
          <RecSection rec={data.recommendation} />
        </>
      )}
    </AppShell>
  );
}
