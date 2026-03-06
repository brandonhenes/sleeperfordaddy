import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const v = vals[j] ?? "";
      row[headers[j]] = v === "NA" ? "" : v;
    }
    rows.push(row);
  }
  return rows;
}

function num(val: string | undefined): number | null {
  if (!val || val === "" || val === "NA") return null;
  const n = parseFloat(val);
  return Number.isNaN(n) ? null : n;
}

const DP_VALUES_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/values-players.csv";
const DP_ECR_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr_latest.csv";
const COMBINE_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/combine/combine.csv";
const NFL_DRAFT_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv";

export interface ProspectEnrichmentStats {
  dp_values_matched: number;
  ecr_matched: number;
  combine_matched: number;
  landing_spots_filled: number;
  rankings_captured: number;
}

export async function syncProspectEnrichment(): Promise<ProspectEnrichmentStats> {
  console.log("[prospect-enrich] Starting prospect data enrichment...");
  const stats: ProspectEnrichmentStats = {
    dp_values_matched: 0,
    ecr_matched: 0,
    combine_matched: 0,
    landing_spots_filled: 0,
    rankings_captured: 0,
  };

  const prospectRows = await db.execute(sql`
    SELECT LOWER(player_name) AS name FROM prospects_2026
  `);
  const prospectNames = new Set(
    (prospectRows as unknown as { name: string }[]).map((r) => r.name),
  );

  const today = new Date().toISOString().slice(0, 10);

  try {
    console.log("[prospect-enrich] Fetching DynastyProcess values...");
    const resp = await fetch(DP_VALUES_URL);
    if (resp.ok) {
      const rows = parseCSV(await resp.text());
      const rookies = rows.filter((r) => {
        const name = (r.player ?? "").toLowerCase();
        const pos = r.pos ?? "";
        return prospectNames.has(name) && ["QB", "RB", "WR", "TE"].includes(pos);
      });

      for (const r of rookies) {
        const valueSF = num(r.value_2qb);
        const value1QB = num(r.value_1qb);
        const ecrSF = num(r.ecr_2qb);
        const ecr1QB = num(r.ecr_1qb);
        if (valueSF != null || value1QB != null) {
          await db.execute(sql`
            INSERT INTO prospect_rankings_daily
              (player_name, snapshot_date, position, dp_value_sf, dp_value_1qb, dp_ecr_sf, dp_ecr_1qb, source)
            VALUES (${r.player}, ${today}::date, ${r.pos}, ${valueSF}, ${value1QB}, ${ecrSF}, ${ecr1QB}, 'dynastyprocess')
            ON CONFLICT (player_name, snapshot_date) DO UPDATE SET
              dp_value_sf = COALESCE(EXCLUDED.dp_value_sf, prospect_rankings_daily.dp_value_sf),
              dp_value_1qb = COALESCE(EXCLUDED.dp_value_1qb, prospect_rankings_daily.dp_value_1qb),
              dp_ecr_sf = COALESCE(EXCLUDED.dp_ecr_sf, prospect_rankings_daily.dp_ecr_sf),
              dp_ecr_1qb = COALESCE(EXCLUDED.dp_ecr_1qb, prospect_rankings_daily.dp_ecr_1qb)
          `);
          stats.dp_values_matched++;
        }
      }
      console.log(`[prospect-enrich] Matched ${stats.dp_values_matched} prospects in DP values`);
    }
  } catch (err) {
    console.error("[prospect-enrich] DP values error:", err);
  }

  try {
    console.log("[prospect-enrich] Fetching FantasyPros ECR...");
    const resp = await fetch(DP_ECR_URL);
    if (resp.ok) {
      const rows = parseCSV(await resp.text());
      const sfRows = rows.filter((r) => {
        const name = (r.player ?? "").toLowerCase();
        const page = r.ecr_type ?? "";
        return prospectNames.has(name) && (page === "dsf" || page === "do");
      });

      const byName = new Map<string, Record<string, string>>();
      for (const r of sfRows) {
        const name = (r.player ?? "").toLowerCase();
        const existing = byName.get(name);
        if (!existing || (r.ecr_type === "dsf" && existing.ecr_type !== "dsf")) {
          byName.set(name, r);
        }
      }

      for (const r of byName.values()) {
        const ecrOverall = num(r.ecr);
        const ecrBest = num(r.best);
        const ecrWorst = num(r.worst);
        const ecrSD = num(r.sd);

        await db.execute(sql`
          INSERT INTO prospect_rankings_daily
            (player_name, snapshot_date, position, fp_ecr_sf, fp_ecr_best, fp_ecr_worst, fp_ecr_sd, source)
          VALUES (${r.player}, ${today}::date, ${r.pos}, ${ecrOverall}, ${ecrBest != null ? Math.round(ecrBest) : null}, ${ecrWorst != null ? Math.round(ecrWorst) : null}, ${ecrSD}, 'fantasypros')
          ON CONFLICT (player_name, snapshot_date) DO UPDATE SET
            fp_ecr_sf = COALESCE(EXCLUDED.fp_ecr_sf, prospect_rankings_daily.fp_ecr_sf),
            fp_ecr_best = COALESCE(EXCLUDED.fp_ecr_best, prospect_rankings_daily.fp_ecr_best),
            fp_ecr_worst = COALESCE(EXCLUDED.fp_ecr_worst, prospect_rankings_daily.fp_ecr_worst),
            fp_ecr_sd = COALESCE(EXCLUDED.fp_ecr_sd, prospect_rankings_daily.fp_ecr_sd)
        `);
        stats.ecr_matched++;

        if (ecrOverall != null) {
          await db.execute(sql`
            UPDATE prospect_profiles
            SET current_adp = ${`ECR ${Math.round(ecrOverall)}`}
            WHERE LOWER(player_name) = LOWER(${r.player})
              AND (current_adp IS NULL OR current_adp = '')
          `);
        }
      }

      console.log(`[prospect-enrich] Matched ${stats.ecr_matched} prospects in FP ECR`);
    }
  } catch (err) {
    console.error("[prospect-enrich] ECR error:", err);
  }

  try {
    console.log("[prospect-enrich] Fetching combine data...");
    const resp = await fetch(COMBINE_URL);
    if (resp.ok) {
      const rows = parseCSV(await resp.text());
      const prospects2026 = rows.filter((r) => {
        const season = r.season ?? "";
        const pos = r.pos ?? "";
        return season === "2026" && ["QB", "RB", "WR", "TE"].includes(pos);
      });

      for (const r of prospects2026) {
        const name = (r.player_name ?? "").trim();
        if (!name) continue;

        const ht = (r.ht ?? "").trim() || null;
        const wt = num(r.wt);
        const forty = num(r.forty);
        const bench = num(r.bench);
        const vertical = num(r.vertical);
        const shuttle = num(r.shuttle);
        const hasData = ht || wt != null || forty != null || bench != null || vertical != null || shuttle != null;
        if (!hasData) continue;

        const baseName = name.replace(/\s+(Jr|Sr|II|III|IV|V)\.?$/i, "").trim();
        await db.execute(sql`
          UPDATE prospect_profiles SET
            height = COALESCE(${ht}, height),
            weight = COALESCE(${wt != null ? String(wt) : null}, weight),
            combine_40 = COALESCE(${forty != null ? String(forty) : null}, combine_40),
            combine_bench = COALESCE(${bench != null ? String(Math.round(bench)) : null}, combine_bench),
            combine_vertical = COALESCE(${vertical != null ? String(vertical) : null}, combine_vertical),
            combine_shuttle = COALESCE(${shuttle != null ? String(shuttle) : null}, combine_shuttle)
          WHERE LOWER(player_name) = LOWER(${name})
             OR LOWER(player_name) = LOWER(${baseName})
        `);

        if (r.school) {
          await db.execute(sql`
            UPDATE prospect_profiles pp SET
              height = COALESCE(${ht}, pp.height),
              weight = COALESCE(${wt != null ? String(wt) : null}, pp.weight),
              combine_40 = COALESCE(${forty != null ? String(forty) : null}, pp.combine_40),
              combine_bench = COALESCE(${bench != null ? String(Math.round(bench)) : null}, pp.combine_bench),
              combine_vertical = COALESCE(${vertical != null ? String(vertical) : null}, pp.combine_vertical),
              combine_shuttle = COALESCE(${shuttle != null ? String(shuttle) : null}, pp.combine_shuttle)
            FROM prospects_2026 p26
            WHERE LOWER(pp.player_name) = LOWER(p26.player_name)
              AND LOWER(p26.school) = LOWER(${r.school})
              AND LOWER(p26.position) = LOWER(${r.pos})
              AND pp.combine_40 IS NULL
          `);
        }

        stats.combine_matched++;
      }
      console.log(`[prospect-enrich] Processed ${stats.combine_matched} combine entries for 2026`);
    }
  } catch (err) {
    console.error("[prospect-enrich] Combine error:", err);
  }

  try {
    console.log("[prospect-enrich] Checking NFL draft for 2026 landing spots...");
    const resp = await fetch(NFL_DRAFT_URL);
    if (resp.ok) {
      const rows = parseCSV(await resp.text());
      const picks2026 = rows.filter((r) => {
        const season = r.season ?? "";
        const pos = r.position ?? "";
        return season === "2026" && ["QB", "RB", "WR", "TE"].includes(pos);
      });

      for (const r of picks2026) {
        const name = (r.pfr_player_name ?? "").trim();
        const team = r.team ?? "";
        const round = r.round ?? "";
        const pick = r.pick ?? "";
        if (!name || !team) continue;

        const landingSpot = `${team} (Rd ${round}, Pick ${pick})`;
        const draftCap = `Rd ${round} (Pick ${pick})`;
        const baseName = name.replace(/\s+(Jr|Sr|II|III|IV|V)\.?$/i, "").trim();

        await db.execute(sql`
          UPDATE prospect_profiles SET
            landing_spot = ${landingSpot},
            draft_capital = COALESCE(draft_capital, ${draftCap})
          WHERE LOWER(player_name) = LOWER(${name})
             OR LOWER(player_name) = LOWER(${baseName})
        `);
        stats.landing_spots_filled++;
      }
      console.log(`[prospect-enrich] Filled ${stats.landing_spots_filled} landing spots`);
    }
  } catch (err) {
    console.error("[prospect-enrich] Draft results error:", err);
  }

  stats.rankings_captured = stats.dp_values_matched + stats.ecr_matched;
  console.log("[prospect-enrich] Complete:", stats);
  return stats;
}

