/**
 * The items CLI. Run it through scripts/gtm-items, which works from any directory.
 *
 * stdout holds exactly one JSON object (see CliReport in server/src/items/cli.ts). Logs go to stderr.
 * The exit code is 0 when the report is ok, and 1 otherwise.
 */
import fs from "node:fs";
import { ITEMS_USAGE, runItemsCli } from "../server/src/items/cli.ts";

// A library that logs must not break the one JSON object on stdout.
console.log = console.error;
console.info = console.error;

async function openStore(dryRun: boolean) {
  const store = await import("../server/src/items/default-store.ts");
  return dryRun ? store.dryRunItemStore() : store.itemStore;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.error(ITEMS_USAGE);
    return;
  }
  const report = await runItemsCli(argv, { openStore, readFile: (file) => fs.readFileSync(file, "utf8") });
  if (report.dry_run) console.error("Dry run: nothing was written.");
  for (const { key, message } of report.errors) console.error(key ? `${key}: ${message}` : message);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
