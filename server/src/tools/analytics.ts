import { supabase, getProjectId } from "../lib/supabase.ts";
import { loadProjectConfig } from "../lib/config.ts";
import { refreshAll, snapshot } from "./metrics.ts";
import { alertCheck } from "./alerts.ts";
import { geoScore } from "./geo.ts";
import { listCards, addCard } from "./board.ts";
import { cadenceStatus } from "./cadence.ts";

/**
 * Flatten a snapshot's data JSONB ({ channel: { metric: value } } → { channel_metric: value }).
 */
function flattenSnapshotData(
  data: Record<string, Record<string, number | null>> | null | undefined
): Record<string, number> {
  const flat: Record<string, number> = {};
  if (!data) return flat;
  for (const [channel, channelMetrics] of Object.entries(data)) {
    if (typeof channelMetrics !== "object" || channelMetrics === null) continue;
    for (const [key, value] of Object.entries(channelMetrics)) {
      if (typeof value === "number") {
        flat[`${channel}_${key}`] = value;
      }
    }
  }
  return flat;
}

export async function trendAnalysis(params: {
  project: string;
  periods?: number;
}): Promise<Record<string, unknown>> {
  const periods = params.periods || 4;
  const projectId = await getProjectId(params.project);

  // Fetch all snapshots ordered by date
  const { data: snapshots, error } = await supabase
    .from("gtm_snapshots")
    .select("snapshot_date, data")
    .eq("project_id", projectId)
    .order("snapshot_date", { ascending: true });

  if (error) throw new Error(`Failed to query snapshots: ${error.message}`);

  if (!snapshots || snapshots.length < 2) {
    return {
      project: params.project,
      trends: [],
      note: snapshots?.length === 0
        ? "No snapshots available"
        : "Need at least 2 snapshots for trends",
    };
  }

  const latestRow = snapshots[snapshots.length - 1];
  const previousIdx = Math.max(0, snapshots.length - 1 - periods);
  const previousRow = snapshots[previousIdx];

  const latest = flattenSnapshotData(latestRow.data as Record<string, Record<string, number | null>>);
  const previous = flattenSnapshotData(previousRow.data as Record<string, Record<string, number | null>>);

  const allKeys = new Set([...Object.keys(latest), ...Object.keys(previous)]);
  const trends: Array<{
    metric: string;
    current: number;
    previous: number;
    delta: number;
    pct_change: number | null;
    direction: "up" | "down" | "flat";
  }> = [];

  for (const key of allKeys) {
    const current = latest[key] ?? 0;
    const prev = previous[key] ?? 0;
    const delta = current - prev;
    const pct_change =
      prev !== 0
        ? Math.round(((current - prev) / Math.abs(prev)) * 10000) / 100
        : null;
    trends.push({
      metric: key,
      current,
      previous: prev,
      delta,
      pct_change,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    });
  }

  return {
    project: params.project,
    latest_snapshot: latestRow.snapshot_date,
    previous_snapshot: previousRow.snapshot_date,
    trends,
  };
}

export async function funnelReport(params: {
  project: string;
}): Promise<Record<string, unknown>> {
  const projectId = await getProjectId(params.project);

  // Fetch all metric rows for this project
  const { data: metricRows, error } = await supabase
    .from("gtm_metrics")
    .select("channel, data")
    .eq("project_id", projectId);

  if (error) throw new Error(`Failed to query metrics: ${error.message}`);

  const allMetrics: Record<string, number> = {};
  const unmappedMetrics: string[] = [];

  for (const row of metricRows ?? []) {
    const data = row.data as Record<string, unknown> | null;
    if (!data) continue;
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "number") {
        allMetrics[key] = (allMetrics[key] || 0) + value;
      }
    }
  }

  // Map to funnel stages
  const funnelMap: Record<string, string> = {
    impressions: "impressions",
    clicks: "clicks",
    signups: "signups",
    paid_users: "paid",
  };

  const stages: Array<{
    stage: string;
    value: number;
    conversion_from_previous: number | null;
  }> = [];

  const stageOrder = ["impressions", "clicks", "signups", "paid"];
  let previousValue: number | null = null;

  for (const stage of stageOrder) {
    const rawKey = Object.entries(funnelMap).find(([, v]) => v === stage)?.[0];
    const value = rawKey ? allMetrics[rawKey] || 0 : 0;
    const conversion =
      previousValue !== null && previousValue > 0
        ? Math.round((value / previousValue) * 10000) / 100
        : null;
    stages.push({ stage, value, conversion_from_previous: conversion });
    previousValue = value;
  }

  // Find unmapped metrics
  const mappedKeys = new Set(Object.keys(funnelMap));
  for (const key of Object.keys(allMetrics)) {
    if (!mappedKeys.has(key)) {
      unmappedMetrics.push(key);
    }
  }

  return {
    project: params.project,
    stages,
    unmapped_metrics: unmappedMetrics,
  };
}

