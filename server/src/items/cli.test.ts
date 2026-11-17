import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runItemsCli, type CliDeps, type CliReport } from "./cli.ts";
import { createDryRunDb } from "./dry-run-db.ts";
import { createFakeItemsDb } from "./fake-db.ts";
import { createItemStore, type ItemsDb } from "./store.ts";
import type { ItemInput } from "./types.ts";

const PROJECTS = { tailor: "p-tailor", groomlocal: "p-gl" };
const AT = "2026-11-16T12:00:00.000Z";

function setup() {
  const now = () => new Date(AT);
  const db = createFakeItemsDb({ projects: PROJECTS, now });
  const storeOn = (on: ItemsDb) =>
    createItemStore({
      db: on,
      now,
      resolveProject: async (slug) => {
        const id = (PROJECTS as Record<string, string>)[slug];
        if (!id) throw new Error(`Project not found: ${slug}`);
        return id;
      },
    });
  const store = storeOn(db);
  const files: Record<string, string> = {};
  const opened: boolean[] = [];
  const deps: CliDeps = {
    async openStore(dryRun) {
      opened.push(dryRun);
      return dryRun ? storeOn(createDryRunDb(db)) : store;
    },
    readFile(file) {
      if (!(file in files)) throw new Error(`ENOENT: no such file, open '${file}'`);
      return files[file];
    },
  };
  const put = (file: string, value: unknown) => {
    files[file] = typeof value === "string" ? value : JSON.stringify(value);
  };
  const run = (...argv: string[]) => runItemsCli(argv, deps);
  const snapshot = () => JSON.stringify(db.rows);
  return { db, store, put, run, opened, snapshot };
}

const item = (key: string, over: Partial<ItemInput> = {}): ItemInput => ({
  project: "groomlocal",
  kind: "seo_task",
  title: `Task ${key}`,
  source: "seo:groomlocal",
  dedupe_key: key,
  ...over,
});

const lists = (r: CliReport) => ({
  created: r.created,
  updated: r.updated,
  skipped_closed: r.skipped_closed,
  closed: r.closed,
  not_found: r.not_found,
});

const NONE = { created: [], updated: [], skipped_closed: [], closed: [], not_found: [] };

test("add creates new keys, refreshes open ones and skips closed ones", async () => {
  const { store, put, run } = setup();
  await store.addItem(item("k:open"));
  const { id } = await store.addItem(item("k:closed"));
  await store.updateItem(id, { status: "done" });
  put("items.json", [item("k:new"), item("k:open"), item("k:closed")]);

  const report = await run("add", "--file", "items.json");
  assert.equal(report.ok, true);
  assert.equal(report.command, "add");
  assert.equal(report.dry_run, false);
  assert.deepEqual(lists(report), { ...NONE, created: ["k:new"], updated: ["k:open"], skipped_closed: ["k:closed"] });
  assert.deepEqual(report.errors, []);
  assert.equal("items" in report, false);
});

test("add --dry-run reports the same plan and writes nothing", async () => {
  const { store, put, run, snapshot } = setup();
  await store.addItem(item("k:open"));
  put("items.json", [item("k:new"), item("k:open")]);
  const before = snapshot();

  const report = await run("add", "--dry-run", "--file", "items.json");
  assert.equal(report.ok, true);
  assert.equal(report.dry_run, true);
  assert.deepEqual(lists(report), { ...NONE, created: ["k:new"], updated: ["k:open"] });
  assert.equal(snapshot(), before);
});

test("add validates the whole file first, and one bad item stops every write", async () => {
  const { put, run, db, opened } = setup();
  put("items.json", [item("k:a"), item("k:b", { title: "x".repeat(91) }), item("k:a")]);
  const report = await run("add", "--file", "items.json");
  assert.equal(report.ok, false);
  assert.deepEqual(report.errors.map((e) => e.key), ["k:b", "k:a"]);
  assert.match(report.errors[0].message, /\[1\]\.title/);
  assert.match(report.errors[1].message, /appears twice/);
  assert.equal(db.rows.length, 0);
  assert.deepEqual(opened, [], "the store is not opened for a bad file");
});

test("add that fails part way says which keys were written", async () => {
  const { put, run } = setup();
  put("items.json", [item("k:a"), item("k:b", { project: "nope" }), item("k:c")]);
  const report = await run("add", "--file", "items.json");
  assert.equal(report.ok, false);
  assert.deepEqual(report.created, ["k:a", "k:c"]);
  assert.deepEqual(report.errors, [{ key: "k:b", message: "Project not found: nope" }]);
});

