import type { SleeperUser } from "../../shared/types.js";
import { jget } from "./client.js";

/** GET /user/{username} — Resolve username to user profile */
export async function getUser(username: string): Promise<SleeperUser | null> {
  return jget<SleeperUser>(`/user/${encodeURIComponent(username)}`);
}
