import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { getProjectDir } from "../lib/config.ts";

export function geoScore(params: {
  project: string;
  metrics?: Record<string, number>;
}): Record<string, unknown> {
  const metricsDir = path.join(getProjectDir(params.project), "metrics");
  const geoPath = path.join(metricsDir, "geo.md");

  // Write metrics if provided
  if (params.metrics) {
    if (!fs.existsSync(metricsDir)) {
      fs.mkdirSync(metricsDir, { recursive: true });
    }
    const frontmatter: Record<string, unknown> = {
      channel: "geo",
      updated_at: new Date().toISOString(),
      ...params.metrics,
    };
    const output = matter.stringify("\n", frontmatter);
    fs.writeFileSync(geoPath, output, "utf-8");
  }

  // Read current geo metrics
  if (!fs.existsSync(geoPath)) {
    return {
      project: params.project,
      platforms: [],
      note: "No GEO data yet. Populate via DataForSEO MCP.",
    };
  }

  const raw = fs.readFileSync(geoPath, "utf-8");
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;

  // Re-group flat keys by platform for readability
  const platforms: Record<string, Record<string, number>> = {};
  const flatMetrics: Record<string, number> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key === "channel" || key === "updated_at") continue;
    if (typeof value !== "number") continue;
    flatMetrics[key] = value;

    // Group by platform prefix (e.g., chatgpt_score → chatgpt.score)
    const underscoreIdx = key.indexOf("_");
    if (underscoreIdx > 0) {
      const platform = key.slice(0, underscoreIdx);
      const metric = key.slice(underscoreIdx + 1);
      if (!platforms[platform]) platforms[platform] = {};
      platforms[platform][metric] = value;
    }
  }

  return {
    project: params.project,
    updated_at: data.updated_at,
    flat_metrics: flatMetrics,
    platforms,
  };
}

export function geoTrend(params: {
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

  const readSnapshot = (file: string): Record<string, number> => {
    try {
      const raw = fs.readFileSync(path.join(snapshotsDir, file), "utf-8");
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;
      const metrics = (data.metrics as Record<string, Record<string, number | null>>) || {};
      const geoMetrics = metrics.geo || {};
      const result: Record<string, number> = {};
      for (const [key, value] of Object.entries(geoMetrics)) {
        if (typeof value === "number") result[key] = value;
      }
      return result;
    } catch {
      return {};
    }
  };

  const latest = readSnapshot(latestFile);
  const previous = readSnapshot(previousFile);

  // Compare _score keys
  const trends: Array<{
    platform: string;
    current: number;
    previous: number;
    delta: number;
    direction: "up" | "down" | "flat";
  }> = [];

  const allKeys = new Set([...Object.keys(latest), ...Object.keys(previous)]);
  for (const key of allKeys) {
    if (!key.endsWith("_score")) continue;
    const platform = key.replace("_score", "");
    const current = latest[key] ?? 0;
    const prev = previous[key] ?? 0;
    const delta = current - prev;
    trends.push({
      platform,
      current,
      previous: prev,
      delta,
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
