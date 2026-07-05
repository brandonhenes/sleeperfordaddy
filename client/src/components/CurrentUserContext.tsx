import { createContext, useContext, type ReactNode } from "react";
import type { CurrentUserState } from "../hooks/use-current-user";

const CurrentUserContext = createContext<CurrentUserState | null>(null);

export function CurrentUserProvider({
  value,
  children,
}: {
  value: CurrentUserState;
  children: ReactNode;
}) {
  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUserState {
  const value = useContext(CurrentUserContext);
  if (!value) {
    throw new Error("useCurrentUser must be used inside AppShell");
  }
  return value;
}
