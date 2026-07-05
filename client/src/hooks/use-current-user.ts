import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { readStoredUsername, writeStoredUsername } from "../lib/current-user";

export interface CurrentUserState {
  username: string;
  routeUsername: string;
  storedUsername: string;
  hasUsername: boolean;
}

export function useCurrentUsername(): CurrentUserState {
  const params = useParams<{ username?: string }>();
  const routeUsername = params.username ? decodeURIComponent(params.username) : "";
  const [storedUsername, setStoredUsername] = useState(() => readStoredUsername());

  useEffect(() => {
    if (!routeUsername) return;
    writeStoredUsername(routeUsername);
    setStoredUsername(routeUsername);
  }, [routeUsername]);

  const username = routeUsername || storedUsername;

  return {
    username,
    routeUsername,
    storedUsername,
    hasUsername: username.length > 0,
  };
}
