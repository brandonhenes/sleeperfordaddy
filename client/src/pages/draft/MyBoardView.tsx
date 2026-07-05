import { useState } from "react";
import { PlayerLink } from "../../components/ui";
import type { Prospect } from "@shared/types";
import { posColor } from "../../lib/position-colors";
import TierBadge from "./TierBadge";
import { TIER_CONFIG, TIER_ORDER, type MyBoardState, type TierKey } from "./rookie-draft-config";

type MyBoardViewProps = {
  prospects: Prospect[];
  myBoard: MyBoardState;
  onSetTier: (name: string, tier: string) => void;
  onRemove: (name: string) => void;
  onExport: () => void;
};

export default function MyBoardView({
  prospects,
  myBoard,
  onSetTier,
  onRemove,
  onExport,
}: MyBoardViewProps) {
  const [addSearch, setAddSearch] = useState("");

  const assigned = new Map<TierKey, Prospect[]>();
  for (const tier of TIER_ORDER) assigned.set(tier, []);
  for (const p of prospects) {
    const customTier = (myBoard[p.player_name] ?? "").toLowerCase();
    if (TIER_ORDER.includes(customTier as TierKey)) {
      assigned.get(customTier as TierKey)!.push(p);
    }
  }

  const totalAssigned = [...assigned.values()].reduce((sum, arr) => sum + arr.length, 0);
  const unassigned = prospects.filter((p) => !myBoard[p.player_name]);
  const searchResults =
    addSearch.trim().length >= 2
      ? unassigned
          .filter(
            (p) =>
              p.player_name.toLowerCase().includes(addSearch.toLowerCase()) ||
              (p.position ?? "").toLowerCase() === addSearch.toLowerCase(),
          )
          .slice(0, 10)
      : [];

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700 }}>My Draft Board</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
            {totalAssigned} ranked
          </span>
        </div>
        <button
          onClick={onExport}
          disabled={totalAssigned === 0}
          style={{
            background: totalAssigned > 0 ? "var(--amber)" : "var(--border)",
            color: totalAssigned > 0 ? "var(--dark-base)" : "var(--text-muted)",
            border: "none",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 700,
            cursor: totalAssigned > 0 ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          Copy to Clipboard
        </button>
      </div>

      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
        }}
      >
        <input
          value={addSearch}
          onChange={(e) => setAddSearch(e.target.value)}
          placeholder="Search prospect to add to your board..."
          style={{
            width: "100%",
            background: "var(--dark-base)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 13,
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
        {searchResults.length > 0 && (
          <div style={{ marginTop: 8, display: "grid", gap: 4, maxHeight: 200, overflowY: "auto" }}>
            {searchResults.map((p) => (
              <div
                key={p.player_name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 6,
                  fontSize: 12,
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ fontWeight: 600, flex: 1 }}>
                  <span style={{ color: posColor(p.position ?? ""), marginRight: 4 }}>{p.position}</span>
                  {p.player_name}
                </span>
                <TierBadge tier={p.tier} />
                {TIER_ORDER.map((t) => {
                  const cfg = TIER_CONFIG[t];
                  return (
                    <button
                      key={t}
                      onClick={() => {
                        onSetTier(p.player_name, t);
                        setAddSearch("");
                      }}
                      style={{
                        background: "none",
                        border: `1px solid ${cfg.border}`,
                        borderRadius: 4,
                        padding: "2px 6px",
                        fontSize: 9,
                        fontWeight: 700,
                        color: cfg.text,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                      title={`Add to ${cfg.label}`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {TIER_ORDER.map((tier) => {
        const players = assigned.get(tier) ?? [];
        const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.flier;

        return (
          <div
            key={tier}
            style={{
              border: `1px solid ${cfg.border}`,
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 12,
              opacity: players.length === 0 ? 0.5 : 1,
            }}
          >
            <div
              style={{
                background: cfg.headerBg,
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderBottom: `1px solid ${cfg.border}`,
              }}
            >
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 800,
                  background: cfg.bg,
                  color: cfg.text,
                }}
              >
                {cfg.label}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {players.length} player{players.length !== 1 ? "s" : ""}
              </span>
            </div>

            {players.length === 0 ? (
              <div style={{ padding: "16px", fontSize: 12, color: "var(--text-muted)", textAlign: "center", background: cfg.bg }}>
                Use search above to add players here
              </div>
            ) : (
              <div style={{ background: cfg.bg }}>
                {players.map((p) => (
                  <div
                    key={p.player_name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 16px",
                      borderBottom: `1px solid ${cfg.border}`,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: posColor(p.position ?? ""), fontSize: 11, width: 24 }}>
                      {p.position}
                    </span>
                    <PlayerLink name={p.player_name} style={{ flex: 1, fontSize: 13 }} />
                    {p.school && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.school}</span>}
                    <select
                      value={tier}
                      onChange={(e) => onSetTier(p.player_name, e.target.value)}
                      style={{
                        background: "var(--dark-base)",
                        color: "var(--text-dim)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        padding: "2px 4px",
                        fontSize: 10,
                        cursor: "pointer",
                      }}
                    >
                      {TIER_ORDER.map((t) => (
                        <option key={t} value={t}>
                          {TIER_CONFIG[t]?.label ?? t}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => onRemove(p.player_name)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--red)",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "2px 4px",
                      }}
                    >
                      {"\u2715"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
