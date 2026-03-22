import type { Request } from "express";
import {
  areDefaultSourceWeights,
  type SourceWeights,
} from "../services/edge-score.js";

/** Parse optional source weights from query params. Returns undefined when absent or default. */
export function parseWeights(req: Request): SourceWeights | undefined {
  const fc = parseFloat(req.query.fc_w as string);
  const ktc = parseFloat(req.query.ktc_w as string);
  const dp = parseFloat(req.query.dp_w as string);
  if (isNaN(fc) || isNaN(ktc) || isNaN(dp)) return undefined;
  if (fc < 0 || ktc < 0 || dp < 0 || fc + ktc + dp <= 0) return undefined;
  const weights = { fc, ktc, dp };
  if (areDefaultSourceWeights(weights)) return undefined;
  return weights;
}
