import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import { useEvaluateTrade } from "../hooks/use-trade-calculator";
import {
  usePowerRankings,
  type CoreAsset,
  type ScoredPick,
} from "../hooks/use-power-rankings";
import { useCurrentUsername } from "../hooks/use-current-user";
import { apiFetch } from "../lib/api";
import { computeAcceptance } from "../lib/acceptance";
import type {
  TradeAssetInput,
  TradeValuationProfile,
} from "@shared/types";
import RosterGrid from "./trade-calculator/RosterGrid";
import { AcceptanceBadge, EvalBar, TradePanel } from "./trade-calculator/TradeSummaryPanels";
import VacuumSearchColumn from "./trade-calculator/VacuumSearchColumn";
import { PICK_YEARS, pickDisplay, pickSlotLabel, pickToAsset } from "./trade-calculator/picks";
import { buildTradeMessage } from "./trade-calculator/trade-message";
import type {
  AcceptanceAssetView,
  OpponentContextResponse,
  PickTier,
  SearchAsset,
  Side,
} from "./trade-calculator/types";

const VALUATION_PROFILE_OPTIONS: Array<{
  value: TradeValuationProfile;
  label: string;
  desc: string;
}> = [
  { value: "ktc_league", label: "KTC League", desc: "KTC values with this league's scoring context" },
  { value: "composite", label: "Composite", desc: "Current FC/KTC/DP league-aware model" },
  { value: "ktc", label: "KTC", desc: "Raw KTC values plus package context" },
];

function assetKey(a: TradeAssetInput): string {
  if (a.type === "player") {
    return `p:${a.player_id}`;
  }
  const ownerKey = a.pick_original_owner_id != null ? `|${a.pick_original_owner_id}` : "";
  if (a.pick_slot != null) {
    return `k:${a.pick_season}|${a.pick_round}|${a.pick_slot}${ownerKey}`;
  }
  return `k:${a.pick_season}|${a.pick_round}|${a.pick_tier ?? "mid"}${ownerKey}`;
}

