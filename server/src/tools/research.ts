import { supabase, getProjectId } from "../lib/supabase.ts";
import { loadProjectConfig } from "../lib/config.ts";
import { refreshAll, getKpis, performanceSummary, snapshot } from "./metrics.ts";
import { addCard } from "./board.ts";

export async function researchRun(params: { project: string }): Promise<Record<string, unknown>> {
  const projectId = await getProjectId(params.project);
  const date = new Date().toISOString().slice(0, 10);

  // Step 1: Refresh all metrics
  const refreshResults = await refreshAll({ project: params.project });

  // Step 2: Analyze KPIs vs targets
  const kpis = await getKpis({ project: params.project });
  const performance = await performanceSummary({ project: params.project });

  // Step 3: Snapshot
  const snapshotResult = await snapshot({ project: params.project });

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

  // Step 5: Insert findings into Supabase
  const { data: inserted, error } = await supabase
    .from("gtm_research_runs")
    .insert({
      project_id: projectId,
      run_type: "full",
      findings,
      cards_created: [],
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to save research run: ${error.message}`);

  return {
    ...findings,
    research_id: inserted.id,
    snapshot_date: snapshotResult.date,
  };
}

export async function competitorCheck(params: {
  project: string;
  competitors?: string[];
}): Promise<Record<string, unknown>> {
  const config = await loadProjectConfig(params.project);
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

export async function findOpportunities(params: {
  project: string;
}): Promise<Record<string, unknown>> {
  const config = await loadProjectConfig(params.project);
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

export async function researchHistory(params: {
  project: string;
  limit?: number;
}): Promise<{ runs: Array<Record<string, unknown>> }> {
  const projectId = await getProjectId(params.project);
  const limit = params.limit || 10;

  const { data: rows, error } = await supabase
    .from("gtm_research_runs")
    .select("id, run_type, findings, cards_created, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to query research history: ${error.message}`);

  const runs = (rows || []).map((row: Record<string, unknown>) => ({
    research_id: row.id,
    run_type: row.run_type,
    date: (row.created_at as string)?.slice(0, 10),
    findings: row.findings,
    cards_created: row.cards_created,
  }));

  return { runs };
}