test("add refuses a file that is missing, not JSON or not an array", async () => {
  const { put, run } = setup();
  put("bad.json", "{not json");
  put("object.json", { dedupe_key: "k:a" });
  assert.match((await run("add", "--file", "missing.json")).errors[0].message, /Cannot read missing.json/);
  assert.match((await run("add", "--file", "bad.json")).errors[0].message, /bad.json is not JSON/);
  assert.match((await run("add", "--file", "object.json")).errors[0].message, /JSON array/);
  assert.match((await run("add")).errors[0].message, /--file is required/);
});

test("sync upserts the file and closes the open keys of the source that it leaves out", async () => {
  const { store, put, run, db } = setup();
  await store.addItem(item("k:keep"));
  await store.addItem(item("k:gone"));
  await store.addItem(item("other:x", { source: "manual" }));
  put("items.json", [item("k:keep"), item("k:new")]);

  const report = await run("sync", "--source", "seo:groomlocal", "--file", "items.json", "--complete");
  assert.equal(report.ok, true);
  assert.deepEqual(lists(report), { ...NONE, created: ["k:new"], updated: ["k:keep"], closed: ["k:gone"] });
  assert.equal(db.rows.find((r) => r.dedupe_key === "k:gone")?.closed_reason, "resolved");
  assert.equal(db.rows.find((r) => r.dedupe_key === "other:x")?.status, "open");
});

test("sync --dry-run reports the closes and writes nothing", async () => {
  const { store, put, run, snapshot } = setup();
  await store.addItem(item("k:gone"));
  put("items.json", [item("k:new")]);
  const before = snapshot();
  const report = await run("sync", "--source", "seo:groomlocal", "--file", "items.json", "--complete", "--dry-run");
  assert.deepEqual(lists(report), { ...NONE, created: ["k:new"], closed: ["k:gone"] });
  assert.equal(snapshot(), before);
});

test("sync refuses without --complete, and refuses an empty list without --allow-empty", async () => {
  const { store, put, run, db } = setup();
  await store.addItem(item("k:a"));
  put("items.json", [item("k:a")]);
  put("empty.json", []);

  const noComplete = await run("sync", "--source", "seo:groomlocal", "--file", "items.json");
  assert.equal(noComplete.ok, false);
  assert.match(noComplete.errors[0].message, /needs --complete/);

  const empty = await run("sync", "--source", "seo:groomlocal", "--file", "empty.json", "--complete");
  assert.equal(empty.ok, false);
  assert.match(empty.errors[0].message, /--allow-empty/);
  assert.equal(db.rows[0].status, "open");

  const allowed = await run("sync", "--source", "seo:groomlocal", "--file", "empty.json", "--complete", "--allow-empty");
  assert.equal(allowed.ok, true);
  assert.deepEqual(allowed.closed, ["k:a"]);
});

test("sync refuses an item of another source and writes nothing", async () => {
  const { put, run, db } = setup();
  put("items.json", [item("k:a"), item("k:b", { source: "manual" })]);
  const report = await run("sync", "--source", "seo:groomlocal", "--file", "items.json", "--complete");
  assert.equal(report.ok, false);
  assert.match(report.errors[0].message, /Wrong source on: k:b/);
  assert.equal(db.rows.length, 0);
});

test("update by key changes only the fields in the patch, and merges evidence by label", async () => {
  const { store, put, run, db } = setup();
  await store.addItem(
    item("k:a", { why: "Old", priority: 1, evidence: [{ label: "report", url: "/old", fetched_at: AT }, { label: "gsc", value: 3, fetched_at: AT }] }),
  );
  put("patch.json", { why: "New", evidence: [{ label: "report", url: "/new", fetched_at: AT }] });

  const report = await run("update", "--key", "k:a", "--file", "patch.json");
  assert.equal(report.ok, true);
  assert.deepEqual(lists(report), { ...NONE, updated: ["k:a"] });
  const row = db.rows[0];
  assert.equal(row.why, "New");
  assert.equal(row.title, "Task k:a");
  assert.equal(row.priority, 1);
  assert.deepEqual(row.evidence.map((e) => [e.label, e.url ?? e.value]), [["gsc", 3], ["report", "/new"]]);
});