export default function TradeCalculator() {
  const [showRedraft, setShowRedraft] = useState(false);
  const [valuationMode, setValuationMode] = useState<TradeValuationProfile>("ktc_league");
  const [selectedLeague, setSelectedLeague] = useState("");
  const [selectedOpponent, setSelectedOpponent] = useState<number | null>(null);
  const [sendAssets, setSendAssets] = useState<TradeAssetInput[]>([]);
  const [receiveAssets, setReceiveAssets] = useState<TradeAssetInput[]>([]);
  const [sendLabels, setSendLabels] = useState<string[]>([]);
  const [receiveLabels, setReceiveLabels] = useState<string[]>([]);
  const [sendSearch, setSendSearch] = useState("");
  const [receiveSearch, setReceiveSearch] = useState("");
  const [sendPickSeason, setSendPickSeason] = useState(PICK_YEARS[0]);
  const [sendPickRound, setSendPickRound] = useState(1);
  const [sendPickTier, setSendPickTier] = useState<PickTier>("mid");
  const [sendPickSlot, setSendPickSlot] = useState<number | null>(null);
  const [receivePickSeason, setReceivePickSeason] = useState(PICK_YEARS[0]);
  const [receivePickRound, setReceivePickRound] = useState(1);
  const [receivePickTier, setReceivePickTier] = useState<PickTier>("mid");
  const [receivePickSlot, setReceivePickSlot] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCompactLeagueLayout, setIsCompactLeagueLayout] = useState(() => (
    typeof window !== "undefined" ? window.innerWidth < 1180 : false
  ));

  const { username: storedUsername } = useCurrentUsername();
  const { data: leagues = [] } = usePowerRankings(storedUsername, showRedraft);
  const selectedLeagueData = leagues.find((l) => l.league_id === selectedLeague);
  const userRoster = selectedLeagueData?.rosters.find((r) => r.is_user) ?? null;
  const oppRoster = selectedLeagueData?.rosters.find((r) => r.roster_id === selectedOpponent) ?? null;

  const { data: opponentData } = useQuery<OpponentContextResponse>({
    queryKey: ["opponent-context", storedUsername, selectedLeague, showRedraft],
    queryFn: () => apiFetch(`/api/trade/opponent-context/${encodeURIComponent(storedUsername)}/${encodeURIComponent(selectedLeague)}${showRedraft ? "?redraft=true" : ""}`),
    enabled: !!storedUsername && !!selectedLeague,
    staleTime: 5 * 60 * 1000,
  });
  const opponents = opponentData?.opponents ?? [];
  const activeOpponent = opponents.find((o) => o.roster_id === selectedOpponent) ?? null;

  const { data: sendSearchResults = [], isLoading: sendSearchLoading } = useQuery<SearchAsset[]>({
    queryKey: ["trade-calc-search", "send", sendSearch],
    queryFn: () => apiFetch(`/api/trade/assets?q=${encodeURIComponent(sendSearch.trim())}&limit=12`),
    enabled: !selectedLeague && sendSearch.trim().length >= 2,
  });
  const { data: receiveSearchResults = [], isLoading: receiveSearchLoading } = useQuery<SearchAsset[]>({
    queryKey: ["trade-calc-search", "receive", receiveSearch],
    queryFn: () => apiFetch(`/api/trade/assets?q=${encodeURIComponent(receiveSearch.trim())}&limit=12`),
    enabled: !selectedLeague && receiveSearch.trim().length >= 2,
  });

  useEffect(() => {
    setSelectedOpponent(null);
    setSendAssets([]);
    setReceiveAssets([]);
    setSendLabels([]);
    setReceiveLabels([]);
  }, [selectedLeague]);

  useEffect(() => {
    if (opponents.length > 0 && !selectedOpponent) {
      const best = [...opponents].sort((a, b) => (b.behavior?.recent_trades ?? 0) - (a.behavior?.recent_trades ?? 0) || b.needs.length - a.needs.length)[0];
      if (best) setSelectedOpponent(best.roster_id);
    }
  }, [opponents, selectedOpponent]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncLayout = () => setIsCompactLeagueLayout(window.innerWidth < 1180);
    syncLayout();
    window.addEventListener("resize", syncLayout);
    return () => window.removeEventListener("resize", syncLayout);
  }, []);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const evalMutation = useEvaluateTrade();
  const hasBothSides = sendAssets.length > 0 && receiveAssets.length > 0;

  useEffect(() => {
    if (!hasBothSides) {
      evalMutation.reset();
      return;
    }
    const mode = selectedLeagueData?.mode ?? "sf";
    const timer = setTimeout(() => {
      evalMutation.mutate({
        sideA: sendAssets,
        sideB: receiveAssets,
        mode,
        leagueId: selectedLeague || undefined,
        redraft: showRedraft,
        valuationMode,
        includeComparison: true,
      });
      }, 400);
      return () => clearTimeout(timer);
  }, [sendAssets, receiveAssets, selectedLeague, selectedLeagueData?.mode, showRedraft, valuationMode]);

  const result = evalMutation.data;
  const userCoreAssetMap = useMemo(() => new Map((userRoster?.core_assets ?? []).map((asset) => [asset.player_id, asset])), [userRoster]);
  const oppCoreAssetMap = useMemo(() => new Map((oppRoster?.core_assets ?? []).map((asset) => [asset.player_id, asset])), [oppRoster]);
  const liveAcceptance = useMemo(() => {
    if (!result || !activeOpponent) return null;
    const sendAcceptanceAssets: AcceptanceAssetView[] = result.sideA.assets.map((asset) => {
      const meta = asset.player_id ? userCoreAssetMap.get(asset.player_id) : undefined;
      return {
        ...asset,
        age: meta?.age ?? null,
        age_curve_zone: meta?.age_curve?.zone ?? null,
      };
    });
    const receiveAcceptanceAssets: AcceptanceAssetView[] = result.sideB.assets.map((asset) => {
      const meta = asset.player_id ? oppCoreAssetMap.get(asset.player_id) : undefined;
      return {
        ...asset,
        age: meta?.age ?? null,
        age_curve_zone: meta?.age_curve?.zone ?? null,
      };
    });
    return computeAcceptance({
      fairness: result.fairness,
      delta: result.delta,
      sendAssets: sendAcceptanceAssets,
      receiveAssets: receiveAcceptanceAssets,
      opponent: activeOpponent,
    });
  }, [result, activeOpponent, userCoreAssetMap, oppCoreAssetMap]);

  const sendPlayerIds = useMemo(() => new Set(sendAssets.filter((a): a is TradeAssetInput & { type: "player"; player_id: string } => a.type === "player" && !!a.player_id).map((a) => a.player_id)), [sendAssets]);
  const receivePlayerIds = useMemo(() => new Set(receiveAssets.filter((a): a is TradeAssetInput & { type: "player"; player_id: string } => a.type === "player" && !!a.player_id).map((a) => a.player_id)), [receiveAssets]);
  const sendPickKeys = useMemo(() => new Set(sendAssets.filter((a) => a.type === "pick").map((a) => assetKey(a))), [sendAssets]);
  const receivePickKeys = useMemo(() => new Set(receiveAssets.filter((a) => a.type === "pick").map((a) => assetKey(a))), [receiveAssets]);

  function removeSend(idx: number) {
    setSendAssets((p) => p.filter((_, i) => i !== idx));
    setSendLabels((p) => p.filter((_, i) => i !== idx));
  }
  function removeReceive(idx: number) {
    setReceiveAssets((p) => p.filter((_, i) => i !== idx));
    setReceiveLabels((p) => p.filter((_, i) => i !== idx));
  }
  function clearSide(side: Side) {
    if (side === "send") {
      setSendAssets([]);
      setSendLabels([]);
    } else {
      setReceiveAssets([]);
      setReceiveLabels([]);
    }
  }
  function toggleAsset(side: Side, a: TradeAssetInput, label: string) {
    const key = assetKey(a);
    if (side === "send") {
      const idx = sendAssets.findIndex((x) => assetKey(x) === key);
      if (idx >= 0) return removeSend(idx);
      if (receiveAssets.some((x) => assetKey(x) === key)) return;
      setSendAssets((p) => [...p, a]);
      setSendLabels((p) => [...p, label]);
      return;
    }
    const idx = receiveAssets.findIndex((x) => assetKey(x) === key);
    if (idx >= 0) return removeReceive(idx);
    if (sendAssets.some((x) => assetKey(x) === key)) return;
    setReceiveAssets((p) => [...p, a]);
    setReceiveLabels((p) => [...p, label]);
  }
  function addFromRoster(player: CoreAsset, side: Side) {
    toggleAsset(side, { type: "player", player_id: player.player_id }, `${player.full_name} (${player.position})`);
  }
  function addPick(pick: ScoredPick, side: Side) {
    toggleAsset(side, pickToAsset(pick), pickDisplay(pick));
  }
  function addVacuumPick(side: Side) {
    const pickSeason = side === "send" ? sendPickSeason : receivePickSeason;
    const pickRound = side === "send" ? sendPickRound : receivePickRound;
    const pickTier = side === "send" ? sendPickTier : receivePickTier;
    const pickSlot = side === "send" ? sendPickSlot : receivePickSlot;
    const roundLabel = pickRound === 1 ? "1st" : pickRound === 2 ? "2nd" : pickRound === 3 ? "3rd" : `R${pickRound}`;
    const tierLabel = `${pickTier.charAt(0).toUpperCase()}${pickTier.slice(1)}`;
    const label = pickSlot != null
      ? `${pickSeason} ${pickSlotLabel(pickRound, pickSlot)}`
      : `${pickSeason} ${tierLabel} ${roundLabel}`;
    toggleAsset(
      side,
      {
        type: "pick",
        pick_season: pickSeason,
        pick_round: pickRound,
        pick_tier: pickTier,
        pick_slot: pickSlot,
        pick_label: label,
      },
      label
    );
  }

  const leagueColumns = isCompactLeagueLayout ? "1fr" : "minmax(0, 1fr) 320px minmax(0, 1fr)";
  const rosterPaneStyle = {
    maxHeight: isCompactLeagueLayout ? "none" : "70vh",
    overflowY: isCompactLeagueLayout ? "visible" : "auto",
  } as const;
  const centerPaneStyle = {
    position: isCompactLeagueLayout ? "static" : "sticky",
    top: isCompactLeagueLayout ? undefined : 80,
    maxHeight: isCompactLeagueLayout ? "none" : "85vh",
    overflowY: isCompactLeagueLayout ? "visible" : "auto",
    display: "grid",
    gap: 12,
    alignSelf: "start",
  } as const;

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Calculator</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>Click your roster and your opponent roster. Evaluation and acceptance update live.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <button
            type="button"
            onClick={() => setShowRedraft((current) => !current)}
            style={{
              borderRadius: 999,
              padding: "7px 12px",
              border: `1px solid ${showRedraft ? "#60a5fa" : "var(--border)"}`,
              background: showRedraft ? "rgba(96,165,250,0.14)" : "transparent",
              color: showRedraft ? "#93c5fd" : "var(--text-muted)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {showRedraft ? "Redraft On" : "Redraft Off"}
          </button>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {VALUATION_PROFILE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setValuationMode(option.value)}
                title={option.desc}
                style={{
                  borderRadius: 999,
                  padding: "7px 12px",
                  border: `1px solid ${valuationMode === option.value ? "var(--amber)" : "var(--border)"}`,
                  background: valuationMode === option.value ? "rgba(245,158,11,0.12)" : "transparent",
                  color: valuationMode === option.value ? "var(--amber)" : "var(--text-muted)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <FreshnessBar leagueId={selectedLeague || undefined} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isCompactLeagueLayout ? "1fr" : "1fr 1fr", gap: 10 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 700 }}>LEAGUE</div>
          <select value={selectedLeague} onChange={(e) => setSelectedLeague(e.target.value)} style={{ width: "100%", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}>
            <option value="">No league selected (vacuum mode)</option>
            {leagues.map((l) => <option key={l.league_id} value={l.league_id}>{l.league_name} ({l.mode.toUpperCase()}{l.scoring_label ? ` · ${l.scoring_label}` : ""})</option>)}
          </select>
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 700 }}>OPPONENT</div>
          <select value={selectedOpponent ?? ""} onChange={(e) => setSelectedOpponent(e.target.value ? Number(e.target.value) : null)} disabled={!selectedLeague || opponents.length === 0} style={{ width: "100%", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "8px 10px", fontFamily: "inherit", fontSize: 13, opacity: !selectedLeague ? 0.6 : 1 }}>
            <option value="">{selectedLeague ? "Select opponent..." : "Select a league first"}</option>
            {opponents.map((o) => <option key={o.roster_id} value={o.roster_id}>{o.display_name}{o.team_name ? ` (${o.team_name})` : ""} | {o.archetype}</option>)}
          </select>
        </div>
      </div>

      {!selectedLeague && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: leagueColumns, gap: 12, alignItems: "start" }}>
          <div style={{ ...rosterPaneStyle, display: "grid", gap: 12, alignSelf: "start", order: 1 }}>
            <VacuumSearchColumn
              title="YOU SEND"
              color="#ef4444"
              search={sendSearch}
              onSearchChange={setSendSearch}
              results={sendSearchResults}
              isLoading={sendSearchLoading}
              onAddPlayer={(player) => toggleAsset("send", { type: "player", player_id: player.player_id }, player.label)}
              pickSeason={sendPickSeason}
              onPickSeasonChange={setSendPickSeason}
              pickRound={sendPickRound}
              onPickRoundChange={setSendPickRound}
              pickTier={sendPickTier}
              onPickTierChange={setSendPickTier}
              pickSlot={sendPickSlot}
              onPickSlotChange={setSendPickSlot}
              onAddPick={() => addVacuumPick("send")}
              addPickLabel="Send Pick"
            />
          </div>
          <div style={{ ...centerPaneStyle, order: 2 }}>
            <TradePanel title="YOU SEND" color="#ef4444" labels={sendLabels} side={result?.sideA ?? null} onRemove={removeSend} onClear={() => clearSide("send")} />
            <EvalBar result={result} acceptance={null} hasBothSides={hasBothSides} isPending={evalMutation.isPending} />
            <TradePanel title="YOU GET" color="#22c55e" labels={receiveLabels} side={result?.sideB ?? null} onRemove={removeReceive} onClear={() => clearSide("receive")} />
          </div>
          <div style={{ ...rosterPaneStyle, display: "grid", gap: 12, alignSelf: "start", order: 3 }}>
            <VacuumSearchColumn
              title="YOU GET"
              color="#22c55e"
              search={receiveSearch}
              onSearchChange={setReceiveSearch}
              results={receiveSearchResults}
              isLoading={receiveSearchLoading}
              onAddPlayer={(player) => toggleAsset("receive", { type: "player", player_id: player.player_id }, player.label)}
              pickSeason={receivePickSeason}
              onPickSeasonChange={setReceivePickSeason}
              pickRound={receivePickRound}
              onPickRoundChange={setReceivePickRound}
              pickTier={receivePickTier}
              onPickTierChange={setReceivePickTier}
              pickSlot={receivePickSlot}
              onPickSlotChange={setReceivePickSlot}
              onAddPick={() => addVacuumPick("receive")}
              addPickLabel="Get Pick"
            />
          </div>
        </div>
      )}

      {selectedLeague && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: leagueColumns, gap: 12, alignItems: "start" }}>
          <div style={{ ...rosterPaneStyle, order: isCompactLeagueLayout ? 2 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><div style={{ color: "#ef4444", fontSize: 12, fontWeight: 800 }}>YOUR ROSTER</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{userRoster?.display_name ?? "-"}</div></div>
            <RosterGrid roster={userRoster} usedPlayerIds={sendPlayerIds} usedPickKeys={sendPickKeys} onPlayerClick={(p) => addFromRoster(p, "send")} onPickClick={(p) => addPick(p, "send")} />
          </div>
          <div style={{ ...centerPaneStyle, order: isCompactLeagueLayout ? 1 : 2 }}>
            <TradePanel title="YOU SEND" color="#ef4444" labels={sendLabels} side={result?.sideA ?? null} onRemove={removeSend} onClear={() => clearSide("send")} />
            <EvalBar result={result} acceptance={liveAcceptance} hasBothSides={hasBothSides} isPending={evalMutation.isPending} />
            <TradePanel title="YOU GET" color="#22c55e" labels={receiveLabels} side={result?.sideB ?? null} onRemove={removeReceive} onClear={() => clearSide("receive")} />
            <AcceptanceBadge acceptance={liveAcceptance} opponent={activeOpponent} />
            {result && selectedLeague && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a
                  href={`https://sleeper.app/leagues/${selectedLeague}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 16px",
                    borderRadius: 8,
                    background: "rgba(55, 65, 81, 0.5)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  Open in Sleeper
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const msg = buildTradeMessage(
                      result,
                      result.sideA.assets.map((asset) => asset.label),
                      result.sideB.assets.map((asset) => asset.label),
                      activeOpponent,
                      liveAcceptance
                    );
                    navigator.clipboard.writeText(msg);
                    setCopied(true);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 16px",
                    borderRadius: 8,
                    background: "rgba(245,158,11,0.15)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    color: "var(--amber)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {copied ? "Copied!" : "Copy Trade Message"}
                </button>
              </div>
            )}
          </div>
          <div style={{ ...rosterPaneStyle, order: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><div style={{ color: "#22c55e", fontSize: 12, fontWeight: 800 }}>THEIR ROSTER</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{oppRoster?.display_name ?? "Select opponent"}</div></div>
            <RosterGrid roster={oppRoster} usedPlayerIds={receivePlayerIds} usedPickKeys={receivePickKeys} onPlayerClick={(p) => addFromRoster(p, "receive")} onPickClick={(p) => addPick(p, "receive")} />
          </div>
        </div>
      )}

    </AppShell>
  );
}
