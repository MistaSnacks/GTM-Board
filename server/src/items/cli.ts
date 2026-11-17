import { parseArgs } from "node:util";
import { PartialWriteError, type ItemStore, type SyncResult } from "./store.ts";
import { ITEM_STATUSES, parseItemInput, parseUpdatePatch, type Item, type ItemInput, type ItemStatus } from "./types.ts";

export const ITEMS_USAGE = `Usage:
  gtm-items add --file <items.json> [--dry-run]
  gtm-items sync --source <source> --file <items.json> --complete [--allow-empty] [--dry-run]
  gtm-items update (--key <dedupe_key> | --id <uuid>) --file <patch.json> [--dry-run]
  gtm-items list [--source <source>] [--status <status>] [--project <slug>]`;

export interface CliError {
  /** The dedupe key, or the --key or --id of an update. Null for a fault of the whole call. */
  key: string | null;
  message: string;
}

/** The one JSON object the CLI prints. Each list holds dedupe keys. */
export interface CliReport {
  ok: boolean;
  command: string | null;
  dry_run: boolean;
  created: string[];
  updated: string[];
  skipped_closed: string[];
  closed: string[];
  not_found: string[];
  errors: CliError[];
  items?: Item[];
}

export type CliStore = Pick<ItemStore, "addItem" | "syncItems" | "findItem" | "updateItem" | "listItems">;

export interface CliDeps {
  /** With dryRun the store reads the board and writes nothing. */
  openStore(dryRun: boolean): Promise<CliStore>;
  readFile(path: string): string;
}

