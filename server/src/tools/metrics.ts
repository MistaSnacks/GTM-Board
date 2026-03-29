import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { getProjectDir, loadProjectConfig } from "../lib/config.ts";
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

function readLatestMetrics(project: string): Record<string, Record<string, number | null>> {
  const metricsDir = path.join(getProjectDir(project), "metrics");
  const result: Record<string, Record<string, number | null>> = {};

  if (!fs.existsSync(metricsDir)) return result;

  const files = fs.readdirSync(metricsDir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(metricsDir, file), "utf-8");
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;
      const channel = (data.channel as string) || file.replace(".md", "");
      const metrics: Record<string, number | null> = {};
      for (const [key, value] of Object.entries(data)) {
        if (key === "channel" || key === "updated_at") continue;
        if (typeof value === "number" || value === null) {
          metrics[key] = value as number | null;
        }
      }
      result[channel] = metrics;
    } catch {
      // skip
    }
  }

  return result;
}

export function status(params: { project: string }): Record<string, unknown> {
  const boardSummary: Record<string, number> = {};
  for (const col of COLUMNS) {
    const cards = listCards({ project: params.project, column: col });
    boardSummary[col] = cards.length;
  }

  let cadence: Record<string, unknown> = {};
  try {
    cadence = cadenceStatus({ project: params.project });
  } catch {
    cadence = { error: "No cadence data available" };
  }

  let latestKpis: Record<string, unknown> | null = null;
  const snapshotsDir = path.join(getProjectDir(params.project), "metrics", "snapshots");
  if (fs.existsSync(snapshotsDir)) {
    const files = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith(".md")).sort();
    if (files.length > 0) {
      const latestFile = files[files.length - 1];
      try {
        const raw = fs.readFileSync(path.join(snapshotsDir, latestFile), "utf-8");
        const parsed = matter(raw);
        latestKpis = parsed.data as Record<string, unknown>;
      } catch {
        // ignore
      }
    }
  }

  let config: Record<string, unknown> = {};
  try {
    const cfg = loadProjectConfig(params.project);
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
  const config = loadProjectConfig(params.project);
  const connectorConfig = config.connectors[params.channel];

  if (!connectorConfig) {
    throw new Error(`Unknown channel: ${params.channel}`);
  }

  const connector = getConnector(params.channel, connectorConfig.enabled);
  if (!connector.enabled) {
    throw new Error(`Channel ${params.channel} is not enabled`);
  }

  const result = await connector.refresh(config);

  // Write metrics to file
  const metricsPath = path.join(config.dataDir, "metrics", `${params.channel}.md`);
  const metricsDir = path.dirname(metricsPath);
  if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });

  const output = matter.stringify("\n", {
    channel: result.channel,
    updated_at: result.updated_at,
    ...result.metrics,
  });
  fs.writeFileSync(metricsPath, output, "utf-8");

  return result;
}

export async function refreshAll(params: {
  project: string;
}): Promise<{ results: ChannelMetrics[]; errors: Array<{ channel: string; error: string }> }> {
  const config = loadProjectConfig(params.project);
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

export function getKpis(params: {
  project: string;
  period?: string;
}): Record<string, unknown> {
  const config = loadProjectConfig(params.project);
  const period = params.period || Object.keys(config.targets)[0] || "month_1";
  const targets = config.targets[period] || {};
  const currentMetrics = readLatestMetrics(params.project);

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

export function performanceSummary(params: { project: string }): Record<string, unknown> {
  const config = loadProjectConfig(params.project);
  const currentMetrics = readLatestMetrics(params.project);
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

  // Flatten metrics with channel source
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

export function snapshot(params: { project: string }): { path: string; date: string } {
  const date = new Date().toISOString().slice(0, 10);
  const snapshotsDir = path.join(getProjectDir(params.project), "metrics", "snapshots");
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }

  const currentMetrics = readLatestMetrics(params.project);

  const snapshotData: Record<string, unknown> = {
    date,
    project: params.project,
    metrics: currentMetrics,
  };

  const filePath = path.join(snapshotsDir, `${date}.md`);
  const output = matter.stringify("\n", snapshotData);
  fs.writeFileSync(filePath, output, "utf-8");

  return { path: filePath, date };
}
