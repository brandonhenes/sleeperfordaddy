import { useParams } from "wouter";
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
import { TrendArrow, SectionHeader } from "../components/ui";
import { posColor, dirColor } from "../lib/position-colors";
import {
  usePlayer,
  type PlayerDetail as PD,
  type Mention,
  type ProspectInfo,
  type RecInfo,
  type OwnershipEntry,
} from "../hooks/use-player";

// ─── Header ───

function PlayerHeader({ summary }: { summary: PD["summary"] }) {
  return (
    <div style={{ padding: "28px 0 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>{summary.player_name}</h1>
        {summary.position && (
          <span style={{ fontSize: 14, fontWeight: 700, color: posColor(summary.position) }}>
            {summary.position}
          </span>
        )}
        {summary.team && (
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{summary.team}</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10 }}>
        {summary.dynasty_value != null && (
          <span className="font-mono" style={{ fontSize: 28, fontWeight: 800, color: "var(--amber)" }}>
            {summary.dynasty_value.toLocaleString()}
          </span>
        )}
        <TrendArrow value={summary.trend_30day} />
        {summary.overall_rank != null && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Rank #{summary.overall_rank}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Value Chart ───

function ValueChart({ data }: { data: PD["valueHistory"] }) {
  if (data.length === 0) return null;
  const formatted = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: d.value,
  }));

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 12px 8px" }}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={formatted}>
          <CartesianGrid stroke="rgba(51,65,85,0.2)" strokeDasharray="3 3" />
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
    </div>
  );
}

// ─── Ownership ───

function OwnershipSection({ leagues }: { leagues: OwnershipEntry[] }) {
  if (leagues.length === 0) {
    return <EmptyCard label="You don't own this player in any league" />;
  }
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      {leagues.map((l) => (
        <div
          key={l.league_id}
          style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 14 }}
        >
          {l.league_name}
        </div>
      ))}
    </div>
  );
}

// ─── Mentions ───

function MentionCard({ m }: { m: Mention }) {
  const sentimentColor =
    m.sentiment === "positive" ? "var(--green)" : m.sentiment === "negative" ? "var(--red)" : "var(--text-muted)";
  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
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
          "{m.key_quote}"
        </p>
      )}
    </div>
  );
}

function MentionsSection({ mentions }: { mentions: Mention[] }) {
  if (mentions.length === 0) return <EmptyCard label="No newsletter mentions yet" />;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      {mentions.map((m, i) => (
        <MentionCard key={`${m.mention_date}-${i}`} m={m} />
      ))}
    </div>
  );
}

// ─── Prospect Profile ───

function ProspectSection({ prospect: p }: { prospect: ProspectInfo }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
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
    </div>
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

// ─── Recommendation ───

function RecSection({ rec }: { rec: RecInfo }) {
  const color = dirColor(rec.direction);
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
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
    </div>
  );
}

// ─── Page ───

export default function PlayerDetail() {
  const { playerName } = useParams<{ playerName: string }>();
  const decoded = playerName ? decodeURIComponent(playerName) : undefined;
  const username = typeof window !== "undefined" ? localStorage.getItem("edge_username") ?? "" : "";
  const { data, isLoading, error } = usePlayer(decoded, username);

  if (isLoading) return <AppShell><LoadingSkeleton name={decoded} /></AppShell>;
  if (error || !data) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{decoded ?? "Player"}</h1>
        </div>
        <EmptyCard label={error ? (error as Error).message : "Player not found"} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PlayerHeader summary={data.summary} />
      <SectionHeader num="01" icon="📈" title="VALUE HISTORY" subtitle="Last 90 days" />
      <ValueChart data={data.valueHistory} />
      <SectionHeader num="02" icon="🏠" title="MY OWNERSHIP" subtitle="Leagues where you roster this player" />
      <OwnershipSection leagues={data.ownership} />
      {data.mentions.length > 0 && (
        <>
          <SectionHeader num="03" icon="📰" title="NEWSLETTER INTEL" subtitle="Recent mentions from Dynasty Daily" />
          <MentionsSection mentions={data.mentions} />
        </>
      )}
      {data.prospect && (
        <>
          <SectionHeader num="04" icon="🎓" title="PROSPECT PROFILE" subtitle="Draft scouting report" />
          <ProspectSection prospect={data.prospect} />
        </>
      )}
      {data.recommendation && (
        <>
          <SectionHeader num="05" icon="🎯" title="CURRENT REC" subtitle="Latest newsletter recommendation" />
          <RecSection rec={data.recommendation} />
        </>
      )}
    </AppShell>
  );
}

const skel = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10 } as const;

function LoadingSkeleton({ name }: { name: string | undefined }) {
  return (
    <>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>{name ?? "Loading..."}</h1>
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse" style={{ ...skel, height: i === 1 ? 220 : 120, marginTop: 24 }} />
      ))}
    </>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div style={{ ...skel, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
      {label}
    </div>
  );
}
