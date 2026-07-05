import type { ReactNode } from "react";
import Card from "./Card";

interface ErrorStateProps {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}

export default function ErrorState({
  title = "Something went wrong",
  message,
  actionLabel,
  onAction,
  children,
}: ErrorStateProps) {
  return (
    <Card className="edge-state-card edge-state-error" role="alert">
      <div className="edge-state-kicker">Error</div>
      <h2>{title}</h2>
      <p>{message}</p>
      {children}
      {actionLabel && onAction && (
        <button type="button" className="edge-primary-button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </Card>
  );
}
