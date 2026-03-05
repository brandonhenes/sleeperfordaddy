import { useState } from "react";

interface ShareButtonProps {
  /** Plain-text summary for "Copy as Text" */
  textSummary?: string;
}

export default function ShareButton({ textSummary }: ShareButtonProps) {
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copied!");
    } catch {
      showToast("Copy failed");
    }
  }

  async function copyText() {
    if (!textSummary) return;
    try {
      await navigator.clipboard.writeText(textSummary);
      showToast("Copied!");
    } catch {
      showToast("Copy failed");
    }
  }

  const btnStyle: React.CSSProperties = {
    background: "none",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <span style={{ position: "relative", display: "inline-flex", gap: 4 }}>
      <button onClick={copyLink} style={btnStyle}>
        Copy Link
      </button>
      {textSummary && (
        <button onClick={copyText} style={btnStyle}>
          Copy as Text
        </button>
      )}
      {toast && (
        <span
          style={{
            position: "absolute",
            top: -28,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--green)",
            color: "#000",
            padding: "3px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {toast}
        </span>
      )}
    </span>
  );
}
