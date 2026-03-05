import type { Request } from "express";
import type { SourceWeights } from "../services/edge-score.js";

/** Parse optional source weights from query params. Returns undefined if equal/default. */
export function parseWeights(req: Request): SourceWeights | undefined {
  const fc = parseFloat(req.query.fc_w as string);
  const ktc = parseFloat(req.query.ktc_w as string);
  const dp = parseFloat(req.query.dp_w as string);
  if (isNaN(fc) || isNaN(ktc) || isNaN(dp)) return undefined;
  if (fc === 1 && ktc === 1 && dp === 1) return undefined;
  return { fc, ktc, dp };
}
