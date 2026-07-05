import type { ReactNode } from "react";
import NavBar from "./NavBar";
import { CurrentUserProvider } from "./CurrentUserContext";
import { useCurrentUsername } from "../hooks/use-current-user";

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const currentUser = useCurrentUsername();

  return (
    <CurrentUserProvider value={currentUser}>
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
        <NavBar username={currentUser.username} />
        <div className="app-shell-content">
          {children}
        </div>
      </div>
    </CurrentUserProvider>
  );
}