class UsageError extends Error {
  constructor(message: string) {
    super(`${message}\n${ITEMS_USAGE}`);
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

const OPTIONS = {
  add: { file: { type: "string" }, "dry-run": { type: "boolean" } },
  sync: {
    source: { type: "string" },
    file: { type: "string" },
    complete: { type: "boolean" },
    "allow-empty": { type: "boolean" },
    "dry-run": { type: "boolean" },
  },
  update: { key: { type: "string" }, id: { type: "string" }, file: { type: "string" }, "dry-run": { type: "boolean" } },
  list: { source: { type: "string" }, status: { type: "string" }, project: { type: "string" } },
} as const;

type Command = keyof typeof OPTIONS;
type Flags = { [name: string]: string | boolean | undefined };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCommand(argv: string[]): { command: Command; flags: Flags } {
  const [command, ...rest] = argv;
  if (!command || !Object.hasOwn(OPTIONS, command)) throw new UsageError(command ? `Unknown command ${command}.` : "No command.");
  try {
    const { values } = parseArgs({ args: rest, options: OPTIONS[command as Command], strict: true, allowPositionals: false });
    return { command: command as Command, flags: values as Flags };
  } catch (err) {
    throw new UsageError(message(err));
  }
}

function need(flags: Flags, name: string): string {
  const value = flags[name];
  if (typeof value !== "string" || value === "") throw new UsageError(`--${name} is required.`);
  return value;
}

function readJson(deps: CliDeps, file: string): unknown {
  let text: string;
  try {
    text = deps.readFile(file);
  } catch (err) {
    throw new Error(`Cannot read ${file}: ${message(err)}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${file} is not JSON: ${message(err)}`);
  }
}

/** Every item must parse and every key must be unique, or the call writes nothing. */
function parseItems(raw: unknown, report: CliReport): ItemInput[] | null {
  if (!Array.isArray(raw)) {
    report.errors.push({ key: null, message: "The file must hold a JSON array of items" });
    return null;
  }
  const items: ItemInput[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, idx) => {
    const rawKey = (entry as { dedupe_key?: unknown } | null)?.dedupe_key;
    const key = typeof rawKey === "string" ? rawKey : null;
    try {
      const item = parseItemInput(entry, `[${idx}].`);
      if (seen.has(item.dedupe_key)) throw new Error(`[${idx}]: dedupe_key ${item.dedupe_key} appears twice in the file`);
      seen.add(item.dedupe_key);
      items.push(item);
    } catch (err) {
      report.errors.push({ key, message: message(err) });
    }
  });
  return report.errors.length ? null : items;
}

function recordSync(report: CliReport, result: SyncResult): void {
  report.created.push(...result.created);
  report.updated.push(...result.updated, ...result.reopened);
  report.skipped_closed.push(...result.skipped_closed);
  report.closed.push(...result.resolved);
}

const CLOSING: ReadonlySet<ItemStatus> = new Set(["done", "dismissed"]);

const RUN: Record<Command, (flags: Flags, deps: CliDeps, report: CliReport) => Promise<void>> = {
  async add(flags, deps, report) {
    const items = parseItems(readJson(deps, need(flags, "file")), report);
    if (!items) return;
    const store = await deps.openStore(report.dry_run);
    for (const item of items) {
      try {
        const result = await store.addItem(item);
        (result.created ? report.created : result.closed ? report.skipped_closed : report.updated).push(item.dedupe_key);
      } catch (err) {
        report.errors.push({ key: item.dedupe_key, message: message(err) });
      }
    }
  },

  async sync(flags, deps, report) {
    const source = need(flags, "source");
    const file = need(flags, "file");
    if (flags.complete !== true) {
      throw new UsageError("sync needs --complete. Pass it only when the producer read all its data, because sync closes every open item of the source that the file leaves out.");
    }
    const items = parseItems(readJson(deps, file), report);
    if (!items) return;
    if (items.length === 0 && flags["allow-empty"] !== true) {
      throw new UsageError(`The file holds no items, so sync would close every open item of ${source}. Pass --allow-empty if that is what you mean.`);
    }
    const store = await deps.openStore(report.dry_run);
    try {
      recordSync(report, await store.syncItems({ source, items, complete: true }));
    } catch (err) {
      if (err instanceof PartialWriteError) recordSync(report, err.written as SyncResult);
      throw err;
    }
  },

  async update(flags, deps, report) {
    const key = typeof flags.key === "string" ? flags.key : undefined;
    const id = typeof flags.id === "string" ? flags.id : undefined;
    if ((key === undefined) === (id === undefined)) throw new UsageError("update needs exactly one of --key and --id.");
    if (id !== undefined && !UUID.test(id)) throw new UsageError(`--id must be a uuid. Got ${id}.`);
    const ref = (key ?? id) as string;
    let patch;
    try {
      patch = parseUpdatePatch(readJson(deps, need(flags, "file")));
    } catch (err) {
      report.errors.push({ key: ref, message: message(err) });
      return;
    }
    const store = await deps.openStore(report.dry_run);
    const item = await store.findItem(key !== undefined ? { dedupe_key: key } : { id: id as string });
    if (!item) {
      report.not_found.push(ref);
      return;
    }
    try {
      await store.updateItem(item.id, patch);
    } catch (err) {
      report.errors.push({ key: item.dedupe_key, message: message(err) });
      return;
    }
    (patch.status && CLOSING.has(patch.status) ? report.closed : report.updated).push(item.dedupe_key);
  },

  async list(flags, deps, report) {
    const status = flags.status;
    if (status !== undefined && !(ITEM_STATUSES as readonly unknown[]).includes(status)) {
      throw new UsageError(`--status must be one of ${ITEM_STATUSES.join(", ")}.`);
    }
    const store = await deps.openStore(false);
    report.items = await store.listItems({
      source: flags.source as string | undefined,
      status: status as ItemStatus | undefined,
      project: flags.project as string | undefined,
    });
  },
};

/** Runs one CLI call. It never throws: every fault lands in `errors`, and `ok` is false. */
export async function runItemsCli(argv: string[], deps: CliDeps): Promise<CliReport> {
  const report: CliReport = {
    ok: false,
    command: null,
    dry_run: false,
    created: [],
    updated: [],
    skipped_closed: [],
    closed: [],
    not_found: [],
    errors: [],
  };
  try {
    const { command, flags } = parseCommand(argv);
    report.command = command;
    report.dry_run = flags["dry-run"] === true;
    if (command === "list") report.items = [];
    await RUN[command](flags, deps, report);
  } catch (err) {
    report.errors.push({ key: err instanceof PartialWriteError ? err.key : null, message: message(err) });
  }
  report.ok = report.errors.length === 0;
  return report;
}
