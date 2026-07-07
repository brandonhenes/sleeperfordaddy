type CompareTrayProps = {
  compareList: string[];
  onRemove: (name: string) => void;
  onCompare: () => void;
  onClear: () => void;
};

export default function CompareTray({ compareList, onRemove, onCompare, onClear }: CompareTrayProps) {
  if (compareList.length < 2) return null;

  return (
    <div className="compare-tray">
      <span className="compare-tray-count">{compareList.length} selected</span>
      <div className="compare-tray-list">
        {compareList.map((name) => (
          <span key={name} className="compare-tray-chip">
            <span>{name}</span>
            <button
              type="button"
              onClick={() => onRemove(name)}
              className="compare-tray-remove"
              aria-label={`Remove ${name}`}
            >
              {"\u2715"}
            </button>
          </span>
        ))}
      </div>
      <div className="compare-tray-actions">
        <button
          type="button"
          onClick={onCompare}
          className="compare-tray-primary"
        >
          Compare
        </button>
        <button
          type="button"
          onClick={onClear}
          className="compare-tray-secondary"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
