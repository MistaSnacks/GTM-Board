import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CollectorConfig } from "./config.ts";
import { collect, itemsForJobs, parseJobs } from "./hermes.ts";

const NOW = new Date("2026-11-07T02:30:00Z"); // 18:30 Pacific on 2026-11-06
const sample = fs.readFileSync(new URL("./fixtures/jobs.sample.json", import.meta.url), "utf8");

test("parseJobs keeps only the fields the collector reads", () => {
  const jobs = parseJobs(sample);
  assert.equal(jobs.length, 7);
  assert.deepEqual(Object.keys(jobs[0]).sort(), ["enabled", "last_delivery_error", "last_error", "last_run_at", "last_status", "name", "next_run_at"]);
  assert.throws(() => parseJobs("{}"), /no jobs array/);
  assert.throws(() => parseJobs('{"jobs":[{"name":"x"}]}'), /entry 0/);
});

test("an enabled job with a bad status, an error or a delivery error, or one that is late, gives agent_failed p1", () => {
  const items = itemsForJobs(parseJobs(sample), NOW, 2);
  assert.deepEqual(
    items.map((i) => i.dedupe_key).sort(),
    [
      "hermes:cron:market-fit:2026-11-02T08:01:36-08:00",
      "hermes:cron:triage:2026-11-06T18:12:05-08:00",
      "hermes:cron:weekly-blog:2026-11-03T09:02:33-08:00",
    ],
  );
  for (const item of items) {
    assert.equal(item.kind, "agent_failed");
    assert.equal(item.priority, 1);
    assert.equal(item.source, "collector:hermes");
  }
  const byJob = (name: string) => items.find((i) => i.dedupe_key.startsWith(`hermes:cron:${name}:`));
  assert.equal(byJob("triage")?.title, "Fix failed Hermes job triage");
  assert.match(byJob("triage")?.why ?? "", /last_status is error/);
  assert.equal(byJob("market-fit")?.title, "Check missed Hermes job market-fit");
  assert.match(byJob("market-fit")?.why ?? "", /next_run_at is 3 hours in the past/);
  assert.match(byJob("weekly-blog")?.why ?? "", /last_delivery_error: no delivery target resolved/);
});

test("a disabled job, a job that never ran, and a job 45 minutes late give no item", () => {
  const names = itemsForJobs(parseJobs(sample), NOW, 2).map((i) => i.title).join(" ");
  assert.ok(!names.includes("paused-and-broken"));
  assert.ok(!names.includes("never-ran"));
  assert.ok(!names.includes("just-late"));
  assert.ok(!names.includes("nightly-audit"));
});

test("the missed rule fires only past the threshold", () => {
  const job = (next: string) => [{ name: "j", enabled: true, last_status: "ok", last_error: null, last_delivery_error: null, last_run_at: "r", next_run_at: next }];
  assert.equal(itemsForJobs(job("2026-11-07T00:30:00Z"), NOW, 2).length, 0, "exactly 2 hours late");
  assert.equal(itemsForJobs(job("2026-11-07T00:29:00Z"), NOW, 2).length, 1, "2 hours and 1 minute late");
});

test("a job that never ran and is 2 hours late is missed, and its key uses never", () => {
  const items = itemsForJobs([{ name: "fresh", enabled: true, last_status: null, last_error: null, last_delivery_error: null, last_run_at: null, next_run_at: "2026-11-06T10:00:00Z" }], NOW, 2);
  assert.equal(items[0].dedupe_key, "hermes:cron:fresh:never");
});

test("prompts and secrets never reach an item", () => {
  const json = JSON.stringify(itemsForJobs(parseJobs(sample), NOW, 2));
  assert.ok(!json.includes("SECRET-PROMPT-TEXT"));
  assert.ok(!json.includes("sk-live"));
  assert.ok(!json.includes("telegram:secret-chat"));
  assert.ok(!json.includes("abcdefghijklmnopqrstuvwxyz0123456789ABCDEF"));
  assert.match(json, /Bearer \[redacted\]/);
});

const base: Omit<CollectorConfig, "hermes"> = {
  owner: "o",
  repos: [],
  unpushedMaxAgeDays: 14,
  prStaleAfterDays: 7,
  harness: { name: "web-dev", runsDir: "/none" },
};

test("collect reads the jobs file, and a missing or broken file fails the source", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-hermes-"));
  const file = path.join(dir, "jobs.json");
  fs.writeFileSync(file, sample);
  const items = await collect({ ...base, hermes: { jobsPath: file, missedAfterHours: 2 } }, { now: NOW });
  assert.equal(items.length, 3);
  await assert.rejects(collect({ ...base, hermes: { jobsPath: path.join(dir, "missing.json"), missedAfterHours: 2 } }), /ENOENT/);
  fs.writeFileSync(file, "{ broken");
  await assert.rejects(collect({ ...base, hermes: { jobsPath: file, missedAfterHours: 2 } }));
});
