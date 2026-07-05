type CompareTrayProps = {
  compareList: string[];
  onRemove: (name: string) => void;
  onCompare: () => void;
  onClear: () => void;
};

export default function CompareTray({ compareList, onRemove, onCompare, onClear }: CompareTrayProps) {
  if (compareList.length < 2) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "var(--card)",
        borderTop: "2px solid var(--amber)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        zIndex: 100,
      }}
    >
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{compareList.length} selected</span>
      <div style={{ display: "flex", gap: 6 }}>
        {compareList.map((name) => (
          <span
            key={name}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 12,
              background: "var(--dark-base)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {name}
            <button
              onClick={() => onRemove(name)}
              style={{
                background: "none",
                border: "none",
                color: "var(--red)",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 800,
                padding: 0,
              }}
            >
              {"\u2715"}
            </button>
          </span>
        ))}
      </div>
      <button
        onClick={onCompare}
        style={{
          background: "var(--amber)",
          color: "var(--dark-base)",
          border: "none",
          borderRadius: 8,
          padding: "8px 20px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Compare
      </button>
      <button
        onClick={onClear}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 16px",
          fontSize: 12,
          color: "var(--text-muted)",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Clear
      </button>
    </div>
  );
}
