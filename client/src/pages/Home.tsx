import { useState } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const [username, setUsername] = useState("");
  const [, navigate] = useLocation();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    if (trimmed) {
      navigate(`/user/${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-3">Sleeper Scout</h1>
        <p className="text-sleeper-muted text-lg">
          Fantasy football analytics that Sleeper doesn't show you
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-md">
        <div className="flex gap-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter Sleeper username..."
            className="flex-1 bg-sleeper-surface border border-sleeper-border rounded-lg px-4 py-3 text-sleeper-text placeholder-sleeper-muted focus:outline-none focus:ring-2 focus:ring-sleeper-accent focus:border-transparent"
            autoFocus
          />
          <button
            type="submit"
            disabled={!username.trim()}
            className="bg-sleeper-accent text-white font-semibold px-6 py-3 rounded-lg hover:bg-sleeper-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Scout
          </button>
        </div>
      </form>
    </div>
  );
}
