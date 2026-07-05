import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TradeAssetInput } from "@shared/types";

export type SlipSide = "send" | "receive";

export interface SlipLeg {
  side: SlipSide;
  asset: TradeAssetInput;
  label: string;
  position?: string | null;
}

export interface SavedTicket {
  id: string;
  created_at: number;
  league_id: string;
  league_name: string;
  opponent_roster_id: number | null;
  opponent_name: string | null;
  legs: SlipLeg[];
  last_band: string | null;
  last_probability: number | null;
  status: "open" | "pitched";
}

interface SlipVerdict {
  band: "Likely" | "Coin-flip" | "Long shot" | null;
  probability: number | null;
  fairness: string | null;
}

interface SlipContextValue {
  legs: SlipLeg[];
  leagueId: string;
  opponentRosterId: number | null;
  sheetOpen: boolean;
  verdict: SlipVerdict;
  tickets: SavedTicket[];
  toggleLeg: (leg: SlipLeg) => void;
  removeLeg: (index: number) => void;
  clearSlip: () => void;
  setLeague: (leagueId: string) => void;
  setOpponent: (rosterId: number | null) => void;
  openSlip: () => void;
  closeSlip: () => void;
  setVerdict: (verdict: SlipVerdict) => void;
  loadTicket: (input: {
    legs: SlipLeg[];
    leagueId: string;
    opponentRosterId?: number | null;
    openSheet?: boolean;
  }) => void;
  saveTicket: (input: { leagueName: string; opponentName: string | null; status: SavedTicket["status"] }) => void;
  removeTicket: (id: string) => void;
}

const SLIP_KEY = "edge-slip-v1";
const TICKETS_KEY = "edge-slip-tickets-v1";

export function slipAssetKey(a: TradeAssetInput): string {
  if (a.type === "player") return `p:${a.player_id}`;
  const owner = a.pick_original_owner_id != null ? `|${a.pick_original_owner_id}` : "";
  if (a.pick_slot != null) return `k:${a.pick_season}|${a.pick_round}|${a.pick_slot}${owner}`;
  return `k:${a.pick_season}|${a.pick_round}|${a.pick_tier ?? "mid"}${owner}`;
}

export function acceptanceBand(probability: number | null | undefined): "Likely" | "Coin-flip" | "Long shot" | null {
  if (probability == null || Number.isNaN(probability)) return null;
  if (probability >= 65) return "Likely";
  if (probability >= 40) return "Coin-flip";
  return "Long shot";
}

export function bandColor(band: string | null): string {
  if (band === "Likely") return "var(--green)";
  if (band === "Coin-flip") return "var(--warning)";
  if (band === "Long shot") return "var(--red)";
  return "var(--text-muted)";
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // ignore corrupt storage
  }
  return fallback;
}

const SlipContext = createContext<SlipContextValue | null>(null);

export function SlipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ legs: SlipLeg[]; leagueId: string; opponentRosterId: number | null }>(() =>
    readJson(SLIP_KEY, { legs: [], leagueId: "", opponentRosterId: null })
  );
  const [tickets, setTickets] = useState<SavedTicket[]>(() => readJson(TICKETS_KEY, []));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [verdict, setVerdictState] = useState<SlipVerdict>({ band: null, probability: null, fairness: null });

  useEffect(() => {
    localStorage.setItem(SLIP_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem(TICKETS_KEY, JSON.stringify(tickets));
  }, [tickets]);

  const toggleLeg = useCallback((leg: SlipLeg) => {
    setState((prev) => {
      const key = slipAssetKey(leg.asset);
      const existing = prev.legs.findIndex((l) => slipAssetKey(l.asset) === key);
      if (existing >= 0) {
        return { ...prev, legs: prev.legs.filter((_, i) => i !== existing) };
      }
      return { ...prev, legs: [...prev.legs, leg] };
    });
  }, []);

  const removeLeg = useCallback((index: number) => {
    setState((prev) => ({ ...prev, legs: prev.legs.filter((_, i) => i !== index) }));
  }, []);

  const clearSlip = useCallback(() => {
    setState((prev) => ({ ...prev, legs: [] }));
    setVerdictState({ band: null, probability: null, fairness: null });
  }, []);

  const setLeague = useCallback((leagueId: string) => {
    setState((prev) => (prev.leagueId === leagueId ? prev : { ...prev, leagueId, opponentRosterId: null }));
  }, []);

  const setOpponent = useCallback((rosterId: number | null) => {
    setState((prev) => ({ ...prev, opponentRosterId: rosterId }));
  }, []);

  const loadTicket = useCallback(
    (input: { legs: SlipLeg[]; leagueId: string; opponentRosterId?: number | null; openSheet?: boolean }) => {
      setState({
        legs: input.legs,
        leagueId: input.leagueId,
        opponentRosterId: input.opponentRosterId ?? null,
      });
      if (input.openSheet !== false) setSheetOpen(true);
    },
    []
  );

  const saveTicket = useCallback(
    (input: { leagueName: string; opponentName: string | null; status: SavedTicket["status"] }) => {
      setState((current) => {
        setTickets((prev) => {
          const ticket: SavedTicket = {
            id: `t${prev.length}-${current.legs.map((l) => slipAssetKey(l.asset)).join("|").slice(0, 60)}-${prev.filter(Boolean).length}`,
            created_at: 0,
            league_id: current.leagueId,
            league_name: input.leagueName,
            opponent_roster_id: current.opponentRosterId,
            opponent_name: input.opponentName,
            legs: current.legs,
            last_band: null,
            last_probability: null,
            status: input.status,
          };
          const withoutDupes = prev.filter(
            (t) =>
              !(
                t.league_id === ticket.league_id &&
                t.legs.map((l) => slipAssetKey(l.asset)).join("|") === current.legs.map((l) => slipAssetKey(l.asset)).join("|")
              )
          );
          return [{ ...ticket, created_at: Date.now() }, ...withoutDupes].slice(0, 20);
        });
        return current;
      });
    },
    []
  );

  const removeTicket = useCallback((id: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openSlip = useCallback(() => setSheetOpen(true), []);
  const closeSlip = useCallback(() => setSheetOpen(false), []);
  const setVerdict = useCallback((v: SlipVerdict) => setVerdictState(v), []);

  const value = useMemo<SlipContextValue>(
    () => ({
      legs: state.legs,
      leagueId: state.leagueId,
      opponentRosterId: state.opponentRosterId,
      sheetOpen,
      verdict,
      tickets,
      toggleLeg,
      removeLeg,
      clearSlip,
      setLeague,
      setOpponent,
      openSlip,
      closeSlip,
      setVerdict,
      loadTicket,
      saveTicket,
      removeTicket,
    }),
    [state, sheetOpen, verdict, tickets, toggleLeg, removeLeg, clearSlip, setLeague, setOpponent, openSlip, closeSlip, setVerdict, loadTicket, saveTicket, removeTicket]
  );

  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>;
}

export function useSlip(): SlipContextValue {
  const ctx = useContext(SlipContext);
  if (!ctx) throw new Error("useSlip must be used inside SlipProvider");
  return ctx;
}
