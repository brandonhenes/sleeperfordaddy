interface VerdictBadgeProps {
  verdict: "won" | "lost" | "push" | null | undefined;
}

function getVerdictStyles(verdict: VerdictBadgeProps["verdict"]) {
  if (verdict === "won") {
    return {
      label: "Won",
      background: "rgba(34, 197, 94, 0.18)",
      borderColor: "rgba(34, 197, 94, 0.4)",
      color: "#4ade80",
    };
  }

  if (verdict === "lost") {
    return {
      label: "Lost",
      background: "rgba(239, 68, 68, 0.18)",
      borderColor: "rgba(239, 68, 68, 0.4)",
      color: "#f87171",
    };
  }

  return {
    label: "Push",
    background: "rgba(148, 163, 184, 0.14)",
    borderColor: "rgba(148, 163, 184, 0.28)",
    color: "#cbd5e1",
  };
}

export default function VerdictBadge({ verdict }: VerdictBadgeProps) {
  const styles = getVerdictStyles(verdict);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 58,
        padding: "5px 10px",
        borderRadius: 999,
        border: `1px solid ${styles.borderColor}`,
        background: styles.background,
        color: styles.color,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      {styles.label}
    </span>
  );
}
