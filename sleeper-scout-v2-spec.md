# Sleeper Scout v2 — Architecture Spec & Build Instructions

## IMPORTANT: Read this entire document before writing any code.

This is a clean rebuild of a fantasy football scouting app called "Sleeper Scout."
The original version (https://github.com/brandonhenes/sleeper-stats-viewer) works but has
severe architectural problems — a 4,283-line monolithic routes file, tangled data flows,
and accumulated tech debt from iterative AI-assisted development.

This rebuild keeps the same features but with clean, modular architecture.

---

## What This App Does (Plain English)

Sleeper Scout lets you type in any Sleeper fantasy football username and see analytics
that Sleeper's own app doesn't provide:

1. **Profile Dashboard** — All your leagues grouped across seasons, with win-loss records
2. **League Deep Dive** — H2H records, trade history, draft capital, roster activity, scouting
3. **Player Exposure** — Which players you own across multiple leagues (exposure %)
4. **Trade Targets** — Who in your league might want your players (based on their cross-league exposure)
5. **Market Trends** — Most traded players/picks across your leagues with time filters
6. **Compare** — Head-to-head comparison of two managers who share leagues
7. **Scouting Reports** — Opponent analysis (strength, consistency, roster churn, trading style)

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18 + TypeScript | Same as original, proven |
| Routing | wouter | Lightweight, works well |
| Styling | Tailwind CSS + shadcn/ui | Same as original |
| State/Fetching | TanStack React Query | Same as original |
| Backend | Express.js + TypeScript | Same as original |
| Database | PostgreSQL + Drizzle ORM | Same as original |
| Build | Vite | Same as original |

**DO NOT install these (remove from original):**
- passport, passport-local, express-session, connect-pg-simple, memorystore (no auth needed — this is a read-only app)
- @replit/* packages (not on Replit anymore)
- next-themes (not using Next.js)
- framer-motion (nice to have, add later if needed)
- Any unused Radix UI components — only install what pages actually use

---

## Project Structure

```
sleeper-scout-v2/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── drizzle.config.ts
├── .env.example                  # DATABASE_URL=postgresql://...
│
├── server/
│   ├── index.ts                  # Express app setup, middleware, starts server
│   ├── vite.ts                   # Vite dev middleware (same as original)
│   │
│   ├── db/
│   │   ├── connection.ts         # Pool setup, connection verification
│   │   ├── schema.ts             # All Drizzle table definitions
│   │   └── queries/              # Database query functions grouped by domain
│   │       ├── users.ts          # User-related queries
│   │       ├── leagues.ts        # League/group queries
│   │       ├── rosters.ts        # Roster queries
│   │       ├── trades.ts         # Trade queries
│   │       ├── h2h.ts            # Head-to-head queries
│   │       └── sync.ts           # Sync job queries
│   │
│   ├── sleeper/                  # Sleeper API client (ONLY talks to Sleeper)
│   │   ├── client.ts             # Base fetch with timeout/retry (the jget function)
│   │   ├── users.ts              # GET /user/{username}
│   │   ├── leagues.ts            # GET /user/{id}/leagues/{sport}/{season}
│   │   ├── rosters.ts            # GET /league/{id}/rosters
│   │   ├── matchups.ts           # GET /league/{id}/matchups/{week}
│   │   ├── transactions.ts       # GET /league/{id}/transactions/{round}
│   │   ├── drafts.ts             # GET /league/{id}/drafts, /draft/{id}/picks
│   │   ├── players.ts            # GET /players/nfl (bulk player data)
│   │   └── brackets.ts           # GET /league/{id}/winners_bracket, losers_bracket
│   │
│   ├── services/                 # Business logic (connects Sleeper API + DB)
│   │   ├── sync.ts               # The big sync job — pulls data from Sleeper, stores in DB
│   │   ├── overview.ts           # Build user profile/dashboard data
│   │   ├── league-groups.ts      # Group leagues across seasons via previous_league_id
│   │   ├── h2h.ts                # Calculate head-to-head records from matchup data
│   │   ├── trades.ts             # Trade history, trade assets, market trends
│   │   ├── exposure.ts           # Player exposure calculations
│   │   ├── targets.ts            # Trade target scoring
│   │   ├── scouting.ts           # Opponent scouting reports (strength, consistency, churn)
│   │   ├── draft-capital.ts      # Draft pick ownership tracking
│   │   └── compare.ts            # User vs user comparison
│   │
│   └── routes/                   # Express route handlers (THIN — just parse request, call service, return response)
│       ├── index.ts              # Mounts all route files
│       ├── overview.ts           # GET /api/overview
│       ├── sync.ts               # POST /api/sync, GET /api/sync/status
│       ├── leagues.ts            # GET /api/league/:id, /api/league/:id/summary, /api/group/:id/seasons
│       ├── h2h.ts                # GET /api/group/:groupId/h2h
│       ├── trades.ts             # GET /api/group/:groupId/trades, /api/trade-assets/*
│       ├── exposure.ts           # GET /api/players/exposure, POST /api/exposure/sync
│       ├── targets.ts            # GET /api/targets
│       ├── scouting.ts           # GET /api/scouting/:username, /api/league/:id/scouting/*
│       ├── draft-capital.ts      # GET /api/league/:id/draft-capital
│       ├── compare.ts            # GET /api/compare/shared-leagues
│       └── market.ts             # GET /api/market/trends, POST /api/market/sync
│
├── client/
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx               # Routes only
│   │   ├── lib/
│   │   │   ├── queryClient.ts
│   │   │   ├── utils.ts
│   │   │   └── api.ts            # Typed fetch helpers for calling backend
│   │   ├── hooks/
│   │   │   ├── use-sleeper.ts    # Main data fetching hook
│   │   │   ├── use-season.ts     # Season selector state
│   │   │   ├── use-mobile.ts
│   │   │   └── use-toast.ts
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── LeagueCard.tsx
│   │   │   ├── RosterCard.tsx
│   │   │   ├── SeasonSelector.tsx
│   │   │   ├── ScoutingSection.tsx
│   │   │   ├── TeamsSection.tsx
│   │   │   ├── TradesSection.tsx
│   │   │   ├── TradeTargetsModal.tsx
│   │   │   └── ui/               # shadcn/ui components (install only what you need)
│   │   └── pages/
│   │       ├── Home.tsx
│   │       ├── Profile.tsx
│   │       ├── LeagueGroupDetails.tsx
│   │       ├── Players.tsx
│   │       ├── Scouting.tsx
│   │       ├── Market.tsx
│   │       ├── Compare.tsx
│   │       ├── CompareResults.tsx
│   │       └── NotFound.tsx
│   └── public/
│       └── favicon.svg
│
└── shared/
    ├── types.ts                  # All TypeScript types/interfaces (NO Zod here)
    └── constants.ts              # Shared constants (seasons, sport types, etc.)
```

---

## Database Schema

Use these exact tables. This is a cleaned-up version of the original's 13 tables.
The original schema is mostly fine — keep it but define it in `server/db/schema.ts`.

### Tables to keep (same as original):
- `users` — Sleeper user profiles
- `leagues` — League metadata
- `rosters` — Roster records (W-L-T, points)
- `roster_players` — Which players are on which roster
- `user_leagues` — Maps users to leagues
- `league_users` — Maps leagues to users (with display names)
- `sync_jobs` — Background sync job tracking
- `h2h_season` — Head-to-head records per season
- `trades` — Raw trade transactions
- `trade_assets` — Normalized trade assets for analysis
- `players_master` — Player lookup table (name, position, team)
- `user_exposure_summary` — Cached exposure data
- `league_season_summary` — Season finish tracking
- `group_overrides` — Manual league group corrections

### Key schema notes:
- All tables have `updated_at` timestamp for cache freshness
- Composite primary keys on junction tables (roster_players, user_leagues, etc.)
- Indexes on frequently queried columns (owner_id, league_id, season)
- The `group_overrides` table lets users manually fix league grouping mistakes

---

## Sleeper API Reference

Base URL: `https://api.sleeper.app/v1`

No auth needed. Read-only. Stay under ~60 requests/minute.

### Endpoints used:
| Endpoint | Purpose |
|----------|---------|
| GET /user/{username} | Get user profile |
| GET /user/{user_id}/leagues/nfl/{season} | Get leagues for a season |
| GET /league/{league_id} | Get league details |
| GET /league/{league_id}/users | Get league members |
| GET /league/{league_id}/rosters | Get all rosters |
| GET /league/{league_id}/matchups/{week} | Get weekly matchups |
| GET /league/{league_id}/transactions/{round} | Get transactions (trades, waivers) |
| GET /league/{league_id}/traded_picks | Get traded draft picks |
| GET /league/{league_id}/drafts | Get draft metadata |
| GET /draft/{draft_id}/picks | Get draft picks |
| GET /league/{league_id}/winners_bracket | Playoff bracket |
| GET /league/{league_id}/losers_bracket | Consolation bracket |
| GET /players/nfl | Bulk player data (cache this — it's huge) |
| GET /state/nfl | Current NFL state (season, week) |

### Important Sleeper API gotchas:
- During offseason, many endpoints return empty/null data
- Not all leagues have playoff brackets
- `previous_league_id` chains dynasty leagues across seasons
- Player data endpoint returns ALL players (~10k entries) — cache aggressively
- Transactions endpoint uses "round" not "week" (fetch rounds 0-22 to be safe)
- Some roster owners have null `owner_id` (co-owners, orphan teams)

---

## Key Business Logic

### League Grouping
Dynasty leagues get new league_ids each season. Group them using `previous_league_id`:
- Follow the chain: 2025_id → previous → 2024_id → previous → 2023_id
- All these form one "league group" with a shared identity
- `group_id` = the oldest league_id in the chain (or overridden via group_overrides)
- Track `min_season`, `max_season`, `is_active`

### Sync Flow
1. User hits "Scout" with a username
2. Server checks cache freshness
3. If stale (>10 min), kicks off background sync job
4. Sync job: fetches user → fetches leagues for seasons 2018-current → fetches rosters/matchups/transactions per league → stores everything in DB
5. Frontend polls sync status and refreshes when done
6. Concurrency limit: 3 parallel Sleeper API calls at a time

### Head-to-Head Calculation
- For each league in a group, fetch all weekly matchups
- Find weeks where user played each opponent
- Aggregate W-L-T across all seasons in the group

### Trade Target Scoring
- For each opponent in the user's league, check their cross-league player exposure
- Higher exposure to players on user's roster = higher "target score"
- This suggests which opponents most want the user's players

### Draft Capital
- Fetch traded_picks for each league
- Generate baseline picks: current season + next 2 years, rounds 1-4
- Apply trades to update current ownership
- Calculate "pick hoard index" (weighted sum of future picks)

### Season Finish Determination (IN PRIORITY ORDER — never guess)
1. Check `roster.settings.playoff_rank` / `final_rank` / `rank`
2. Fetch and parse winners_bracket / losers_bracket
3. If neither works, leave `finish_place` as null with source="unknown"
4. NEVER infer champion from regular season standings

---

## Build Order

Build and test in this order. Each phase should work independently before moving on.

### Phase 1: Foundation
1. Project setup (package.json, tsconfig, vite config, tailwind)
2. Database connection and schema (drizzle config, run migrations)
3. Sleeper API client module (client.ts with timeout/retry, then each endpoint file)
4. Home page (just the search input)

### Phase 2: Core Data Pipeline
5. Sync service (the big one — fetches from Sleeper, stores in DB)
6. Overview service (builds profile dashboard from cached data)
7. Profile page (shows leagues grouped by season)
8. League grouping logic

### Phase 3: League Details
9. H2H service + route + UI
10. Trades service + route + UI
11. Draft capital service + route + UI
12. Teams/roster display

### Phase 4: Analysis Features
13. Player exposure service + route + page
14. Scouting service + route + page
15. Trade targets modal
16. Market trends page

### Phase 5: Extras
17. Compare feature
18. Season selector (global filter)
19. Polish, loading states, error handling
20. Deploy setup (Dockerfile or deployment config)

---

## Route Handler Pattern

Every route handler should follow this pattern — thin handlers that delegate to services:

```typescript
// server/routes/h2h.ts
import { Router } from 'express';
import { getH2HForGroup } from '../services/h2h';

const router = Router();

router.get('/api/group/:groupId/h2h', async (req, res) => {
  try {
    const { groupId } = req.params;
    const username = req.query.username as string;
    
    if (!username) {
      return res.status(400).json({ message: 'username is required' });
    }
    
    const result = await getH2HForGroup(groupId, username);
    res.json(result);
  } catch (err) {
    console.error(`[h2h] Error for group ${req.params.groupId}:`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
```

**Rules:**
- No business logic in route handlers
- No direct Sleeper API calls in route handlers
- No raw SQL in route handlers
- Route handlers only: parse params → call service → return JSON

---

## Reference: Original Codebase

The original repo is at https://github.com/brandonhenes/sleeper-stats-viewer

Key files to reference for business logic (but NOT architecture):
- `server/routes.ts` (4,283 lines) — ALL the business logic lives here, extract into services
- `shared/schema.ts` — Database schema (mostly good, keep it)
- `client/src/pages/LeagueGroupDetails.tsx` (48KB) — The most complex page
- `client/src/hooks/use-sleeper.ts` (25KB) — Main data fetching hook
- `GOTCHAS.md` — Known edge cases with Sleeper API
- `attached_assets/` — Contains detailed feature requirements

The original works. The goal is the same features with clean separation of concerns.

---

## Environment Variables

```
DATABASE_URL=postgresql://user:password@localhost:5432/sleeper_scout
PORT=5000
NODE_ENV=development
```

---

## Final Notes

- This is a READ-ONLY app. No user accounts, no login, no auth.
- All data comes from Sleeper's public API. No API keys needed.
- The app caches Sleeper data in Postgres to avoid hammering their API.
- Frontend talks to our Express backend, which talks to the DB or Sleeper API.
- Keep files under 300 lines. If a file exceeds that, split it.
- Use TypeScript strict mode.
- Test each phase before moving to the next.
