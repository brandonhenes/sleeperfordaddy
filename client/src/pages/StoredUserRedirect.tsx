import { useEffect } from "react";
import { useLocation } from "wouter";
import { readStoredUsername, userScopedPath } from "../lib/current-user";

interface StoredUserRedirectProps {
  to: string;
}

export default function StoredUserRedirect({ to }: StoredUserRedirectProps) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const username = readStoredUsername();
    if (!username) {
      setLocation("/");
      return;
    }
    const query = window.location.search;
    setLocation(`${userScopedPath(to, username)}${query}`);
  }, [setLocation, to]);

  return (
    <div className="min-h-screen bg-[var(--dark)] text-[var(--text)] grid place-items-center px-6">
      <div className="edge-card text-center">
        <p className="label mb-2">Loading</p>
        <p className="text-sm text-[var(--text-dim)]">Opening your saved account...</p>
      </div>
    </div>
  );
}
