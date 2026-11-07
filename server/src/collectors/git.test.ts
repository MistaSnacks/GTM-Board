import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CollectorConfig, RepoConfig } from "./config.ts";
import { realExec, type Exec } from "./exec.ts";
import { collect, itemsForRepo, parseBranches, parsePorcelain } from "./git.ts";

const NOW = new Date("2026-11-07T02:30:00Z");
const read = (name: string) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("parsePorcelain counts one entry per line and splits untracked from changed", () => {
  assert.deepEqual(parsePorcelain(read("porcelain.txt")), { total: 8, untracked: 2, changed: 6 });
  assert.deepEqual(parsePorcelain(""), { total: 0, untracked: 0, changed: 0 });
  assert.deepEqual(parsePorcelain("\n"), { total: 0, untracked: 0, changed: 0 });
});

test("parseBranches reads name, upstream track and tip time", () => {
  const out = ["main\t\t1793500000", "feat/x\t[ahead 2, behind 1]\t1793400000", "old\t[gone]\t1700000000", ""].join("\n");
  assert.deepEqual(parseBranches(out), [
    { name: "main", track: "", tipUnix: 1793500000 },
    { name: "feat/x", track: "[ahead 2, behind 1]", tipUnix: 1793400000 },
    { name: "old", track: "[gone]", tipUnix: 1700000000 },
  ]);
});

const repo: RepoConfig = { slug: "tailor", path: "/x", github: "acme/tailor", project: "tailor" };
const status = (total: number) => ({ total, untracked: 0, changed: total });

test("a clean repo with nothing unpushed gives no item", () => {
  assert.deepEqual(itemsForRepo({ repo, status: status(0), unpushed: [] }, NOW), []);
});

test("a dirty tree is p2, and p1 above 50 files", () => {
  const at = (n: number) => itemsForRepo({ repo, status: status(n), unpushed: [] }, NOW)[0];
  assert.equal(at(1).priority, 2);
  assert.equal(at(50).priority, 2);
  assert.equal(at(51).priority, 1);
  const item = at(230);
  assert.equal(item.kind, "repo_attention");
  assert.equal(item.dedupe_key, "git:tailor:dirty");
  assert.equal(item.source, "collector:git");
  assert.equal(item.project, "tailor");
  assert.equal(item.title, "Commit or stash 230 uncommitted files in tailor");
  assert.equal(at(1).title, "Commit or stash 1 uncommitted file in tailor");
});

test("an unpushed branch is p2 (this week) and says how many commits are not pushed", () => {
  const tip = Math.floor(NOW.getTime() / 1000) - 3 * 86400;
  const [item] = itemsForRepo({ repo, status: status(0), unpushed: [{ branch: "plan-2026-11-06", commits: 3, tipUnix: tip }] }, NOW);
  assert.equal(item.priority, 2);
  assert.equal(item.dedupe_key, "git:tailor:unpushed:plan-2026-11-06");
  assert.match(item.why ?? "", /^3 commits on plan-2026-11-06 are not pushed\./);
  assert.match(item.why ?? "", /3 days old/);
  assert.equal(item.evidence?.[0].value, 3);
  const [one] = itemsForRepo({ repo, status: status(0), unpushed: [{ branch: "b", commits: 1, tipUnix: tip }] }, NOW);
  assert.match(one.why ?? "", /^1 commit on b is not pushed\./);
});

test("a long branch name still gives a title of at most 90 characters", () => {
  const branch = `feature/${"very-long-".repeat(12)}`;
  const [item] = itemsForRepo({ repo, status: status(0), unpushed: [{ branch, commits: 2, tipUnix: 0 }] }, NOW);
  assert.ok(item.title.length <= 90);
  assert.ok(item.dedupe_key.endsWith(branch));
});

// Real git against throwaway repos.

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
};

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
}

function commit(cwd: string, file: string, date?: string) {
  fs.writeFileSync(path.join(cwd, file), `${file}\n`);
  git(cwd, "add", file);
  execFileSync("git", ["commit", "-q", "-m", `add ${file}`], { cwd, env: { ...GIT_ENV, ...(date ? { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } : {}) } });
}

function fixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-git-"));
  const remote = path.join(root, "remote.git");
  const work = path.join(root, "work");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote], { env: GIT_ENV });
  git(root, "clone", "-q", remote, work);
  git(work, "checkout", "-q", "-b", "main");
  commit(work, "base.txt");
  git(work, "push", "-q", "-u", "origin", "main");
  const config: CollectorConfig = {
    owner: "acme",
    repos: [{ slug: "fx", path: work, github: null, project: null }],
    unpushedMaxAgeDays: 14,
    prStaleAfterDays: 7,
    hermes: { jobsPath: "/none", missedAfterHours: 2 },
    harness: { name: "web-dev", runsDir: "/none" },
  };
  return { root, work, remote, config, keys: async (exec?: Exec) => (await collect(config, { now: new Date(), exec })).map((i) => i.dedupe_key).sort() };
}

