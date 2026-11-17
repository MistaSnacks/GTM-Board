import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CollectorConfig } from "./config.ts";
import { runCollectors, type WriteStore } from "./run.ts";

function spyStore() {
  const calls: { op: string; arg: unknown }[] = [];
  const store: WriteStore = {
    async rotateRecurring(items) {
      calls.push({ op: "rotateRecurring", arg: items });
      return { source: "rule:recurring", created: items.map((i) => i.dedupe_key), updated: [], reopened: [], skipped_closed: [], held: [], resolved: [] };
    },
    async syncItems(request) {
      calls.push({ op: "syncItems", arg: request });
      return { source: request.source, created: request.items.map((i) => i.dedupe_key), updated: [], reopened: [], skipped_closed: [], resolved: [] };
    },
  };
  return { store, calls };
}

function config(overrides: Partial<CollectorConfig> = {}): CollectorConfig {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-run-"));
  const jobs = path.join(dir, "jobs.json");
  fs.writeFileSync(jobs, JSON.stringify({ jobs: [{ name: "j", enabled: true, last_status: "error", last_error: "boom", last_delivery_error: null, last_run_at: "t1", next_run_at: "2999-01-01T00:00:00Z" }] }));
  return {
    owner: "o",
    repos: [],
    unpushedMaxAgeDays: 14,
    prStaleAfterDays: 7,
    hermes: { jobsPath: jobs, missedAfterHours: 2 },
    harness: { name: "web-dev", runsDir: path.join(dir, "no-such-runs-dir") },
    ...overrides,
  };
}

const NOW = new Date("2026-11-07T02:30:00Z");

test("a source that fails to read its data reports an error and never calls the store", async () => {
  const { store, calls } = spyStore();
  const [report] = await runCollectors(["harness"], config(), { store, now: NOW });
  assert.equal(report.ok, false);
  assert.match(report.error ?? "", /^read failed: .*ENOENT/);
  assert.deepEqual(calls, []);
});

test("one failing source does not stop the next one", async () => {
  const { store, calls } = spyStore();
  const reports = await runCollectors(["harness", "hermes"], config(), { store, now: NOW });
  assert.deepEqual(reports.map((r) => [r.name, r.ok]), [["harness", false], ["hermes", true]]);
  assert.deepEqual(calls.map((c) => c.op), ["syncItems"]);
});

test("a sync source calls syncItems with its source and complete: true, even for an empty list", async () => {
  const { store, calls } = spyStore();
  const empty = config();
  fs.writeFileSync(empty.hermes.jobsPath, JSON.stringify({ jobs: [] }));
  const [report] = await runCollectors(["hermes"], empty, { store, now: NOW });
  assert.equal(report.ok, true);
  assert.deepEqual(calls, [{ op: "syncItems", arg: { source: "collector:hermes", items: [], complete: true } }]);
});

test("recurring rotates its six items in one call and never syncs", async () => {
  const { store, calls } = spyStore();
  const [report] = await runCollectors(["recurring"], config(), { store, now: NOW });
  assert.equal(report.ok, true);
  assert.deepEqual(calls.map((c) => c.op), ["rotateRecurring"]);
  assert.equal((calls[0].arg as unknown[]).length, 6);
});

test("with no store (dry run) the items come back and nothing is written", async () => {
  const [report] = await runCollectors(["hermes"], config(), { now: NOW });
  assert.equal(report.ok, true);
  assert.equal(report.items.length, 1);
  assert.equal(report.written, undefined);
});

test("a store error is reported as a write failure", async () => {
  const store: WriteStore = {
    async rotateRecurring() {
      throw new Error("db down");
    },
    async syncItems() {
      throw new Error("db down");
    },
  };
  const [report] = await runCollectors(["hermes"], config(), { store, now: NOW });
  assert.equal(report.ok, false);
  assert.equal(report.error, "write failed: db down");
});