test("update by id that closes a row reports it under closed", async () => {
  const { store, put, run, db } = setup();
  const { id } = await store.addItem(item("k:a"));
  put("patch.json", { status: "done", why: "Drafts saved" });
  const report = await run("update", "--id", id, "--file", "patch.json");
  assert.deepEqual(lists(report), { ...NONE, closed: ["k:a"] });
  assert.equal(db.rows[0].status, "done");
});

test("update of a key with no row is not an error", async () => {
  const { put, run } = setup();
  put("patch.json", { priority: 1 });
  const report = await run("update", "--key", "k:none", "--file", "patch.json");
  assert.equal(report.ok, true);
  assert.deepEqual(lists(report), { ...NONE, not_found: ["k:none"] });
});

test("update --dry-run reports the change and writes nothing", async () => {
  const { store, put, run, snapshot } = setup();
  await store.addItem(item("k:a"));
  put("patch.json", { status: "done" });
  const before = snapshot();
  const report = await run("update", "--key", "k:a", "--file", "patch.json", "--dry-run");
  assert.deepEqual(lists(report), { ...NONE, closed: ["k:a"] });
  assert.equal(snapshot(), before);
});

test("update reports a bad patch, a closed row and a bad ref as errors", async () => {
  const { store, put, run } = setup();
  const { id } = await store.addItem(item("k:a"));
  await store.updateItem(id, { status: "dismissed" });
  put("bad.json", { source: "manual" });
  put("why.json", { why: "late" });

  const bad = await run("update", "--key", "k:a", "--file", "bad.json");
  assert.deepEqual(bad.errors.map((e) => e.key), ["k:a"]);
  assert.match(bad.errors[0].message, /Invalid patch/);

  const closed = await run("update", "--key", "k:a", "--file", "why.json");
  assert.equal(closed.ok, false);
  assert.match(closed.errors[0].message, /is dismissed. Reopen it/);

  assert.match((await run("update", "--file", "why.json")).errors[0].message, /exactly one of --key and --id/);
  assert.match((await run("update", "--key", "k:a", "--id", id, "--file", "why.json")).errors[0].message, /exactly one/);
  assert.match((await run("update", "--id", "nope", "--file", "why.json")).errors[0].message, /--id must be a uuid/);
});

test("list filters by source, status and project, and carries the items", async () => {
  const { store, run } = setup();
  await store.addItem(item("k:a"));
  await store.addItem(item("k:b", { project: "tailor", source: "seo:tailor" }));
  const { id } = await store.addItem(item("k:c"));
  await store.updateItem(id, { status: "done" });

  const keys = async (...argv: string[]) => (await run("list", ...argv)).items?.map((i) => i.dedupe_key);
  assert.deepEqual(await keys(), ["k:a", "k:b"]);
  assert.deepEqual(await keys("--source", "seo:tailor"), ["k:b"]);
  assert.deepEqual(await keys("--project", "groomlocal"), ["k:a"]);
  assert.deepEqual(await keys("--status", "done"), ["k:c"]);
  const bad = await run("list", "--status", "closed");
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.items, []);
});

test("an unknown command or flag is a usage error, and a store that cannot connect is a fault", async () => {
  const { run, put } = setup();
  assert.match((await run()).errors[0].message, /No command/);
  assert.match((await run("remove")).errors[0].message, /Unknown command remove/);
  assert.match((await run("list", "--dry-run")).errors[0].message, /Unknown option '--dry-run'/);

  put("items.json", [item("k:a")]);
  const offline = await runItemsCli(["add", "--file", "items.json"], {
    openStore: async () => {
      throw new Error("Missing Supabase credentials");
    },
    readFile: () => JSON.stringify([item("k:a")]),
  });
  assert.equal(offline.ok, false);
  assert.deepEqual(offline.errors, [{ key: null, message: "Missing Supabase credentials" }]);
});

const WRAPPER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/gtm-items");

function runWrapper(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(WRAPPER, args, { cwd: os.tmpdir(), env: { PATH: "/usr/bin:/bin" } }, (err, stdout, stderr) => {
      resolve({ code: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout, stderr });
    });
  });
}

test("the gtm-items wrapper runs from another directory with a short PATH and prints one JSON object", async () => {
  const { code, stdout, stderr } = await runWrapper(["add", "--file", "/nonexistent/items.json"]);
  assert.equal(code, 1);
  const lines = stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  const report = JSON.parse(lines[0]) as CliReport;
  assert.equal(report.ok, false);
  assert.equal(report.command, "add");
  assert.match(report.errors[0].message, /Cannot read \/nonexistent\/items.json/);
  assert.match(stderr, /Cannot read/);
});
