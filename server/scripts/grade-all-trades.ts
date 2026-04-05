import { gradeAllTrades } from "../services/trade-intelligence.js";

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const leagueId = getArg("league");
  const result = await gradeAllTrades({ leagueId });
  console.log(
    `[trade-intelligence] graded=${result.graded} skipped=${result.skipped} leagues=${result.leagues}`
  );
}

main().catch((error) => {
  console.error("[trade-intelligence] Fatal error:", error);
  process.exit(1);
});
