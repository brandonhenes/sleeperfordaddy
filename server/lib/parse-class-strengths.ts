import type { Request } from "express";
import type { ClassStrengthMap } from "../services/pick-values.js";

export function parseClassStrengths(req: Request): ClassStrengthMap | undefined {
  const out: ClassStrengthMap = {};
  for (const [key, raw] of Object.entries(req.query)) {
    if (!key.startsWith("cs_")) continue;
    const season = key.slice(3);
    const rawValue = Array.isArray(raw) ? raw[0] : raw;
    const value = parseFloat(typeof rawValue === "string" ? rawValue : String(rawValue));
    if (!Number.isFinite(value)) continue;
    out[season] = Math.min(1.5, Math.max(0.7, value));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
