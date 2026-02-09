import { eq } from "drizzle-orm";
import { db } from "../connection.js";
import { users } from "../schema.js";

export async function upsertUser(user: {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}) {
  await db
    .insert(users)
    .values({ ...user, updated_at: Date.now() })
    .onConflictDoUpdate({
      target: users.user_id,
      set: {
        username: user.username,
        display_name: user.display_name,
        avatar: user.avatar,
        updated_at: Date.now(),
      },
    });
}

export async function getUserByUsername(username: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserById(userId: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.user_id, userId))
    .limit(1);
  return rows[0] ?? null;
}
