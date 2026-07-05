import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "wouter";
import NavBar from "./NavBar";
import { readStoredUsername, writeStoredUsername } from "../lib/current-user";

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const params = useParams<{ username?: string }>();
  const paramUser = params.username ? decodeURIComponent(params.username) : "";
  const [storedUsername, setStoredUsername] = useState(() => readStoredUsername());

  useEffect(() => {
    if (!paramUser) return;
    writeStoredUsername(paramUser);
    setStoredUsername(paramUser);
  }, [paramUser]);

  const username = paramUser || storedUsername;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--dark-base)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        color: "var(--text)",
        overflowX: "hidden",
      }}
    >
      <NavBar username={username} />
      <div className="app-shell-content">
        {children}
      </div>
    </div>
  );
}
