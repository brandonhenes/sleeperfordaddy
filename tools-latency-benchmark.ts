import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { db } from './server/db/connection.js';
import { sql } from 'drizzle-orm';
import { getOverviewWithGroups } from './server/services/overview.js';
import { getDashboardData } from './server/services/dashboard.js';
import { getPortfolio } from './server/services/portfolio.js';
import { getSellCandidates, getBuyOpportunities } from './server/services/action.js';
import { getFreeAgentGaps } from './server/services/arbitrage.js';
import { getPowerRankings } from './server/services/power-rankings.js';

type Endpoint = 'overview' | 'dashboard' | 'portfolio' | 'action' | 'arbitrage' | 'power_rankings';

interface TimingResult {
  endpoint: Endpoint;
  username: string;
  ms: number;
  ok: boolean;
  detail?: string;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx];
}

async function pickUsernames(sampleSize: number): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT u.username, COUNT(DISTINCT ul.league_id)::int AS league_count
    FROM users u
    JOIN user_leagues ul ON ul.user_id = u.user_id
    WHERE u.username IS NOT NULL
    GROUP BY u.user_id, u.username
    HAVING COUNT(DISTINCT ul.league_id) >= 2
    ORDER BY league_count DESC, u.username ASC
    LIMIT 400
  `);

  const typed = rows as unknown as Array<{ username: string; league_count: number }>;
  if (typed.length === 0) return [];

  const n = Math.min(sampleSize, typed.length);
  if (n === typed.length) return typed.map((r) => r.username);
  if (n === 1) return [typed[0].username];

  const out: string[] = [];
  const step = (typed.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) {
    const idx = Math.min(typed.length - 1, Math.round(i * step));
    out.push(typed[idx].username);
  }
  return Array.from(new Set(out)).slice(0, n);
}

async function timeOne(endpoint: Endpoint, username: string): Promise<TimingResult> {
  const t0 = performance.now();
  try {
    switch (endpoint) {
      case 'overview': {
        await getOverviewWithGroups(username);
        break;
      }
      case 'dashboard': {
        await getDashboardData(username);
        break;
      }
      case 'portfolio': {
        await getPortfolio(username);
        break;
      }
      case 'action': {
        await Promise.all([getSellCandidates(username), getBuyOpportunities(username)]);
        break;
      }
      case 'arbitrage': {
        await getFreeAgentGaps(username);
        break;
      }
      case 'power_rankings': {
        await getPowerRankings(username);
        break;
      }
    }
    return { endpoint, username, ms: Math.round(performance.now() - t0), ok: true };
  } catch (err) {
    return {
      endpoint,
      username,
      ms: Math.round(performance.now() - t0),
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const sampleSize = Number(process.env.BENCH_USERS ?? '12');
  const users = await pickUsernames(sampleSize);
  if (users.length === 0) {
    console.log('No users found to benchmark.');
    return;
  }

  console.log(`Benchmark users (${users.length}): ${users.join(', ')}`);

  const endpoints: Endpoint[] = ['overview', 'dashboard', 'portfolio', 'action', 'arbitrage', 'power_rankings'];
  const cold: TimingResult[] = [];
  const warm: TimingResult[] = [];

  for (const username of users) {
    for (const endpoint of endpoints) {
      const r = await timeOne(endpoint, username);
      cold.push(r);
      console.log(`cold ${endpoint.padEnd(14)} ${username.padEnd(18)} ${String(r.ms).padStart(5)}ms ${r.ok ? 'ok' : 'error'}`);
      if (!r.ok && r.detail) {
        console.log(`  -> ${r.detail}`);
      }
    }
  }

  for (const username of users) {
    for (const endpoint of endpoints) {
      const r = await timeOne(endpoint, username);
      warm.push(r);
      console.log(`warm ${endpoint.padEnd(14)} ${username.padEnd(18)} ${String(r.ms).padStart(5)}ms ${r.ok ? 'ok' : 'error'}`);
      if (!r.ok && r.detail) {
        console.log(`  -> ${r.detail}`);
      }
    }
  }

  const printSummary = (label: string, results: TimingResult[]) => {
    console.log(`\n${label}`);
    for (const endpoint of endpoints) {
      const rows = results.filter((r) => r.endpoint === endpoint && r.ok);
      const errors = results.filter((r) => r.endpoint === endpoint && !r.ok);
      const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
      const p50 = quantile(sorted, 0.5);
      const p95 = quantile(sorted, 0.95);
      const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0;
      const avg = sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0;
      console.log(`${endpoint.padEnd(14)} count=${String(sorted.length).padStart(2)} err=${String(errors.length).padStart(2)} avg=${String(avg).padStart(5)}ms p50=${String(p50).padStart(5)}ms p95=${String(p95).padStart(5)}ms max=${String(max).padStart(5)}ms`);
    }
  };

  printSummary('Summary (Cold)', cold);
  printSummary('Summary (Warm)', warm);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
