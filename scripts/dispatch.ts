/**
 * The dispatcher of one agent runner. It runs every minute on each machine that has a Hermes.
 *
 *   tsx scripts/dispatch.ts [--dry-run] [--config <file>]
 *
 * One tick: register the runner, hand each queued item to the local Hermes as a one-time cron job,
 * and return each running item whose job ended with no report. --dry-run reads the board and writes
 * nothing. The delivery target of a new job comes from GTM_HERMES_DELIVER (default: local).
 * The exit code is 1 when any step failed.
 *
 * The default config is dispatch.local.json, which scripts/install-dispatcher.sh writes on each machine.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../server/src/dispatch/config.ts";
import { createHermesPort } from "../server/src/dispatch/hermes.ts";
import { runDispatch } from "../server/src/dispatch/run.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const usage = "Usage: dispatch [--dry-run] [--config <file>]";

function parseArgs(argv: string[]) {
  let dryRun = false;
  let configPath = path.resolve(here, "../dispatch.local.json");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--config") configPath = path.resolve(argv[++i] ?? "");
    else throw new Error(`Unknown argument ${arg}. ${usage}`);
  }
  return { dryRun, configPath };
}

const stamp = () => new Date().toISOString();

async function main() {
  const { dryRun, configPath } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(configPath)) throw new Error(`No dispatch config at ${configPath}. Run scripts/install-dispatcher.sh on this machine.`);
  const config = loadConfig(configPath);
  // The store import loads the shared .env, so the delivery target is read after it.
  const { itemStore } = await import("../server/src/items/default-store.ts");
  const deliver = process.env.GTM_HERMES_DELIVER || "local";

  const reportCommand = [path.resolve(here, "../server/node_modules/.bin/tsx"), path.resolve(here, "report-item.ts")].map((p) => `"${p}"`).join(" ");

  const lines = await runDispatch(config, { store: itemStore, hermes: createHermesPort(config), deliver, reportCommand, dryRun });

  if (lines.length === 0) console.log(`[${stamp()}] ${config.runner}: nothing to do${dryRun ? " (dry run)" : ""}`);
  for (const line of lines) (line.ok ? console.log : console.error)(`[${stamp()}] ${config.runner}: ${line.text}`);
  if (lines.some((l) => !l.ok)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[${stamp()}] ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