export async function dailyBrief(params: {
  project: string;
}): Promise<Record<string, unknown>> {
  const config = await loadProjectConfig(params.project);
  const date = new Date().toISOString().slice(0, 10);

  // 1. Refresh all metrics
  const refreshResults = await refreshAll({ project: params.project });

  // 1b. Take snapshot for trend tracking
  const snapshotResult = await snapshot({ project: params.project });

  // 2. Check alerts
  const alerts = await alertCheck({ project: params.project });

  // 3. Trend analysis
  const trends = await trendAnalysis({ project: params.project });

  // 4. GEO score
  const geo = await geoScore({ project: params.project });

  // 5. Board state
  const allCards = await listCards({ project: params.project });

  // 6. Cadence
  let cadence: Record<string, unknown> = {};
  try {
    cadence = await cadenceStatus({ project: params.project });
  } catch {
    cadence = { error: "No cadence data available" };
  }

  // 7. Overdue cards
  const today = date;
  const overdueCards = allCards.filter((c) => {
    const targetDate = c.target_date as string | null;
    const column = c.column as string;
    return targetDate && targetDate < today && column !== "done";
  });

  // Build working/not-working from trends
  const trendList = (trends.trends as Array<Record<string, unknown>>) || [];
  const working = trendList.filter((t) => (t.direction as string) === "up");
  const declining = trendList.filter((t) => (t.direction as string) === "down");

  const briefContent = `
## What's Working
${working.length > 0 ? working.map((t) => `- ${t.metric}: ${t.current} (${t.direction} ${(t.delta as number) > 0 ? "+" : ""}${t.delta})`).join("\n") : "- No upward trends detected yet"}

## Alerts
${alerts.alerts.length > 0 ? alerts.alerts.map((a) => `- ${a.metric}: ${a.direction} (threshold: ${a.threshold}, actual: ${a.actual ?? "N/A"})`).join("\n") : "- No alerts triggered"}

## What Needs Attention
### Overdue Cards
${overdueCards.length > 0 ? overdueCards.map((c) => `- ${c.title} (due: ${c.target_date}, column: ${c.column})`).join("\n") : "- No overdue cards"}

## Board Summary
- Total cards: ${allCards.length}
${Object.entries(
    allCards.reduce((acc: Record<string, number>, c) => {
      const col = c.column as string;
      acc[col] = (acc[col] || 0) + 1;
      return acc;
    }, {})
  ).map(([col, count]) => `- ${col}: ${count}`).join("\n")}

## Today's Actions
${alerts.alerts.length > 0 ? alerts.alerts.map((a) => `- Investigate ${a.metric} alert (${a.direction})`).join("\n") : ""}
${overdueCards.length > 0 ? overdueCards.map((c) => `- Address overdue: ${c.title}`).join("\n") : ""}
${declining.length > 0 ? declining.map((t) => `- Review declining ${t.metric}`).join("\n") : ""}
${alerts.alerts.length === 0 && overdueCards.length === 0 && declining.length === 0 ? "- All clear — focus on scheduled work" : ""}
`;

  // Auto-create cards for alerts
  const createdCards: Array<{ id: string; path: string }> = [];
  if (config.briefs?.auto_create_cards !== false) {
    for (const alert of alerts.alerts) {
      try {
        const card = await addCard({
          project: params.project,
          title: `Alert: ${alert.metric} ${alert.direction}`,
          column: "backlog",
          type: "initiative",
          channel: "other",
          details: `Auto-created from daily brief on ${date}.\nMetric: ${alert.metric}\nThreshold: ${alert.threshold}\nActual: ${alert.actual ?? "N/A"}\nDirection: ${alert.direction}`,
          tags: ["alert", "auto-created"],
        });
        createdCards.push(card);
      } catch {
        // skip if card creation fails
      }
    }
  }

  return {
    project: params.project,
    date,
    brief_file: null,
    brief_text: briefContent,
    refresh: {
      channels_refreshed: refreshResults.results.length,
      errors: refreshResults.errors,
    },
    alerts: alerts.alerts,
    trends: trends.trends,
    geo,
    board: {
      total: allCards.length,
      overdue: overdueCards.length,
    },
    cadence,
    snapshot: snapshotResult,
    cards_created: createdCards,
  };
}
