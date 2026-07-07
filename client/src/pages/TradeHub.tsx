import { ArrowRight, Calculator, ClipboardList, Search, ShoppingBag, TicketPlus } from "lucide-react";
import { Link } from "wouter";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import { Card, PageHeader } from "../components/ui";
import { SlipTicketRow } from "../components/slip/SlipDock";
import { useCurrentUsername } from "../hooks/use-current-user";
import { useLeagueSummaries } from "../hooks/use-league-summaries";
import { useTradeBoardLines } from "../hooks/use-trade-finder";
import { useBuyingWindows } from "../hooks/use-injury-tracker";
import { acceptanceBand, useSlip, type SlipLeg } from "../lib/slip";
import { formatTradeValue, humanize } from "../lib/format";
import { buildTradeFinderUrl } from "../lib/trade-finder-url";
import type { BuyingWindow, TradeAssetInput, TradeBoardLine, TradePackage, TradePackageAsset } from "@shared/types";

const BOARD_LEAGUE_SCAN_COUNT = 6;
const BOARD_VISIBLE_LINE_COUNT = 3;

const tools = [
  { label: "Calculator", description: "League-adjusted value check", href: "/trade-calculator", icon: Calculator },
  { label: "Finder", description: "Partner and package ideas", href: (u: string) => buildTradeFinderUrl(u, { mode: "find" }), icon: Search },
  { label: "Shop", description: "Sell one player across leagues", href: (u: string) => buildTradeFinderUrl(u, { mode: "shop" }), icon: ShoppingBag },
  { label: "Log", description: "Grades and manager history", href: (u: string) => `/trade-history/${encodeURIComponent(u)}`, icon: ClipboardList },
];

function packageAssetToInput(a: TradePackageAsset): TradeAssetInput {
  if (a.asset_type === "player" && a.player_id) {
    return { type: "player", player_id: a.player_id };
  }
  return {
    type: "pick",
    pick_season: a.pick_season,
    pick_round: a.pick_round,
    pick_tier: a.pick_tier,
    pick_slot: a.pick_slot ?? null,
    pick_label: a.label,
    pick_original_owner_id: a.pick_original_owner_id ?? null,
  };
}

function packageToLegs(pkg: TradePackage): SlipLeg[] {
  const send: SlipLeg[] = pkg.you_send.map((a) => ({
    side: "send" as const,
    asset: packageAssetToInput(a),
    label: a.label,
    position: a.position,
  }));
  const receive: SlipLeg[] = pkg.you_receive.map((a) => ({
    side: "receive" as const,
    asset: packageAssetToInput(a),
    label: a.label,
    position: a.position,
  }));
  return [...send, ...receive];
}

function TicketSkeleton() {
  return (
    <div className="ticket-card animate-pulse" aria-hidden>
      <div style={{ height: 12, width: "55%", borderRadius: 6, background: "var(--card-hover)" }} />
      <div style={{ height: 10, width: "85%", borderRadius: 6, background: "var(--card-hover)" }} />
      <div style={{ height: 10, width: "75%", borderRadius: 6, background: "var(--card-hover)" }} />
      <div style={{ height: 24, width: "40%", borderRadius: 8, background: "var(--card-hover)" }} />
    </div>
  );
}

function BoardPreparingCard() {
  return (
    <div className="ticket-card">
      <div className="ticket-card-head">
        <span className="ticket-card-league">Preparing best lines</span>
        <span className="ticket-tag">Building</span>
      </div>
      <div className="ticket-card-foot">
        <span className="ticket-reason">
          First load is warming league-adjusted values. Cached lines will appear here automatically.
        </span>
      </div>
    </div>
  );
}

function BoardEmptyCard({ username }: { username: string }) {
  return (
    <div className="ticket-card">
      <div className="ticket-card-head">
        <span className="ticket-card-league">No strong lines cached</span>
        <span className="ticket-tag">Refine</span>
      </div>
      <div className="ticket-card-foot">
        <span className="ticket-reason">
          The best-line scan did not find a default trade worth surfacing. Pick a league and partner for targeted lanes.
        </span>
      </div>
      <Link
        href={buildTradeFinderUrl(username, { mode: "find" })}
        className="edge-secondary-button"
        style={{ minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, textDecoration: "none" }}
      >
        Open Finder
      </Link>
    </div>
  );
}

