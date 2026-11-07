import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CollectorConfig } from "./config.ts";
import { collect } from "./harness.ts";

interface RunSpec {
  site: string;
  task: string;
  sha: string;
  startedAt: string;
  pass?: boolean;
  checks: { name: string; status: string; detail?: string }[];
  review?: boolean;
  raw?: string;
}

function runsDir(specs: RunSpec[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-harness-"));
  for (const s of specs) {
    const run = path.join(dir, s.site, s.task, s.sha);
    fs.mkdirSync(run, { recursive: true });
    const body = { site: s.site, task: s.task, startedAt: s.startedAt, checks: s.checks, ...(s.pass === undefined ? {} : { pass: s.pass }) };
    fs.writeFileSync(path.join(run, "result.json"), s.raw ?? JSON.stringify(body));
    if (s.review !== false) fs.writeFileSync(path.join(run, "review.html"), "<html></html>");
  }
  fs.mkdirSync(path.join(dir, "site-a", "task-1", "before"), { recursive: true });
  const config: CollectorConfig = {
    owner: "o",
    repos: [],
    unpushedMaxAgeDays: 14,
    prStaleAfterDays: 7,
    hermes: { jobsPath: "/none", missedAfterHours: 2 },
    harness: { name: "web-dev", runsDir: dir },
  };
  return { dir, config };
}

const failing = [
  { name: "build", status: "pass", detail: "ok" },
  { name: "browser.layout", status: "fail", detail: "page is 420px wide in a 390px viewport" },
];

test("a failed latest run gives agent_failed p2 with a link to review.html", async () => {
  const { config, dir } = runsDir([{ site: "site-a", task: "task-1", sha: "abc1234", startedAt: "2026-10-31T20:46:32.254Z", pass: false, checks: failing }]);
  const items = await collect(config);
  assert.equal(items.length, 1);
  const [item] = items;
  assert.equal(item.kind, "agent_failed");
  assert.equal(item.priority, 2);
  assert.equal(item.source, "collector:harness");
  assert.equal(item.dedupe_key, "harness:web-dev:site-a:task-1:abc1234");
  assert.equal(item.link, `file://${dir}/site-a/task-1/abc1234/review.html`);
  assert.match(item.why ?? "", /browser\.layout/);
  assert.equal(item.evidence?.[0].label, "Failed check: browser.layout");
  assert.equal(item.evidence?.[0].fetched_at, "2026-10-31T20:46:32.254Z");
});

test("a passing run gives no item", async () => {
  const { config } = runsDir([{ site: "site-a", task: "task-1", sha: "abc1234", startedAt: "2026-10-31T20:46:32.254Z", pass: true, checks: [{ name: "build", status: "pass" }] }]);
  assert.deepEqual(await collect(config), []);
});

test("a failed run that a newer passing run replaced gives no item, and a newer failing run replaces an older one", async () => {
  const replaced = runsDir([
    { site: "site-a", task: "task-1", sha: "old1111", startedAt: "2026-10-31T21:10:00.000Z", pass: false, checks: failing },
    { site: "site-a", task: "task-1", sha: "new2222", startedAt: "2026-10-31T21:19:00.000Z", pass: true, checks: [{ name: "build", status: "pass" }] },
  ]);
  assert.deepEqual(await collect(replaced.config), []);

  const worse = runsDir([
    { site: "site-a", task: "task-1", sha: "old1111", startedAt: "2026-10-31T21:10:00.000Z", pass: false, checks: failing },
    { site: "site-a", task: "task-1", sha: "new2222", startedAt: "2026-10-31T21:19:00.000Z", pass: false, checks: failing },
    { site: "site-b", task: "task-1", sha: "other33", startedAt: "2026-10-31T21:19:00.000Z", pass: false, checks: failing },
  ]);
  const keys = (await collect(worse.config)).map((i) => i.dedupe_key).sort();
  assert.deepEqual(keys, ["harness:web-dev:site-a:task-1:new2222", "harness:web-dev:site-b:task-1:other33"]);
});

test("a record without pass counts as failed when a check failed, and a missing review.html leaves the link out", async () => {
  const { config } = runsDir([{ site: "site-a", task: "task-1", sha: "abc1234", startedAt: "2026-10-31T20:46:32.254Z", checks: failing, review: false }]);
  const [item] = await collect(config);
  assert.ok(item);
  assert.equal(item.link, undefined);
});

test("an unreadable record fails the source", async () => {
  const { config } = runsDir([{ site: "site-a", task: "task-1", sha: "abc1234", startedAt: "x", checks: [], raw: "{ not json" }]);
  await assert.rejects(collect(config));
  const missing = { ...config, harness: { ...config.harness, runsDir: path.join(config.harness.runsDir, "nope") } };
  await assert.rejects(collect(missing), /ENOENT/);
});
