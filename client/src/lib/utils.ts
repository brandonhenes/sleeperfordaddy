/** Combine class names, filtering out falsy values */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Format a Sleeper avatar URL */
export function avatarUrl(avatarId: string | null, size = 64): string {
  if (!avatarId) return "";
  return `https://sleepercdn.com/avatars/thumbs/${avatarId}`;
}
