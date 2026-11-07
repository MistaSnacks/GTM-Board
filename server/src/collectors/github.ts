import type { Evidence, ItemInput } from "../items/types.ts";
import type { CollectorConfig, RepoConfig } from "./config.ts";
import { realExec, stdoutOf, type Exec } from "./exec.ts";
import { clampTitle, DAY_MS, plural, type CollectDeps } from "./util.ts";

export const source = "collector:github";
export const mode = "sync" as const;

export interface CheckNode {
  __typename?: string;
  name?: string;
  context?: string;
  conclusion?: string | null;
  state?: string | null;
  detailsUrl?: string;
  targetUrl?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  author: { login: string };
  createdAt: string;
  isDraft: boolean;
  mergeable: string;
  reviewRequests: { login?: string }[];
  statusCheckRollup: CheckNode[] | null;
}

export const PR_FIELDS = "number,title,url,author,createdAt,isDraft,mergeable,reviewRequests,statusCheckRollup";

const FAILING_CONCLUSIONS = new Set(["FAILURE", "TIMED_OUT", "STARTUP_FAILURE"]);
const FAILING_STATES = new Set(["FAILURE", "ERROR"]);

export function parsePullRequests(text: string): PullRequest[] {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("gh pr list did not return a JSON array");
  return data.map((raw) => {
    const pr = raw as Partial<PullRequest>;
    if (typeof pr.number !== "number" || typeof pr.title !== "string" || typeof pr.createdAt !== "string" || !pr.author?.login) {
      throw new Error(`Unexpected gh pr list entry: ${JSON.stringify(raw).slice(0, 200)}`);
    }
    return {
      number: pr.number,
      title: pr.title,
      url: pr.url ?? "",
      author: { login: pr.author.login },
      createdAt: pr.createdAt,
      isDraft: pr.isDraft === true,
      mergeable: pr.mergeable ?? "UNKNOWN",
      reviewRequests: pr.reviewRequests ?? [],
      statusCheckRollup: pr.statusCheckRollup ?? null,
    };
  });
}

export function failingChecks(pr: PullRequest): { name: string; url?: string }[] {
  return (pr.statusCheckRollup ?? []).flatMap((c) => {
    const failing = (c.conclusion && FAILING_CONCLUSIONS.has(c.conclusion)) || (c.state && FAILING_STATES.has(c.state));
    const name = c.name ?? c.context ?? "unnamed check";
    return failing ? [{ name, url: c.detailsUrl || c.targetUrl || undefined }] : [];
  });
}

const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The items for one repo's open PRs. Pure. `mergeable` must already be resolved. */
export function itemsForPullRequests(repo: RepoConfig, owner: string, prs: PullRequest[], now: Date, staleAfterDays: number): ItemInput[] {
  const seen = now.toISOString();
  const items: ItemInput[] = [];
  const base = (pr: PullRequest, condition: string) => ({
    project: repo.project,
    source,
    kind: "pr_attention" as const,
    link: pr.url || undefined,
    reopen: true,
    dedupe_key: `gh:${repo.github}:pr:${pr.number}:${condition}`,
  });

  for (const pr of prs) {
    const mine = sameLogin(pr.author.login, owner);
    const name = `PR #${pr.number} in ${repo.slug}`;

    const failing = failingChecks(pr);
    if (mine && failing.length > 0) {
      const evidence: Evidence[] = failing.map((c) => ({ label: `Failing check: ${c.name}`, url: c.url, fetched_at: seen }));
      items.push({
        ...base(pr, "checks-failing"),
        title: clampTitle(`Fix failing checks on ${name}: ${pr.title}`),
        why: `${name} has ${plural(failing.length, "failing check")}: ${failing.map((c) => c.name).join(", ")}.`,
        evidence,
        priority: 1,
      });
    }

    if (mine && pr.mergeable === "CONFLICTING") {
      items.push({
        ...base(pr, "conflict"),
        title: clampTitle(`Resolve merge conflicts on ${name}: ${pr.title}`),
        why: `GitHub reports that ${name} conflicts with its base branch.`,
        evidence: [{ label: "Mergeable state", value: pr.mergeable, fetched_at: seen }],
        priority: 1,
      });
    }

    if (pr.reviewRequests.some((r) => r.login && sameLogin(r.login, owner))) {
      items.push({
        ...base(pr, "review-requested"),
        title: clampTitle(`Review ${name}: ${pr.title}`),
        why: `${pr.author.login} requested a review from ${owner} on ${name}.`,
        priority: 1,
      });
    }

    const ageDays = Math.floor((now.getTime() - Date.parse(pr.createdAt)) / DAY_MS);
    if (mine && ageDays > staleAfterDays) {
      items.push({
        ...base(pr, "stale"),
        title: clampTitle(`Merge or close ${name}, open ${ageDays} days: ${pr.title}`),
        why: `${name} was opened on ${pr.createdAt.slice(0, 10)} and is still open${pr.isDraft ? " as a draft" : ""}.`,
        evidence: [{ label: "Days open", value: ageDays, fetched_at: seen }],
        priority: 3,
      });
    }
  }
  return items;
}