export async function generateScoutingReports(): Promise<number> {
  const rows = await db.execute(sql`
    SELECT p26.player_name, p26.position, p26.school, p26.tier, p26.age,
           pp.key_strengths, pp.key_concerns, pp.consensus_comp, pp.all_comps,
           pp.height, pp.weight, pp.combine_40, pp.combine_vertical,
           pp.draft_capital, pp.landing_spot
    FROM prospects_2026 p26
    JOIN prospect_profiles pp ON LOWER(p26.player_name) = LOWER(pp.player_name)
    WHERE (pp.scouting_notes IS NULL OR pp.scouting_notes = '')
      AND pp.key_strengths IS NOT NULL
      AND p26.tier IN ('elite', 'day1', 'day2')
    ORDER BY p26.fantasypros_rank ASC NULLS LAST
    LIMIT 20
  `);

  type Row = {
    player_name: string;
    position: string;
    school: string;
    tier: string;
    age: number | null;
    key_strengths: string[];
    key_concerns: string[];
    consensus_comp: string | null;
    all_comps: { comp: string; source: string }[] | null;
    height: string | null;
    weight: string | null;
    combine_40: number | string | null;
    combine_vertical: number | string | null;
    draft_capital: string | null;
    landing_spot: string | null;
  };

  const prospects = rows as unknown as Row[];
  if (prospects.length === 0) return 0;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("[prospect-enrich] No ANTHROPIC_API_KEY set, skipping AI scouting generation");
    return 0;
  }

  let generated = 0;
  for (const p of prospects) {
    try {
      const strengths = Array.isArray(p.key_strengths) ? p.key_strengths : [];
      const concerns = Array.isArray(p.key_concerns) ? p.key_concerns : [];
      const comps = p.all_comps ??
        (p.consensus_comp ? [{ comp: p.consensus_comp, source: "consensus" }] : []);

      const prompt = `Write a 2-3 paragraph dynasty fantasy football scouting report for ${p.player_name}, a ${p.position} from ${p.school}.

Tier: ${p.tier.toUpperCase()}
Age: ${p.age ?? "unknown"}
Size: ${p.height ?? "?"} / ${p.weight ?? "?"}
${p.combine_40 ? `40-yard: ${p.combine_40}s` : ""}
${p.combine_vertical ? `Vertical: ${p.combine_vertical}"` : ""}
${p.draft_capital ? `Draft Capital: ${p.draft_capital}` : ""}
${p.landing_spot ? `Landing Spot: ${p.landing_spot}` : ""}

Key Strengths: ${strengths.join(", ")}
Key Concerns: ${concerns.join(", ")}
${comps.length > 0 ? `Player Comps: ${comps.map((c) => c.comp).join(", ")}` : ""}

Write from the perspective of a dynasty analyst. Focus on long-term dynasty value, not redraft. Be specific about NFL role projection. End with a one-sentence dynasty verdict. Do not use em dashes.`;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const report = data.content?.[0]?.text ?? "";
        if (report.length > 50) {
          await db.execute(sql`
            UPDATE prospect_profiles
            SET scouting_notes = ${report}
            WHERE LOWER(player_name) = LOWER(${p.player_name})
          `);
          generated++;
          console.log(`[prospect-enrich] Generated scouting report for ${p.player_name}`);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`[prospect-enrich] AI scouting error for ${p.player_name}:`, err);
    }
  }

  console.log(`[prospect-enrich] Generated ${generated} AI scouting reports`);
  return generated;
}
