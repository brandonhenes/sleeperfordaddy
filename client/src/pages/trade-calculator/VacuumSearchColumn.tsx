import { PositionBadge } from "../../components/ui";
import { PICK_YEARS, pickSlotLabel } from "./picks";
import type { PickSelection, PickTier, SearchAsset } from "./types";

const GENERIC_PICK_SLOTS = Array.from({ length: 12 }, (_, index) => index + 1);

function pickSelectionValue(tier: PickTier, slot: number | null): PickSelection {
  return slot != null ? `slot:${slot}` : tier;
}

function tierFromGenericSlot(slot: number): PickTier {
  if (slot <= 4) return "early";
  if (slot <= 8) return "mid";
  return "late";
}

function isPickTier(value: PickSelection): value is PickTier {
  return value === "early" || value === "mid" || value === "late";
}

interface VacuumSearchColumnProps {
  title: string;
  color: string;
  search: string;
  onSearchChange: (value: string) => void;
  results: SearchAsset[];
  isLoading: boolean;
  onAddPlayer: (player: SearchAsset) => void;
  pickSeason: string;
  onPickSeasonChange: (value: string) => void;
  pickRound: number;
  onPickRoundChange: (value: number) => void;
  pickTier: PickTier;
  onPickTierChange: (value: PickTier) => void;
  pickSlot: number | null;
  onPickSlotChange: (value: number | null) => void;
  onAddPick: () => void;
  addPickLabel: string;
}

export default function VacuumSearchColumn({
  title,
  color,
  search,
  onSearchChange,
  results,
  isLoading,
  onAddPlayer,
  pickSeason,
  onPickSeasonChange,
  pickRound,
  onPickRoundChange,
  pickTier,
  onPickTierChange,
  pickSlot,
  onPickSlotChange,
  onAddPick,
  addPickLabel,
}: VacuumSearchColumnProps) {
  const pickSelection = pickSelectionValue(pickTier, pickSlot);

  function handlePickSelection(value: PickSelection) {
    if (value.startsWith("slot:")) {
      const slot = Number(value.slice("slot:".length));
      onPickSlotChange(slot);
      onPickTierChange(tierFromGenericSlot(slot));
      return;
    }
    onPickSlotChange(null);
    if (isPickTier(value)) onPickTierChange(value);
  }

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
      <div style={{ color, fontSize: 12, fontWeight: 800, marginBottom: 10 }}>{title}</div>
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search for player..."
        style={{ width: "100%", boxSizing: "border-box", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "9px 12px", fontFamily: "inherit", fontSize: 13 }}
      />
      <div style={{ marginTop: 8, display: "grid", gap: 4, maxHeight: 320, overflowY: "auto" }}>
        {isLoading && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Searching...</div>}
        {!isLoading && search.trim().length >= 2 && !results.length && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No results.</div>}
        {results.map((player) => (
          <button
            key={player.player_id}
            type="button"
            onClick={() => onAddPlayer(player)}
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, background: "transparent", color: "var(--text)", display: "flex", gap: 8, alignItems: "center", padding: "7px 10px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
          >
            <PositionBadge position={player.position} />
            <span style={{ flex: 1, fontSize: 12 }}>{player.label}</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>+ {addPickLabel === "Send Pick" ? "SEND" : "GET"}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>Add Pick:</span>
        <select value={pickSeason} onChange={(event) => onPickSeasonChange(event.target.value)} style={{ background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text)", padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }}>{PICK_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}</select>
        <select value={pickRound} onChange={(event) => onPickRoundChange(Number(event.target.value))} style={{ background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text)", padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }}>{[1, 2, 3, 4].map((round) => <option key={round} value={round}>Round {round}</option>)}</select>
        <select value={pickSelection} onChange={(event) => handlePickSelection(event.target.value as PickSelection)} style={{ background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text)", padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }}>
          <option value="early">Early</option>
          <option value="mid">Mid</option>
          <option value="late">Late</option>
          {GENERIC_PICK_SLOTS.map((slot) => (
            <option key={slot} value={`slot:${slot}`}>
              {pickSlotLabel(pickRound, slot)}
            </option>
          ))}
        </select>
        <button type="button" onClick={onAddPick} style={{ background: color, border: "none", borderRadius: 7, color: "#fff", padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ {addPickLabel}</button>
      </div>
    </div>
  );
}