function LeagueNoLineCard({ username, leagueId, leagueName }: {
  username: string;
  leagueId: string;
  leagueName: string;
}) {
  return (
    <div className="ticket-card">
      <div className="ticket-card-head">
        <span className="ticket-card-league">{leagueName}</span>
        <span className="ticket-tag">No line</span>
      </div>
      <div className="ticket-card-foot">
        <span className="ticket-reason">
          No realistic default trade survived the board filter. Use partner-first Finder for targeted lanes.
        </span>
      </div>
      <Link
        href={buildTradeFinderUrl(username, { mode: "find", leagueId })}
        className="edge-secondary-button"
        style={{ minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, textDecoration: "none" }}
      >
        Open Finder
      </Link>
    </div>
  );
}

function LeagueBestLine({ line, leagueId, leagueName, username, isLoading }: {
  line: TradeBoardLine | undefined;
  leagueId: string;
  leagueName: string;
  username: string;
  isLoading: boolean;
}) {
  const slip = useSlip();

  if (isLoading) return <TicketSkeleton />;
  if (!line) return <LeagueNoLineCard username={username} leagueId={leagueId} leagueName={leagueName} />;
  const { package: pkg, partner } = line;
  const probability = pkg.acceptance?.probability ?? null;
  const band = acceptanceBand(probability);

  return (
    <div className="ticket-card">
      <div className="ticket-card-head">
        <span className="ticket-card-league">{leagueName}</span>
        {(pkg.strategy_label || pkg.opportunity_type) && (
          <span className="ticket-tag">
            {pkg.strategy_label ?? (pkg.opportunity_type ? humanize(pkg.opportunity_type) : "")}
          </span>
        )}
      </div>
      <div className="ticket-line">
        <span className="who" style={{ color: "var(--red)" }}>GIVE {pkg.you_send.map((a) => a.label).join(", ")}</span>
        <span style={{ color: "var(--red)", flexShrink: 0 }}>{formatTradeValue(pkg.send_context_trade_value ?? pkg.send_total)}</span>
      </div>
      <div className="ticket-line">
        <span className="who" style={{ color: "var(--green)" }}>GET {pkg.you_receive.map((a) => a.label).join(", ")}</span>
        <span style={{ color: "var(--green)", flexShrink: 0 }}>{formatTradeValue(pkg.receive_context_trade_value ?? pkg.receive_total)}</span>
      </div>
      <div className="ticket-card-foot">
        <span className="ticket-reason">
          {partner.display_name} · {partner.archetype}{partner.recent_trades > 0 ? ` · ${partner.recent_trades} recent trades` : ""}. {pkg.why_they_accept}
        </span>
        {band && (
          <span className="ticket-odds" title={probability != null ? `${Math.round(probability)}% model read` : undefined}>
            {band}
          </span>
        )}
      </div>
      <button
        type="button"
        className="edge-secondary-button"
        style={{ minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}
        onClick={() =>
          slip.loadTicket({
            legs: packageToLegs(pkg),
            leagueId,
            opponentRosterId: partner.roster_id,
          })
        }
      >
        <TicketPlus size={14} aria-hidden /> Load slip
      </button>
    </div>
  );
}

function ClosingSoonCard({ window: w }: { window: BuyingWindow }) {
  const slip = useSlip();
  const target = w.leagues_to_target[0];
  const drop = w.player.fc_at_injury && w.player.fc_current
    ? Math.round(((w.player.fc_at_injury - w.player.fc_current) / w.player.fc_at_injury) * 100)
    : null;

  return (
    <div className="ticket-card">
      <div className="ticket-card-head">
        <span className="ticket-card-league">{w.player.full_name} · {w.player.position}</span>
        <span className="ticket-tag">{w.player.return_label ?? "BUY WINDOW"}</span>
      </div>
      <div className="ticket-card-foot">
        <span className="ticket-reason">
          {drop != null ? `Down ${drop}% since injury. ` : ""}
          {w.buy_reasons[0] ?? "Value dip with a mapped return date."}
          {target ? ` Held by ${target.owner_display_name} in ${target.league_name}.` : ""}
        </span>
        <span className="ticket-odds" style={{ background: "var(--warning)", color: "var(--dark)" }}>{Math.round(w.opportunity_score)}</span>
      </div>
      {target && (
        <button
          type="button"
          className="edge-secondary-button"
          style={{ minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}
          onClick={() =>
            slip.loadTicket({
              legs: [{ side: "receive", asset: { type: "player", player_id: w.player.player_id }, label: `${w.player.full_name} (${w.player.position})`, position: w.player.position }],
              leagueId: target.league_id,
            })
          }
        >
          <TicketPlus size={14} aria-hidden /> Start a buy slip
        </button>
      )}
    </div>
  );
}

export default function TradeHub() {
  const { username } = useCurrentUsername();
  const { data: leagues = [], isLoading: leaguesLoading } = useLeagueSummaries(username, false);
  const { data: windows = [] } = useBuyingWindows(username);
  const slip = useSlip();

  const boardLeagues = leagues.slice(0, BOARD_LEAGUE_SCAN_COUNT);
  const boardLeagueIds = boardLeagues.map((league) => league.league_id);
  const boardLinesQuery = useTradeBoardLines(username, boardLeagueIds);
  const boardResponse = boardLinesQuery.data;
  const boardLinesByLeague = new Map(
    (boardResponse?.lines ?? []).map((line) => [line.league_id, line])
  );
  const actionableBoardLines = boardLeagues
    .map((league) => boardLinesByLeague.get(league.league_id))
    .filter((line): line is TradeBoardLine => Boolean(line))
    .slice(0, BOARD_VISIBLE_LINE_COUNT);
  const boardBuilding =
    boardResponse?.status === "building" && (boardResponse.lines?.length ?? 0) === 0;
  const boardLoading =
    boardLeagues.length > 0 &&
    !boardBuilding &&
    (boardLinesQuery.isLoading || (boardLinesQuery.isFetching && !boardResponse));
  const boardEmpty =
    boardLeagues.length > 0 &&
    !boardLoading &&
    !boardBuilding &&
    boardResponse?.status === "ready" &&
    (boardResponse.lines?.length ?? 0) === 0;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Trade desk"
        title="Trade"
        subtitle="Today's best lines across your leagues. Load one onto the slip, tweak it, pitch it."
      />
      <FreshnessBar />

      <div className="board-section-label">Best lines today</div>
      {leaguesLoading && (
        <div className="board-rail">
          <TicketSkeleton />
          <TicketSkeleton />
        </div>
      )}
      {!leaguesLoading && boardLeagues.length === 0 && (
        <div className="edge-card" style={{ color: "var(--text-muted)", fontSize: 13 }}>
          No leagues synced yet — run a sync from the dashboard first.
        </div>
      )}
      <div className="board-rail">
        {boardBuilding
          ? <BoardPreparingCard />
          : boardEmpty
            ? <BoardEmptyCard username={username} />
            : actionableBoardLines.length > 0
              ? actionableBoardLines.map((line) => (
              <LeagueBestLine
                key={line.league_id}
                line={line}
                leagueId={line.league_id}
                leagueName={line.league_name}
                username={username}
                isLoading={boardLoading}
              />
              ))
              : boardLeagues.slice(0, BOARD_VISIBLE_LINE_COUNT).map((l) => (
                <LeagueBestLine
                  key={l.league_id}
                  line={undefined}
                  leagueId={l.league_id}
                  leagueName={l.league_name}
                  username={username}
                  isLoading={boardLoading}
                />
              ))}
      </div>
      {leagues.length > BOARD_LEAGUE_SCAN_COUNT && (
        <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: 11 }}>
          Showing up to {BOARD_VISIBLE_LINE_COUNT} lines from your top {BOARD_LEAGUE_SCAN_COUNT} leagues. Open Finder for the full board.
        </p>
      )}

      {windows.length > 0 && (
        <>
          <div className="board-section-label">Closing soon</div>
          <div className="board-rail">
            {windows.slice(0, 4).map((w) => (
              <ClosingSoonCard key={w.player.player_id} window={w} />
            ))}
          </div>
        </>
      )}

      {slip.tickets.length > 0 && (
        <>
          <div className="board-section-label">Open tickets</div>
          <div style={{ display: "grid", gap: 8 }}>
            {slip.tickets.map((t) => (
              <SlipTicketRow
                key={t.id}
                id={t.id}
                onLoad={() => slip.loadTicket({ legs: t.legs, leagueId: t.league_id, opponentRosterId: t.opponent_roster_id })}
              />
            ))}
          </div>
        </>
      )}

      <div className="board-section-label">Tools</div>
      <div className="edge-tool-grid">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const href = typeof tool.href === "function" ? tool.href(username) : tool.href;
          return (
            <Link key={tool.label} href={href}>
              <Card className="edge-tool-card">
                <div className="edge-tool-icon">
                  <Icon size={20} aria-hidden="true" />
                </div>
                <div className="edge-tool-copy">
                  <h2>{tool.label}</h2>
                  <p>{tool.description}</p>
                </div>
                <ArrowRight className="edge-tool-arrow" size={18} aria-hidden="true" />
              </Card>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