export function protectionItem(repo: RepoConfig, branch: string, now: Date): ItemInput {
  return {
    project: repo.project,
    source,
    kind: "repo_attention",
    title: clampTitle(`Protect branch ${branch} in ${repo.github}`),
    why: `GitHub returns 404 for the branch protection rules of ${branch}, and no ruleset covers it.`,
    evidence: [{ label: "Branch protection", value: "none", fetched_at: now.toISOString() }],
    link: `https://github.com/${repo.github}/settings/branches`,
    dedupe_key: `gh:${repo.github}:branch-protection:${branch}`,
    priority: 2,
    reopen: true,
  };
}

async function resolveMergeable(repo: string, prs: PullRequest[], owner: string, exec: Exec): Promise<PullRequest[]> {
  // The list call often returns UNKNOWN. `gh pr view` makes GitHub compute the state.
  return Promise.all(
    prs.map(async (pr) => {
      if (pr.mergeable !== "UNKNOWN" || !sameLogin(pr.author.login, owner)) return pr;
      const out = stdoutOf(await exec("gh", ["pr", "view", String(pr.number), "--repo", repo, "--json", "mergeable"]), `gh pr view ${repo}#${pr.number}`);
      return { ...pr, mergeable: (JSON.parse(out) as { mergeable?: string }).mergeable ?? "UNKNOWN" };
    }),
  );
}

async function isUnprotected(repo: string, branch: string, exec: Exec): Promise<boolean> {
  const res = await exec("gh", ["api", `repos/${repo}/branches/${branch}/protection`]);
  if (res.code === 0) return false;
  if (!/\b404\b|not protected/i.test(res.stderr + res.stdout)) {
    throw new Error(`gh api ${repo} branch protection exited with ${res.code}: ${res.stderr.trim().slice(0, 300)}`);
  }
  // Rulesets protect a branch without a classic protection rule.
  const rules = await exec("gh", ["api", `repos/${repo}/rules/branches/${branch}`]);
  if (rules.code !== 0) return true;
  const list: unknown = JSON.parse(rules.stdout);
  return !(Array.isArray(list) && list.length > 0);
}

async function readRepo(repo: RepoConfig & { github: string }, config: CollectorConfig, exec: Exec, now: Date): Promise<ItemInput[]> {
  const listed = stdoutOf(
    await exec("gh", ["pr", "list", "--repo", repo.github, "--state", "open", "--limit", "100", "--json", PR_FIELDS]),
    `gh pr list ${repo.github}`,
  );
  const prs = await resolveMergeable(repo.github, parsePullRequests(listed), config.owner, exec);
  const items = itemsForPullRequests(repo, config.owner, prs, now, config.prStaleAfterDays);

  const info = JSON.parse(stdoutOf(await exec("gh", ["api", `repos/${repo.github}`]), `gh api ${repo.github}`)) as { default_branch?: string };
  if (!info.default_branch) throw new Error(`gh api ${repo.github} returned no default_branch`);
  if (await isUnprotected(repo.github, info.default_branch, exec)) items.push(protectionItem(repo, info.default_branch, now));
  return items;
}

export async function collect(config: CollectorConfig, deps: CollectDeps & { exec?: Exec } = {}): Promise<ItemInput[]> {
  const now = deps.now ?? new Date();
  const exec = deps.exec ?? realExec;
  const repos = config.repos.filter((r): r is RepoConfig & { github: string } => r.github !== null);
  const perRepo = await Promise.all(repos.map((repo) => readRepo(repo, config, exec, now)));
  return perRepo.flat();
}
