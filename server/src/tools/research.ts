import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { getProjectDir, loadProjectConfig } from "../lib/config.ts";
import { refreshAll } from "./metrics.ts";
import { getKpis, performanceSummary, snapshot } from "./metrics.ts";
import { addCard } from "./board.ts";

export async function researchRun(params: { project: string }): Promise<Record<string, unknown>> {
  const config = loadProjectConfig(params.project);
  const date = new Date().toISOString().slice(0, 10);

  // Step 1: Refresh all metrics
  const refreshResults = await refreshAll({ project: params.project });

  // Step 2: Analyze KPIs vs targets
  const kpis = getKpis({ project: params.project });
  const performance = performanceSummary({ project: params.project });

  // Step 3: Snapshot
  const snapshotResult = snapshot({ project: params.project });

  // Step 4: Build research findings
  const findings: Record<string, unknown> = {
    date,
    project: params.project,
    refresh_results: {
      channels_refreshed: refreshResults.results.length,
      errors: refreshResults.errors,
    },
    kpi_analysis: kpis,
    performance,
  };

  // Step 5: Write findings to research file
  const researchDir = path.join(getProjectDir(params.project), "research");
  if (!fs.existsSync(researchDir)) {
    fs.mkdirSync(researchDir, { recursive: true });
  }

  const filePath = path.join(researchDir, `${date}.md`);
  const researchContent = `
## Research Run — ${date}

### Metrics Refreshed
${refreshResults.results.map((r) => `- ${r.channel}: ${Object.keys(r.metrics).length} metrics`).join("\n")}

### KPI Status
${JSON.stringify(kpis, null, 2)}

### Performance Summary
${JSON.stringify(performance, null, 2)}

### Recommendations
- Review channels with metrics below target
- Check competitor activity via gtm_competitor_check
- Find engagement opportunities via gtm_find_opportunities
`;

  const frontmatter: Record<string, unknown> = {
    date,
    project: params.project,
    channels_refreshed: refreshResults.results.map((r) => r.channel),
    snapshot: snapshotResult.path,
  };

  const output = matter.stringify(researchContent, frontmatter);
  fs.writeFileSync(filePath, output, "utf-8");

  return {
    ...findings,
    research_file: filePath,
    snapshot_file: snapshotResult.path,
  };
}

export function competitorCheck(params: {
  project: string;
  competitors?: string[];
}): Record<string, unknown> {
  const config = loadProjectConfig(params.project);
  const rawConfig = config as unknown as Record<string, unknown>;
  const researchConfig = rawConfig.research as Record<string, unknown> | undefined;
  const competitors = params.competitors || (researchConfig?.competitors as string[]) || [];

  // Generate search queries for each competitor
  const queries = competitors.map((comp) => ({
    competitor: comp,
    search_queries: [
      `${comp} marketing strategy 2026`,
      `${comp} new features launch`,
      `${comp} vs alternatives reddit`,
      `site:linkedin.com "${comp}" announcement`,
    ],
  }));

  return {
    project: params.project,
    competitors,
    queries,
    instructions:
      "Use Exa MCP or web search to run these queries. " +
      "Report findings back via gtm_update_card or create new cards for actionable insights.",
  };
}

export function findOpportunities(params: { project: string }): Record<string, unknown> {
  const config = loadProjectConfig(params.project);
  const rawConfig = config as unknown as Record<string, unknown>;
  const researchConfig = rawConfig.research as Record<string, unknown> | undefined;
  const searchQueries = (researchConfig?.exa_search_queries as string[]) || [];

  // Build Reddit-specific engagement queries
  const connectorConfig = config.connectors.reddit;
  const subreddits = (connectorConfig?.subreddits as string[]) || [];

  const redditQueries = subreddits.map((sub) => ({
    subreddit: sub,
    query: `site:reddit.com/r/${sub} resume OR "resume builder" OR "AI resume"`,
  }));

  return {
    project: params.project,
    search_queries: searchQueries,
    reddit_engagement_queries: redditQueries,
    instructions:
      "Use Exa MCP or web search to find recent threads and content opportunities. " +
      "Create board cards for actionable opportunities found.",
  };
}

export function researchHistory(params: {
  project: string;
  limit?: number;
}): { runs: Array<Record<string, unknown>> } {
  const researchDir = path.join(getProjectDir(params.project), "research");
  if (!fs.existsSync(researchDir)) {
    return { runs: [] };
  }

  const files = fs
    .readdirSync(researchDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();

  const limit = params.limit || 10;
  const runs: Array<Record<string, unknown>> = [];

  for (const file of files.slice(0, limit)) {
    try {
      const raw = fs.readFileSync(path.join(researchDir, file), "utf-8");
      const parsed = matter(raw);
      runs.push({
        date: file.replace(".md", ""),
        ...parsed.data,
        summary: parsed.content.slice(0, 500),
      });
    } catch {
      // skip unparseable files
    }
  }

  return { runs };
}
