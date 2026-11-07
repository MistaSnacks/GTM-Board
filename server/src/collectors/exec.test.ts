import test from "node:test";
import assert from "node:assert/strict";
import { assertReadOnly, realExec } from "./exec.ts";

const allowed: [string, string[]][] = [
  ["git", ["--no-optional-locks", "status", "--porcelain"]],
  ["git", ["--no-optional-locks", "for-each-ref", "refs/heads"]],
  ["git", ["--no-optional-locks", "rev-list", "--count", "refs/heads/main", "--not", "--remotes"]],
  ["git", ["log", "-1"]],
  ["gh", ["pr", "list", "--repo", "a/b", "--json", "number"]],
  ["gh", ["pr", "view", "1", "--repo", "a/b", "--json", "mergeable"]],
  ["gh", ["api", "repos/a/b/branches/main/protection"]],
];

const refused: [string, string[]][] = [
  ["git", ["fetch", "origin"]],
  ["git", ["--no-optional-locks", "fetch"]],
  ["git", ["commit", "-am", "x"]],
  ["git", ["push"]],
  ["git", ["checkout", "main"]],
  ["git", ["reset", "--hard"]],
  ["git", ["clean", "-fd"]],
  ["git", ["branch", "-D", "x"]],
  ["git", ["worktree", "remove", "x"]],
  ["git", ["config", "user.name", "x"]],
  ["git", []],
  ["gh", ["pr", "merge", "1"]],
  ["gh", ["pr", "comment", "1", "--body", "x"]],
  ["gh", ["pr", "close", "1"]],
  ["gh", ["issue", "create"]],
  ["gh", ["api", "-X", "POST", "repos/a/b/issues"]],
  ["gh", ["api", "--method", "DELETE", "repos/a/b"]],
  ["gh", ["api", "--method=PATCH", "repos/a/b"]],
  ["gh", ["api", "repos/a/b/issues", "-f", "title=x"]],
  ["gh", ["api", "repos/a/b/issues", "--field", "title=x"]],
  ["gh", ["api", "repos/a/b/issues", "--input", "body.json"]],
  ["rm", ["-rf", "/"]],
];

test("assertReadOnly lets the read commands through", () => {
  for (const [file, args] of allowed) assert.doesNotThrow(() => assertReadOnly(file, args), `${file} ${args.join(" ")}`);
});

test("assertReadOnly refuses every command that could write", () => {
  for (const [file, args] of refused) assert.throws(() => assertReadOnly(file, args), /Refused/, `${file} ${args.join(" ")}`);
});

test("realExec checks the command before it starts a process", async () => {
  await assert.rejects(realExec("git", ["fetch"], { cwd: "/" }), /Refused/);
});
