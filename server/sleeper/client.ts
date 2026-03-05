import { SLEEPER_BASE_URL } from "../../shared/constants.js";

const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const cache = new Map<string, { data: unknown; expires: number }>();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function clearSleeperCache() {
  cache.clear();
}

/**
 * Fetch JSON from the Sleeper API with timeout and retry.
 * This is the single point of contact for all Sleeper API calls.
 */
export async function jget<T>(
  path: string,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T | null> {
  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.expires > now) {
    return hit.data as T;
  }

  const url = `${SLEEPER_BASE_URL}${path}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.status === 404) {
        return null;
      }

      if (response.status === 429) {
        // Rate limited — wait longer before retry
        const delay = RETRY_DELAY_MS * attempt * 2;
        console.warn(`[sleeper] Rate limited on ${path}, waiting ${delay}ms`);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${path}`);
      }

      const data = await response.json();
      cache.set(path, { data, expires: Date.now() + ttlMs });
      return data as T;
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error && err.name === "AbortError";
      const isLast = attempt === MAX_RETRIES;

      if (isLast) {
        console.error(
          `[sleeper] Failed after ${MAX_RETRIES} attempts: ${path}`,
          err
        );
        throw err;
      }

      const delay = RETRY_DELAY_MS * attempt;
      console.warn(
        `[sleeper] Attempt ${attempt} failed for ${path} (${isAbort ? "timeout" : "error"}), retrying in ${delay}ms`
      );
      await sleep(delay);
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
