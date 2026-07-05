export const USERNAME_STORAGE_KEY = "edge_username";

export function readStoredUsername(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(USERNAME_STORAGE_KEY) ?? "";
}

export function writeStoredUsername(username: string) {
  if (typeof window === "undefined") return;
  const normalized = username.trim();
  if (normalized) {
    window.localStorage.setItem(USERNAME_STORAGE_KEY, normalized);
  }
}

export function userScopedPath(path: string, username: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!username) return normalizedPath;
  return `${normalizedPath}/${encodeURIComponent(username)}`;
}
