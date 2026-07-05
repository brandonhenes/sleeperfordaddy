import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getPowerRankings } from "./power-rankings.js";
import type {
  AggregateNeed,
  DraftPickContext,
  PickValueReference,
  PositionNeed,
  RookieDraftContext,
} from "../../shared/types.js";

function gradeToUrgency(grade: string): "A+" | "A" | "B" | "C" | "D" {
  if (grade === "hole") return "A+";
  if (grade === "weak") return "A";
  if (grade === "average") return "B";
  if (grade === "strong") return "C";
  return "D";
}

function computeAggregateNeeds(
  allNeeds: { position: string; grade: string }[],
  totalLeagues: number
): AggregateNeed[] {
  const positions = ["QB", "RB", "WR", "TE"];
  return positions.map((pos) => {
    const posNeeds = allNeeds.filter((n) => n.position === pos);
    const holes = posNeeds.filter((n) => n.grade === "hole").length;
    const weak = posNeeds.filter((n) => n.grade === "weak").length;
    const urgency: AggregateNeed["overall_urgency"] =
      holes >= 2 || (holes >= 1 && weak >= 2) ? "critical"
      : holes >= 1 || weak >= 2 ? "moderate"
      : "low";
    return {
      position: pos,
      leagues_with_hole: holes,
      leagues_with_weak: weak,
      total_leagues: totalLeagues,
      overall_urgency: urgency,
    };
  });
}

export async function getRookieDraftContext(username: string): Promise<RookieDraftContext> {
  const allLeagues = await getPowerRankings(username);

  const picks2026: DraftPickContext[] = [];
  const picks2027: DraftPickContext[] = [];
  const allSlotNeeds: { position: string; grade: string }[] = [];
  let leagueCount = 0;

  for (const league of allLeagues) {
    const userRoster = league.rosters.find((r) => r.is_user);
    if (!userRoster) continue;
    leagueCount++;

    const rosterNeeds: PositionNeed[] = [];
    const slotGrades = userRoster.lineup?.slot_grades ?? [];
    const posGrades = new Map<string, { total: number; count: number; worst: string }>();

    for (const sg of slotGrades) {
      const pos = sg.slot_label;
      if (!["QB", "RB", "WR", "TE"].includes(pos)) continue;
      const existing = posGrades.get(pos) ?? { total: 0, count: 0, worst: "elite" };
      existing.total += sg.avg_score;
      existing.count += 1;
      const gradeOrder = ["hole", "weak", "average", "strong", "elite"];
      if (gradeOrder.indexOf(sg.grade) < gradeOrder.indexOf(existing.worst)) {
        existing.worst = sg.grade;
      }
      posGrades.set(pos, existing);
    }

    for (const [pos, data] of posGrades) {
      const avgScore = data.count > 0 ? Math.round((data.total / data.count) * 10) / 10 : 0;
      rosterNeeds.push({
        position: pos,
        grade: data.worst as PositionNeed["grade"],
        urgency: gradeToUrgency(data.worst),
        starter_count: data.count,
        avg_score: avgScore,
      });
      allSlotNeeds.push({ position: pos, grade: data.worst });
    }

    rosterNeeds.sort((a, b) => {
      const order = { "A+": 0, "A": 1, "B": 2, "C": 3, "D": 4 };
      return order[a.urgency] - order[b.urgency];
    });

    const userPicks = userRoster.draft_picks ?? [];
    for (const pick of userPicks) {
      if (pick.edge_score <= 0) continue;
      if (pick.tier !== "early" && pick.tier !== "mid" && pick.tier !== "late") continue;

      const ctx: DraftPickContext = {
        league_id: league.league_id,
        league_name: league.league_name,
        league_mode: league.mode,
        scoring_label: league.scoring_label ?? "",
        season: pick.season,
        round: pick.round,
        tier: pick.tier,
        label: pick.label,
        pick_slot: pick.pick_slot,
        edge_score: pick.edge_score,
        ktc_value: pick.ktc_value,
        dp_value: pick.dp_value,
        roster_needs: rosterNeeds,
      };

      if (pick.season === "2026") {
        picks2026.push(ctx);
      } else if (pick.season === "2027") {
        picks2027.push(ctx);
      }
    }
  }

  const tierOrder: Record<"early" | "mid" | "late", number> = { early: 0, mid: 1, late: 2 };
  const sortPicks = (a: DraftPickContext, b: DraftPickContext) =>
    a.round - b.round || tierOrder[a.tier] - tierOrder[b.tier];
  picks2026.sort(sortPicks);
  picks2027.sort(sortPicks);

  const pickValueRows = await db.execute(sql`
    SELECT pick_season::int AS season, pick_round AS round, pick_tier AS tier,
           value_sf AS ktc_sf, value_1qb AS ktc_1qb
    FROM ktc_values
    WHERE is_pick = true AND pick_season IN (2026, 2027)
    ORDER BY pick_season, pick_round, pick_tier
  `);
  type PVRow = { season: number; round: number; tier: string; ktc_sf: number; ktc_1qb: number };
  const pickValues = (pickValueRows as unknown as PVRow[]).map((r) => ({
    season: r.season,
    round: r.round,
    tier: r.tier,
    ktc_sf: r.ktc_sf,
    ktc_1qb: r.ktc_1qb,
  }));

  const aggregateNeeds = computeAggregateNeeds(allSlotNeeds, leagueCount);

  return {
    username,
    total_leagues: leagueCount,
    picks_2026: picks2026,
    picks_2027: picks2027,
    pick_values: pickValues,
    aggregate_needs: aggregateNeeds,
  };
}
