import type { ReactNode } from "react";

export interface SegmentedControlItem<T extends string> {
  key: T;
  label: ReactNode;
  description?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  items: SegmentedControlItem<T>[];
  value: T | null;
  onChange: (key: T) => void;
  ariaLabel?: string;
}

export default function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  ariaLabel = "Options",
}: SegmentedControlProps<T>) {
  return (
    <div className="edge-segmented" role="radiogroup" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = value === item.key;
        return (
          <button
            key={item.key}
            type="button"
            role="radio"
            aria-checked={active}
            className={`edge-segmented-button ${active ? "active" : ""}`}
            onClick={() => onChange(item.key)}
          >
            <span>{item.label}</span>
            {item.description && (
              <span className="edge-segmented-description">{item.description}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
