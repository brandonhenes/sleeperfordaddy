type TradeActionButtonsProps = {
  selectedLeague: string;
  copied: boolean;
  onCopyTradeMessage: () => void;
};

export default function TradeActionButtons({
  selectedLeague,
  copied,
  onCopyTradeMessage,
}: TradeActionButtonsProps) {
  return (
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
        onClick={onCopyTradeMessage}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 16px",
          borderRadius: 8,
          background: "rgba(61,139,253,0.15)",
          border: "1px solid rgba(61,139,253,0.3)",
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
  );
}
