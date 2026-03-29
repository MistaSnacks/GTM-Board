import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { getProjectDir, loadProjectConfig } from "../lib/config.ts";

interface Alert {
  metric: string;
  threshold: number;
  actual: number | null;
  direction: "below_min" | "above_max" | "missing";
}

export function alertCheck(params: { project: string }): { alerts: Alert[] } {
  const config = loadProjectConfig(params.project);
  const alertConfig = config.alerts;

  if (!alertConfig) {
    return { alerts: [] };
  }

  // Read all metrics files (flat key-value)
  const metricsDir = path.join(getProjectDir(params.project), "metrics");
  const allMetrics: Record<string, number> = {};

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
            allMetrics[key] = value;
          }
        }
      } catch {
        // skip unparseable files
      }
    }
  }

  const alerts: Alert[] = [];

  for (const [alertKey, threshold] of Object.entries(alertConfig)) {
    if (typeof threshold !== "number") continue;

    const isMin = alertKey.endsWith("_min");
    const isMax = alertKey.endsWith("_max");
    if (!isMin && !isMax) continue;

    const metricKey = isMin
      ? alertKey.slice(0, -4) // remove _min
      : alertKey.slice(0, -4); // remove _max

    const actual = allMetrics[metricKey];

    if (actual === undefined) {
      alerts.push({ metric: metricKey, threshold, actual: null, direction: "missing" });
    } else if (isMin && actual < threshold) {
      alerts.push({ metric: metricKey, threshold, actual, direction: "below_min" });
    } else if (isMax && actual > threshold) {
      alerts.push({ metric: metricKey, threshold, actual, direction: "above_max" });
    }
  }

  return { alerts };
}
