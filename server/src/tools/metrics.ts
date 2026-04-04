import { supabase, getProjectId } from "../lib/supabase.ts";
import { loadProjectConfig } from "../lib/config.ts";
import { listCards } from "./board.ts";
import { cadenceStatus } from "./cadence.ts";
import type { Connector, ProjectConfig, ChannelMetrics } from "../connectors/types.ts";
import { SupabaseConnector } from "../connectors/supabase.ts";
import { RedditConnector } from "../connectors/reddit.ts";
import { GoogleSearchConsoleConnector } from "../connectors/google-search.ts";
import { GA4Connector } from "../connectors/ga4.ts";
import { MetaAdsConnector } from "../connectors/meta-ads.ts";
import { GoogleAdsConnector } from "../connectors/google-ads.ts";
import { ManualConnector } from "../connectors/manual.ts";
import { MetricoolConnector } from "../connectors/metricool.ts";
import { StripeConnector } from "../connectors/stripe.ts";
import { ZernioConnector } from "../connectors/zernio-connector.ts";

const COLUMNS = ["backlog", "preparing", "live", "measuring", "done"] as const;

function getConnector(name: string, enabled: boolean): Connector {
  switch (name) {
    case "supabase": return new SupabaseConnector(enabled);
    case "reddit": return new RedditConnector(enabled);
    case "google_search_console": return new GoogleSearchConsoleConnector(enabled);
    case "ga4": return new GA4Connector(enabled);
    case "meta_ads": return new MetaAdsConnector(enabled);
    case "google_ads": return new GoogleAdsConnector(enabled);
    case "manual": return new ManualConnector(enabled);
    case "metricool": return new MetricoolConnector({ enabled });
    case "stripe": return new StripeConnector({ enabled });
    case "zernio": return new ZernioConnector(enabled);
    default: return new ManualConnector(false);
  }
}

/**
 * Read the latest metrics for every channel from gtm_metrics.
 */
async function readLatestMetrics(
  projectId: string
): Promise<Record<string, Record<string, number | null>>> {
  const { data, error } = await supabase
    .from("gtm_metrics")
    .select("channel, data")
    .eq("project_id", projectId);

  if (error) {
    throw new Error(`Failed to read metrics: ${error.message}`);
  }

  const result: Record<string, Record<string, number | null>> = {};
  for (const row of data || []) {
    const channel = row.channel as string;
    const metrics = (row.data as Record<string, number | null>) || {};
    result[channel] = metrics;
  }

  return result;
}

export async function status(params: {
  project: string;
}): Promise<Record<string, unknown>> {
  const projectId = await getProjectId(params.project);

  // Board summary: count cards per column from gtm_cards
  const { data: cardCounts, error: cardError } = await supabase
    .from("gtm_cards")
    .select("column_name")
    .eq("project_id", projectId);

  const boardSummary: Record<string, number> = {};
  for (const col of COLUMNS) {
    boardSummary[col] = 0;
  }
  if (!cardError && cardCounts) {
    for (const row of cardCounts) {
      const col = row.column_name as string;
      if (col in boardSummary) {
        boardSummary[col]++;
      }
    }
  }

  // Cadence
  let cadence: Record<string, unknown> = {};
  try {
    cadence = await cadenceStatus({ project: params.project });
  } catch {
    cadence = { error: "No cadence data available" };
  }

  // Latest snapshot
  let latestKpis: Record<string, unknown> | null = null;
  const { data: snapshotRows } = await supabase
    .from("gtm_snapshots")
    .select("data, snapshot_date")
    .eq("project_id", projectId)
    .order("snapshot_date", { ascending: false })
    .limit(1);

  if (snapshotRows && snapshotRows.length > 0) {
    latestKpis = snapshotRows[0].data as Record<string, unknown>;
  }

  // Config
  let config: Record<string, unknown> = {};
  try {
    const cfg = await loadProjectConfig(params.project);
    config = { name: cfg.name, targets: cfg.targets };
  } catch {
    // ignore
  }

  return {
    project: params.project,
    board: boardSummary,
    total_cards: Object.values(boardSummary).reduce((a, b) => a + b, 0),
    cadence,
    latest_kpis: latestKpis,
    config,
  };
}

