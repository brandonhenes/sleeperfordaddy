import type { ReactNode } from "react";
import { useParams } from "wouter";
import NavBar from "./NavBar";

const STORAGE_KEY = "edge_username";

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const params = useParams<{ username?: string }>();
  const paramUser = params.username ? decodeURIComponent(params.username) : "";

  // Persist username so pages without :username in the URL (e.g. /market) still work
  if (paramUser) {
    localStorage.setItem(STORAGE_KEY, paramUser);
  }

  const username = paramUser || localStorage.getItem(STORAGE_KEY) || "";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--dark-base)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        color: "var(--text)",
      }}
    >
      <NavBar username={username} />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 48px" }}>
        {children}
      </div>
    </div>
  );
}
