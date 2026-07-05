import Card from "./Card";

interface LoadingSkeletonProps {
  label?: string;
  rows?: number;
}

export default function LoadingSkeleton({
  label = "Loading",
  rows = 3,
}: LoadingSkeletonProps) {
  return (
    <Card className="edge-loading-card" aria-busy="true" aria-live="polite">
      <div className="edge-loading-label">{label}</div>
      <div className="edge-skeleton-stack">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="edge-skeleton-row">
            <span />
            <span />
          </div>
        ))}
      </div>
    </Card>
  );
}