export async function refreshChannel(params: {
  project: string;
  channel: string;
}): Promise<ChannelMetrics> {
  const config = await loadProjectConfig(params.project);
  const connectorConfig = config.connectors[params.channel];

  if (!connectorConfig) {
    throw new Error(`Unknown channel: ${params.channel}`);
  }

  const connector = getConnector(params.channel, connectorConfig.enabled);
  if (!connector.enabled) {
    throw new Error(`Channel ${params.channel} is not enabled`);
  }

  const result = await connector.refresh(config);

  // Upsert metrics into Supabase
  const projectId = await getProjectId(params.project);

  const { error } = await supabase
    .from("gtm_metrics")
    .upsert(
      {
        project_id: projectId,
        channel: result.channel,
        data: result.metrics,
        fetched_at: result.updated_at,
      },
      { onConflict: "project_id,channel" }
    );

  if (error) {
    throw new Error(`Failed to upsert metrics for ${params.channel}: ${error.message}`);
  }

  return result;
}

export async function refreshAll(params: {
  project: string;
}): Promise<{ results: ChannelMetrics[]; errors: Array<{ channel: string; error: string }> }> {
  const config = await loadProjectConfig(params.project);
  const results: ChannelMetrics[] = [];
  const errors: Array<{ channel: string; error: string }> = [];

  for (const [name, cfg] of Object.entries(config.connectors)) {
    if (!cfg.enabled) continue;
    try {
      const result = await refreshChannel({ project: params.project, channel: name });
      results.push(result);
    } catch (err) {
      errors.push({ channel: name, error: String(err) });
    }
  }

  return { results, errors };
}

export async function getKpis(params: {
  project: string;
  period?: string;
}): Promise<Record<string, unknown>> {
  const config = await loadProjectConfig(params.project);
  const period = params.period || Object.keys(config.targets)[0] || "month_1";
  const targets = config.targets[period] || {};

  const projectId = await getProjectId(params.project);
  const currentMetrics = await readLatestMetrics(projectId);

  // Flatten all channel metrics into a single map
  const current: Record<string, number | null> = {};
  for (const channelMetrics of Object.values(currentMetrics)) {
    for (const [key, value] of Object.entries(channelMetrics)) {
      current[key] = value;
    }
  }

  // Compare against targets
  const kpis: Array<{
    metric: string;
    target: number;
    current: number | null;
    status: "green" | "red" | "unknown";
  }> = [];

  for (const [metric, target] of Object.entries(targets)) {
    const value = current[metric] ?? null;
    let kpiStatus: "green" | "red" | "unknown" = "unknown";
    if (value !== null) {
      kpiStatus = value >= target ? "green" : "red";
    }
    kpis.push({ metric, target, current: value, status: kpiStatus });
  }

  return {
    project: params.project,
    period,
    kpis,
    raw_metrics: currentMetrics,
  };
}

export async function performanceSummary(params: {
  project: string;
}): Promise<Record<string, unknown>> {
  const config = await loadProjectConfig(params.project);
  const projectId = await getProjectId(params.project);
  const currentMetrics = await readLatestMetrics(projectId);

  const period = Object.keys(config.targets)[0] || "month_1";
  const targets = config.targets[period] || {};

  const working: Array<{ channel: string; metric: string; value: number; target: number }> = [];
  const notWorking: Array<{
    channel: string;
    metric: string;
    value: number;
    target: number;
    suggestion: string;
  }> = [];

  for (const [channel, metrics] of Object.entries(currentMetrics)) {
    for (const [metric, value] of Object.entries(metrics)) {
      if (value === null) continue;
      const target = targets[metric];
      if (target === undefined) continue;

      if (value >= target) {
        working.push({ channel, metric, value, target });
      } else {
        notWorking.push({
          channel,
          metric,
          value,
          target,
          suggestion: `${metric} is at ${value} vs target ${target}. Consider increasing effort on ${channel}.`,
        });
      }
    }
  }

  const totalMetrics = working.length + notWorking.length;
  const overallScore = totalMetrics > 0 ? Math.round((working.length / totalMetrics) * 100) : 0;

  return {
    working,
    not_working: notWorking,
    opportunities: [],
    overall_score: overallScore,
  };
}

export async function snapshot(params: {
  project: string;
}): Promise<{ snapshot_id: string; date: string }> {
  const date = new Date().toISOString().slice(0, 10);
  const projectId = await getProjectId(params.project);
  const currentMetrics = await readLatestMetrics(projectId);

  const snapshotData: Record<string, unknown> = {
    date,
    project: params.project,
    metrics: currentMetrics,
  };

  const { data, error } = await supabase
    .from("gtm_snapshots")
    .upsert(
      {
        project_id: projectId,
        snapshot_date: date,
        data: snapshotData,
      },
      { onConflict: "project_id,snapshot_date" }
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to save snapshot: ${error.message}`);
  }

  return { snapshot_id: data.id, date };
}