test("real git: a clean repo that is fully pushed gives no item", async () => {
  const fx = fixtureRepo();
  assert.deepEqual(await fx.keys(), []);
});

test("real git: a repo with no remote never asks for a push", async () => {
  const fx = fixtureRepo();
  git(fx.work, "remote", "remove", "origin");
  commit(fx.work, "a.txt");
  assert.deepEqual(await fx.keys(), []);
});

test("real git: untracked and changed files make the tree dirty", async () => {
  const fx = fixtureRepo();
  fs.writeFileSync(path.join(fx.work, "scratch.txt"), "x");
  assert.deepEqual(await fx.keys(), ["git:fx:dirty"]);
  fs.appendFileSync(path.join(fx.work, "base.txt"), "more");
  const [item] = await collect(fx.config, { now: new Date() });
  assert.equal(item.priority, 2);
  assert.match(item.why ?? "", /2 changed files/);
});

test("real git: commits ahead of the upstream, and commits on a branch with no upstream, are unpushed", async () => {
  const fx = fixtureRepo();
  commit(fx.work, "a.txt");
  git(fx.work, "checkout", "-q", "-b", "local-only");
  commit(fx.work, "b.txt");
  commit(fx.work, "c.txt");
  const items = await collect(fx.config, { now: new Date() });
  const byKey = new Map(items.map((i) => [i.dedupe_key, i]));
  assert.deepEqual([...byKey.keys()].sort(), ["git:fx:unpushed:local-only", "git:fx:unpushed:main"]);
  assert.match(byKey.get("git:fx:unpushed:main")?.why ?? "", /^1 commit on main is not pushed/);
  assert.match(byKey.get("git:fx:unpushed:local-only")?.why ?? "", /^3 commits on local-only are not pushed/);
});

test("real git: a pushed branch is not reported, even with no upstream set", async () => {
  const fx = fixtureRepo();
  git(fx.work, "checkout", "-q", "-b", "pushed");
  commit(fx.work, "p.txt");
  git(fx.work, "push", "-q", "origin", "pushed");
  assert.deepEqual(await fx.keys(), []);
});

test("real git: a branch whose upstream was deleted is not reported", async () => {
  const fx = fixtureRepo();
  git(fx.work, "checkout", "-q", "-b", "merged");
  commit(fx.work, "m.txt");
  git(fx.work, "push", "-q", "-u", "origin", "merged");
  git(fx.work, "push", "-q", "origin", "--delete", "merged");
  git(fx.work, "fetch", "-q", "--prune");
  assert.deepEqual(await fx.keys(), []);
});

test("real git: a branch whose newest commit is older than the window is not reported", async () => {
  const fx = fixtureRepo();
  git(fx.work, "checkout", "-q", "-b", "stale");
  commit(fx.work, "old.txt", "2026-01-01T00:00:00Z");
  assert.deepEqual(await fx.keys(), []);
  git(fx.work, "checkout", "-q", "-b", "fresh");
  commit(fx.work, "new.txt");
  assert.deepEqual(await fx.keys(), ["git:fx:unpushed:fresh"]);
});

test("real git: the collector runs only read-only commands and leaves the repo unchanged", async () => {
  const fx = fixtureRepo();
  commit(fx.work, "a.txt");
  fs.writeFileSync(path.join(fx.work, "dirty.txt"), "x");
  const calls: string[][] = [];
  const recording: Exec = (file, args, options) => {
    calls.push([file, ...args]);
    return realExec(file, args, options);
  };
  const before = git(fx.work, "for-each-ref") + git(fx.work, "status", "--porcelain");
  await fx.keys(recording);
  assert.ok(calls.length > 0);
  for (const [file, first, sub] of calls) {
    assert.equal(file, "git");
    assert.equal(first, "--no-optional-locks");
    assert.ok(["status", "for-each-ref", "rev-list"].includes(sub), sub);
  }
  assert.equal(git(fx.work, "for-each-ref") + git(fx.work, "status", "--porcelain"), before);
  assert.equal(fs.existsSync(path.join(fx.work, ".git", "index.lock")), false);
});

test("a repo path that does not exist fails the source instead of returning an empty list", async () => {
  const fx = fixtureRepo();
  const config = { ...fx.config, repos: [{ ...fx.config.repos[0], path: path.join(fx.root, "missing") }] };
  await assert.rejects(collect(config, { now: new Date() }), /path does not exist/);
});
