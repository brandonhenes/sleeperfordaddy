export type SourceAgreement = "high" | "medium" | "low";

export function scoreAgreement(scores: (number | null)[]): SourceAgreement {
  const values = scores.filter((score): score is number => score != null);
  if (values.length <= 1) return "high";
  const spread = Math.max(...values) - Math.min(...values);
  return spread < 5 ? "high" : spread <= 12 ? "medium" : "low";
}
