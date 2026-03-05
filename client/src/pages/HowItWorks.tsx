import AppShell from "../components/AppShell";

const sectionStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "20px 24px",
};

const h2: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  margin: "0 0 10px",
  color: "var(--amber)",
};

const p: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text-dim)",
  margin: "0 0 8px",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle}>
      <h2 style={h2}>{title}</h2>
      {children}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>
          {headers.map((h) => (
            <th
              key={h}
              style={{
                textAlign: "left",
                padding: "6px 10px",
                borderBottom: "1px solid var(--border)",
                color: "var(--text-muted)",
                fontWeight: 600,
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td
                key={j}
                style={{
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--border)",
                  color: j === 0 ? "var(--text)" : "var(--text-dim)",
                  fontWeight: j === 0 ? 600 : 400,
                }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function HowItWorks() {
  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>How It Works</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Understanding Edge Scores and how The Edge values dynasty assets
        </p>
      </div>

      <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
        <Section title="What is an Edge Score?">
          <p style={p}>
            An Edge Score is a composite dynasty value rating on a <strong style={{ color: "var(--text)" }}>39-99 scale</strong>.
            It blends data from three independent sources to give you a single, trustworthy number
            for every player and draft pick.
          </p>
          <p style={p}>
            Higher scores mean more dynasty value. A score of 99 represents the most valuable assets
            in the game (e.g. elite young QBs in superflex). A score below 50 indicates a low-value
            depth piece.
          </p>
        </Section>

        <Section title="The 3 Sources">
          <Table
            headers={["Source", "Type", "What It Measures"]}
            rows={[
              ["FantasyCalc (FC)", "Market / Crowdsourced", "Real user trade values aggregated from thousands of dynasty trades. Reflects what managers are actually paying."],
              ["KeepTradeCut (KTC)", "Market / Crowdsourced", "Community voting on player values. Large sample size gives a crowd-consensus view of dynasty worth."],
              ["DynastyProcess / FP (DP)", "Model / ECR-based", "Expert consensus rankings converted to values. Captures analyst opinion and projected production."],
            ]}
          />
          <p style={{ ...p, marginTop: 10 }}>
            Each source uses different scales. We normalize to 0-99 using percentile ranking within
            each source, then blend the scores together. This means a player ranked in the 80th
            percentile on all three sources will score around 80, regardless of the raw values each
            source uses.
          </p>
        </Section>

        <Section title="Source Agreement">
          <p style={p}>
            When multiple sources agree on a player's value, you can be more confident in the Edge Score.
            When they disagree, it signals opportunity or uncertainty.
          </p>
          <Table
            headers={["Agreement", "Criteria", "What It Means"]}
            rows={[
              ["High", "Sources within 5 points", "Strong consensus. The score is reliable."],
              ["Medium", "Sources 5-12 points apart", "Some disagreement. Worth investigating why."],
              ["Low", "Sources 12+ points apart", "Major disagreement. One source sees something others don't — could be a buy or sell signal."],
            ]}
          />
        </Section>

        <Section title="Archetypes">
          <p style={p}>
            Each team is classified into an archetype based on their power ranking, draft capital,
            and championship window scores.
          </p>
          <Table
            headers={["Archetype", "Criteria"]}
            rows={[
              ["Dynasty Juggernaut", "Top power + strong window. The team to beat now and later."],
              ["All-In Contender", "High power, low draft capital. Going for it with no safety net."],
              ["Fragile Contender", "Good power, declining window. Competitive but aging."],
              ["Productive Struggle", "Below-average power, strong window + draft capital. Building correctly."],
              ["Rebuilder", "Low power, high draft capital. Stockpiling for the future."],
              ["Dead Zone", "Low power, low draft capital, weak window. Stuck with no clear path."],
              ["Competitor", "Middle of the pack across all metrics. Average but stable."],
            ]}
          />
        </Section>

        <Section title="Age Curve Zones">
          <p style={p}>
            Every player sits on a positional age curve that affects their dynasty trajectory.
          </p>
          <Table
            headers={["Zone", "Meaning"]}
            rows={[
              ["Ascent", "Player is approaching peak value. Dynasty stock trending up."],
              ["Prime", "At or near peak production years. Maximum current value."],
              ["Decline", "Past peak but still productive. Value trending down gradually."],
              ["Cliff", "Significant age-related risk. Value likely to drop sharply."],
            ]}
          />
        </Section>
      </div>
    </AppShell>
  );
}
