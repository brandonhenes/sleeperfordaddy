export const SPORT = "nfl" as const;

// Seasons to fetch data for (Sleeper started ~2017, but most users have 2018+)
export const MIN_SEASON = 2018;
export const MAX_SEASON = new Date().getFullYear();

export const SEASONS = Array.from(
  { length: MAX_SEASON - MIN_SEASON + 1 },
  (_, i) => MIN_SEASON + i
);

// Cache freshness threshold
export const SYNC_STALE_MINUTES = 10;

// Sleeper API concurrency limit
export const SLEEPER_CONCURRENCY = 3;

// Sleeper API base URL
export const SLEEPER_BASE_URL = "https://api.sleeper.app/v1";

// Transaction rounds to fetch (0-22 covers all possibilities)
export const TRANSACTION_ROUNDS = Array.from({ length: 23 }, (_, i) => i);
