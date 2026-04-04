import { supabase, getProjectId } from "../lib/supabase.ts";
import { loadProjectConfig } from "../lib/config.ts";

interface Alert {
  metric: string;
  threshold: number;
  actual: number | null;
  direction: "below_min" | "above_max" | "missing";
}

export async function alertCheck(params: { project: string }): Promise<{ alerts: Alert[] }> {
  const config = await loadProjectConfig(params.project);
  const alertConfig = config.alerts;

  if (!alertConfig) {
    return { alerts: [] };
  }

  const projectId = await getProjectId(params.project);

  // Query all metrics for this project
  const { data: rows, error } = await supabase
    .from("gtm_metrics")
    .select("channel, data, updated_at")
    .eq("project_id", projectId);

  if (error) throw new Error(`Failed to query metrics: ${error.message}`);

  // Flatten all metrics from data JSONB into a single map
  const allMetrics: Record<string, number> = {};
  for (const row of rows || []) {
    const data = row.data as Record<string, unknown> | null;
    if (!data) continue;
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "number") {
        allMetrics[key] = value;
      }
    }
  }

  const alerts: Alert[] = [];

  for (const [alertKey, threshold] of Object.entries(alertConfig)) {
    if (typeof threshold !== "number") continue;

    const isMin = alertKey.endsWith("_min");
    const isMax = alertKey.endsWith("_max");
    if (!isMin && !isMax) continue;

    const metricKey = alertKey.slice(0, -4); // remove _min or _max

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
