export interface TabBarItem<T extends string> {
  key: T;
  label: string;
}

interface TabBarProps<T extends string> {
  tabs: TabBarItem<T>[];
  active: T;
  onChange: (key: T) => void;
  ariaLabel?: string;
}

export default function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel = "Page tabs",
}: TabBarProps<T>) {
  return (
    <div className="edge-tabbar" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={`edge-tab ${active === tab.key ? "active" : ""}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
