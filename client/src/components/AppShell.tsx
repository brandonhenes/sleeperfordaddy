import type { ReactNode } from "react";
import NavBar from "./NavBar";
import { CurrentUserProvider } from "./CurrentUserContext";
import SyncGate, { type SyncGateProps } from "./SyncGate";
import { useCurrentUsername } from "../hooks/use-current-user";

interface AppShellProps {
  children: ReactNode;
  requireSync?: boolean;
  syncGate?: Omit<SyncGateProps, "username" | "children">;
}

export default function AppShell({
  children,
  requireSync = false,
  syncGate,
}: AppShellProps) {
  const currentUser = useCurrentUsername();
  const content = requireSync ? (
    <SyncGate username={currentUser.username} {...syncGate}>
      {children}
    </SyncGate>
  ) : (
    children
  );

  return (
    <CurrentUserProvider value={currentUser}>
      <div className="edge-app-shell">
        <NavBar username={currentUser.username} />
        <div className="app-shell-content">
          {content}
        </div>
      </div>
    </CurrentUserProvider>
  );
}
