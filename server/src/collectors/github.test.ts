import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import type { CollectorConfig } from "./config.ts";
import type { Exec, ExecResult } from "./exec.ts";
import { collect, failingChecks, itemsForPullRequests, parsePullRequests } from "./github.ts";

const NOW = new Date("2026-11-07T02:30:00Z");
const fixture = fs.readFileSync(new URL("./fixtures/gh-pr-list.json", import.meta.url), "utf8");
const repo = { slug: "site", path: "/x", github: "acme/site", project: "site-project" };

const keysOf = (items: { dedupe_key: string }[]) => items.map((i) => i.dedupe_key).sort();

test("parsePullRequests reads the gh JSON and fills defaults", () => {
  const prs = parsePullRequests(fixture);
  assert.equal(prs.length, 5);
  assert.equal(prs[4].statusCheckRollup, null);
  assert.equal(prs[3].isDraft, true);
  assert.throws(() => parsePullRequests("{}"), /JSON array/);
  assert.throws(() => parsePullRequests('[{"number":1}]'), /Unexpected gh pr list entry/);
});

test("failingChecks counts failed check runs and errored status contexts, and nothing else", () => {
  const [first] = parsePullRequests(fixture);
  assert.deepEqual(failingChecks(first).map((c) => c.name), ["gate", "Vercel"]);
  const pending = { ...first, statusCheckRollup: [{ name: "a", conclusion: "CANCELLED" }, { name: "b", conclusion: "SKIPPED" }, { context: "c", state: "PENDING" }, { name: "d", conclusion: null }, { name: "e", conclusion: "TIMED_OUT" }] };
  assert.deepEqual(failingChecks(pending).map((c) => c.name), ["e"]);
});

test("PR conditions: failing checks, conflicts and stale are for the owner's PRs, review requests are for the owner", () => {
  const prs = parsePullRequests(fixture);
  const resolved = prs.map((p) => (p.number === 204 ? { ...p, mergeable: "CONFLICTING" } : p));
  const items = itemsForPullRequests(repo, "acme-owner", resolved, NOW, 7);
  assert.deepEqual(keysOf(items), [
    "gh:acme/site:pr:201:checks-failing",
    "gh:acme/site:pr:202:conflict",
    "gh:acme/site:pr:203:review-requested",
    "gh:acme/site:pr:204:conflict",
    "gh:acme/site:pr:204:stale",
  ]);
  const byKey = new Map(items.map((i) => [i.dedupe_key, i]));
  assert.equal(byKey.get("gh:acme/site:pr:201:checks-failing")?.priority, 1);
  assert.equal(byKey.get("gh:acme/site:pr:201:checks-failing")?.evidence?.length, 2);
  assert.equal(byKey.get("gh:acme/site:pr:202:conflict")?.priority, 1);
  assert.equal(byKey.get("gh:acme/site:pr:203:review-requested")?.priority, 1);
  assert.equal(byKey.get("gh:acme/site:pr:204:stale")?.priority, 3);
  for (const item of items) {
    assert.equal(item.kind, "pr_attention");
    assert.equal(item.source, "collector:github");
    assert.equal(item.project, "site-project");
    assert.ok(item.link?.startsWith("https://github.com/acme/site/pull/"));
    assert.ok(item.title.length <= 90);
  }
});

test("a PR open for exactly 7 days is not stale, and 8 days is", () => {
  const [base] = parsePullRequests(fixture).slice(4);
  const open = (days: number) => ({ ...base, createdAt: new Date(NOW.getTime() - days * 86_400_000).toISOString() });
  assert.deepEqual(itemsForPullRequests(repo, "acme-owner", [open(7)], NOW, 7), []);
  assert.deepEqual(keysOf(itemsForPullRequests(repo, "acme-owner", [open(8)], NOW, 7)), ["gh:acme/site:pr:205:stale"]);
});

