interface VerdictBadgeProps {
  verdict:
    | "won"
    | "lost"
    | "push"
    | "likely_accept"
    | "might_accept"
    | "unlikely"
    | "no_chance"
    | null
    | undefined;
}

function getVerdictStyles(verdict: VerdictBadgeProps["verdict"]) {
  if (verdict === "won" || verdict === "likely_accept") {
    return {
      label: verdict === "won" ? "Won" : "Likely Accept",
      background: "rgba(34, 197, 94, 0.18)",
      borderColor: "rgba(34, 197, 94, 0.4)",
      color: "#4ade80",
    };
  }

  if (verdict === "lost" || verdict === "no_chance") {
    return {
      label: verdict === "lost" ? "Lost" : "No Chance",
      background: "rgba(239, 68, 68, 0.18)",
      borderColor: "rgba(239, 68, 68, 0.4)",
      color: "#f87171",
    };
  }

  if (verdict === "might_accept") {
    return {
      label: "Might Accept",
      background: "rgba(245, 158, 11, 0.16)",
      borderColor: "rgba(245, 158, 11, 0.38)",
      color: "#f59e0b",
    };
  }

  if (verdict === "unlikely") {
    return {
      label: "Unlikely",
      background: "rgba(249, 115, 22, 0.16)",
      borderColor: "rgba(249, 115, 22, 0.38)",
      color: "#fb923c",
    };
  }

  return {
    label: "Push",
    background: "rgba(152,162,179, 0.14)",
    borderColor: "rgba(152,162,179, 0.28)",
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
