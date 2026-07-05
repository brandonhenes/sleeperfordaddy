import { Component, type ErrorInfo, type ReactNode } from "react";
import { recoverFromAppLoadError, isRecoverableAppLoadError } from "../lib/app-recovery";
import { Card } from "./ui";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
  isRecoverable: boolean;
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    isRecoverable: false,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      error,
      isRecoverable: isRecoverableAppLoadError(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App render failed", error, info);
    if (isRecoverableAppLoadError(error)) {
      void recoverFromAppLoadError();
    }
  }

  private refreshApp = () => {
    void recoverFromAppLoadError(true);
  };

  private goHome = () => {
    window.location.assign("/");
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-screen bg-[var(--dark)] text-[var(--text)] grid place-items-center px-4">
        <Card className="edge-state-card edge-state-error" role="alert">
          <div className="edge-state-kicker">App recovery</div>
          <h2>The Edge needs a refresh</h2>
          <p>
            {this.state.isRecoverable
              ? "A stale app file stopped this screen from loading. Refreshing should pull the newest version."
              : "This screen hit an unexpected error. Refresh the app or return home and try again."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="edge-primary-button" onClick={this.refreshApp}>
              Refresh App
            </button>
            <button type="button" className="edge-secondary-button" onClick={this.goHome}>
              Go Home
            </button>
          </div>
        </Card>
      </main>
    );
  }
}