test("another author's failing PR gives no item for the owner", () => {
  const prs = parsePullRequests(fixture).filter((p) => p.number === 203).map((p) => ({ ...p, reviewRequests: [] }));
  assert.deepEqual(itemsForPullRequests(repo, "acme-owner", prs, NOW, 7), []);
});

const config: CollectorConfig = {
  owner: "acme-owner",
  repos: [repo, { slug: "local-only", path: "/y", github: null, project: null }],
  unpushedMaxAgeDays: 14,
  prStaleAfterDays: 7,
  hermes: { jobsPath: "/none", missedAfterHours: 2 },
  harness: { name: "web-dev", runsDir: "/none" },
};

const ok = (stdout: string): ExecResult => ({ code: 0, stdout, stderr: "" });
const notProtected: ExecResult = { code: 1, stdout: '{"message":"Branch not protected","status":"404"}', stderr: "gh: Branch not protected (HTTP 404)" };

function fakeGh(overrides: Record<string, ExecResult> = {}) {
  const calls: string[] = [];
  const exec: Exec = async (file, args) => {
    const line = `${file} ${args.join(" ")}`;
    calls.push(line);
    const hit = Object.entries(overrides).find(([pattern]) => line.includes(pattern));
    if (hit) return hit[1];
    if (line.includes("pr list")) return ok(fixture);
    if (line.includes("pr view 204")) return ok('{"mergeable":"CONFLICTING"}');
    if (line.includes("branches/main/protection")) return notProtected;
    if (line.includes("rules/branches/main")) return ok("[]");
    if (line.includes("api repos/acme/site")) return ok('{"default_branch":"main"}');
    throw new Error(`unexpected call: ${line}`);
  };
  return { exec, calls };
}

test("collect resolves UNKNOWN mergeable with gh pr view, and flags an unprotected default branch", async () => {
  const { exec, calls } = fakeGh();
  const items = await collect(config, { now: NOW, exec });
  assert.deepEqual(keysOf(items), [
    "gh:acme/site:branch-protection:main",
    "gh:acme/site:pr:201:checks-failing",
    "gh:acme/site:pr:202:conflict",
    "gh:acme/site:pr:203:review-requested",
    "gh:acme/site:pr:204:conflict",
    "gh:acme/site:pr:204:stale",
  ]);
  const protection = items.find((i) => i.dedupe_key.includes("branch-protection"));
  assert.equal(protection?.kind, "repo_attention");
  assert.equal(protection?.priority, 2);
  assert.deepEqual(calls.filter((c) => c.includes("pr view")), ["gh pr view 204 --repo acme/site --json mergeable"]);
  assert.ok(calls.every((c) => !c.includes("local-only")), "a repo with no github slug is not queried");
});

test("a protected branch, or a branch under a ruleset, gives no protection item", async () => {
  const protectedRepo = await collect(config, { now: NOW, exec: fakeGh({ "branches/main/protection": ok("{}") }).exec });
  assert.ok(!protectedRepo.some((i) => i.dedupe_key.includes("branch-protection")));
  const ruleset = await collect(config, { now: NOW, exec: fakeGh({ "rules/branches/main": ok('[{"type":"pull_request"}]') }).exec });
  assert.ok(!ruleset.some((i) => i.dedupe_key.includes("branch-protection")));
});

test("a gh failure fails the source, so nothing is synced from partial data", async () => {
  const listFails = fakeGh({ "pr list": { code: 1, stdout: "", stderr: "HTTP 502" } });
  await assert.rejects(collect(config, { now: NOW, exec: listFails.exec }), /gh pr list acme\/site exited with 1: HTTP 502/);
  const authFails = fakeGh({ "branches/main/protection": { code: 1, stdout: "", stderr: "gh: Resource not accessible (HTTP 403)" } });
  await assert.rejects(collect(config, { now: NOW, exec: authFails.exec }), /branch protection exited with 1/);
  const badJson = fakeGh({ "pr list": ok("not json") });
  await assert.rejects(collect(config, { now: NOW, exec: badJson.exec }));
});
