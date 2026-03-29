import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { getProjectDir, loadProjectConfig } from "../lib/config.ts";
import { refreshAll, snapshot } from "./metrics.ts";
import { alertCheck } from "./alerts.ts";
import { geoScore } from "./geo.ts";
import { listCards } from "./board.ts";
import { addCard } from "./board.ts";
import { cadenceStatus } from "./cadence.ts";

export function trendAnalysis(params: {
  project: string;
  periods?: number;
}): Record<string, unknown> {
  const periods = params.periods || 4;
  const snapshotsDir = path.join(getProjectDir(params.project), "metrics", "snapshots");

  if (!fs.existsSync(snapshotsDir)) {
    return { project: params.project, trends: [], note: "No snapshots available" };
  }

  const files = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith(".md")).sort();

  if (files.length < 2) {
    return { project: params.project, trends: [], note: "Need at least 2 snapshots for trends" };
  }

  const latestFile = files[files.length - 1];
  const previousIdx = Math.max(0, files.length - 1 - periods);
  const previousFile = files[previousIdx];

  const flattenSnapshot = (file: string): Record<string, number> => {
    try {
      const raw = fs.readFileSync(path.join(snapshotsDir, file), "utf-8");
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;
      const metrics = (data.metrics as Record<string, Record<string, number | null>>) || {};
      const flat: Record<string, number> = {};
      for (const [channel, channelMetrics] of Object.entries(metrics)) {
        for (const [key, value] of Object.entries(channelMetrics)) {
          if (typeof value === "number") {
            flat[`${channel}_${key}`] = value;
          }
        }
      }
      return flat;
    } catch {
      return {};
    }
  };

  const latest = flattenSnapshot(latestFile);
  const previous = flattenSnapshot(previousFile);

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
    const pct_change = prev !== 0 ? Math.round(((current - prev) / Math.abs(prev)) * 10000) / 100 : null;
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
    latest_snapshot: latestFile.replace(".md", ""),
    previous_snapshot: previousFile.replace(".md", ""),
    trends,
  };
}

export function funnelReport(params: { project: string }): Record<string, unknown> {
  // Read all connector metric files (NOT snapshots)
  const metricsDir = path.join(getProjectDir(params.project), "metrics");
  const allMetrics: Record<string, number> = {};
  const unmappedMetrics: string[] = [];

  if (fs.existsSync(metricsDir)) {
    const files = fs.readdirSync(metricsDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(metricsDir, file), "utf-8");
        const parsed = matter(raw);
        const data = parsed.data as Record<string, unknown>;
        for (const [key, value] of Object.entries(data)) {
          if (key === "channel" || key === "updated_at") continue;
          if (typeof value === "number") {
            // Sum across channels
            allMetrics[key] = (allMetrics[key] || 0) + value;
          }
        }
      } catch {
        // skip
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
    // Find the raw key that maps to this stage
    const rawKey = Object.entries(funnelMap).find(([, v]) => v === stage)?.[0];
    const value = rawKey ? (allMetrics[rawKey] || 0) : 0;
    const conversion = previousValue !== null && previousValue > 0
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

export async function dailyBrief(params: { project: string }): Promise<Record<string, unknown>> {
  const config = loadProjectConfig(params.project);
  const date = new Date().toISOString().slice(0, 10);

  // 1. Refresh all metrics
  const refreshResults = await refreshAll({ project: params.project });

  // 1b. Take snapshot for trend tracking
  const snapshotResult = snapshot({ project: params.project });

  // 2. Check alerts
  const alerts = alertCheck({ project: params.project });

  // 3. Trend analysis
  const trends = trendAnalysis({ project: params.project });

  // 4. GEO score
  const geo = geoScore({ project: params.project });

  // 5. Board state
  const allCards = listCards({ project: params.project });

  // 6. Cadence
  let cadence: Record<string, unknown> = {};
  try {
    cadence = cadenceStatus({ project: params.project });
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

  // 8. Write brief file
  const reportsDir = path.join(getProjectDir(params.project), "daily-reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

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

  const frontmatter: Record<string, unknown> = {
    date,
    project: params.project,
    alerts_count: alerts.alerts.length,
    overdue_count: overdueCards.length,
  };

  const filePath = path.join(reportsDir, `${date}-daily-brief.md`);
  const output = matter.stringify(briefContent, frontmatter);
  fs.writeFileSync(filePath, output, "utf-8");

  // 10. Auto-create cards for alerts
  const createdCards: Array<{ id: string; path: string }> = [];
  if (config.briefs?.auto_create_cards !== false) {
    for (const alert of alerts.alerts) {
      try {
        const card = addCard({
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
    brief_file: filePath,
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
