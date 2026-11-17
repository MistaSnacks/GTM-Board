/**
 * Collectors for the Today page.
 *
 *   tsx scripts/collect.ts <git|github|hermes|harness|recurring|all> [--dry-run] [--config <file>]
 *
 * --dry-run prints the items as JSON on stdout and writes nothing, not even a Supabase connection.
 * Without it each source writes through the item store. Counts and errors go to stderr (dry run)
 * or stdout (write run). The exit code is 1 when any source failed.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../server/src/collectors/config.ts";
import { COLLECTOR_NAMES, type CollectorName } from "../server/src/collectors/index.ts";
import { runCollectors, type SourceReport } from "../server/src/collectors/run.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const usage = `Usage: collect <${[...COLLECTOR_NAMES, "all"].join("|")}> [--dry-run] [--config <file>]`;

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let dryRun = false;
  let configPath = path.resolve(here, "../collectors.config.json");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--config") configPath = path.resolve(argv[++i] ?? "");
    else if (arg.startsWith("--")) throw new Error(`Unknown flag ${arg}. ${usage}`);
    else positional.push(arg);
  }
  const [command, ...rest] = positional;
  if (!command || rest.length > 0) throw new Error(usage);
  if (command !== "all" && !(COLLECTOR_NAMES as string[]).includes(command)) throw new Error(`Unknown collector ${command}. ${usage}`);
  const names = command === "all" ? COLLECTOR_NAMES : [command as CollectorName];
  return { names, dryRun, configPath };
}

const stamp = () => new Date().toISOString();

function describe(report: SourceReport): string {
  if (!report.ok) return `${report.source} FAILED, ${report.error}`;
  if (!report.written) return `${report.source}: ${report.items.length} items`;
  const { written } = report;
  const detail =
    "added" in written
      ? `${written.added.length} added`
      : (["created", "updated", "reopened", "skipped_closed", "resolved"] as const).map((k) => `${written[k].length} ${k}`).join(", ");
  return `${report.source}: ${report.items.length} items, ${detail}`;
}

async function main() {
  const { names, dryRun, configPath } = parseArgs(process.argv.slice(2));
  const config = loadConfig(configPath);
  const store = dryRun ? undefined : (await import("../server/src/items/default-store.ts")).itemStore;
  const reports = await runCollectors(names, config, { store });

  if (dryRun) {
    console.log(JSON.stringify(reports.flatMap((r) => r.items), null, 2));
    for (const r of reports) console.error(r.error ? `${r.source} FAILED, ${r.error}` : `${r.source}: ${r.items.length} items`);
  } else {
    for (const r of reports) (r.ok ? console.log : console.error)(`[${stamp()}] ${describe(r)}`);
  }
  if (reports.some((r) => !(dryRun ? r.error === undefined : r.ok))) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[${stamp()}] ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
