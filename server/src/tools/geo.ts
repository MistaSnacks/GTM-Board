import { supabase, getProjectId } from "../lib/supabase.ts";

export async function geoScore(params: {
  project: string;
  metrics?: Record<string, number>;
}): Promise<Record<string, unknown>> {
  const projectId = await getProjectId(params.project);

  // Write metrics if provided — UPSERT into gtm_metrics with channel='geo'
  if (params.metrics) {
    // Fetch existing data to merge
    const { data: existing } = await supabase
      .from("gtm_metrics")
      .select("data")
      .eq("project_id", projectId)
      .eq("channel", "geo")
      .single();

    const existingData = (existing?.data as Record<string, unknown>) || {};
    const mergedData = { ...existingData, ...params.metrics };

    const { error } = await supabase
      .from("gtm_metrics")
      .upsert(
        {
          project_id: projectId,
          channel: "geo",
          data: mergedData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,channel" }
      );

    if (error) throw new Error(`Failed to upsert geo metrics: ${error.message}`);
  }

  // Read current geo metrics
  const { data: row, error } = await supabase
    .from("gtm_metrics")
    .select("data, updated_at")
    .eq("project_id", projectId)
    .eq("channel", "geo")
    .single();

  if (error || !row) {
    return {
      project: params.project,
      platforms: [],
      note: "No GEO data yet. Populate via DataForSEO MCP.",
    };
  }

  const data = row.data as Record<string, unknown>;
  const flatMetrics: Record<string, number> = {};
  const platforms: Record<string, Record<string, number>> = {};

  for (const [key, value] of Object.entries(data)) {
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
    updated_at: row.updated_at,
    flat_metrics: flatMetrics,
    platforms,
  };
}

export async function geoTrend(params: {
  project: string;
  periods?: number;
}): Promise<Record<string, unknown>> {
  const projectId = await getProjectId(params.project);
  const periods = params.periods || 4;

  // Get snapshots ordered by date
  const { data: snapshots, error } = await supabase
    .from("gtm_snapshots")
    .select("id, snapshot_date, data")
    .eq("project_id", projectId)
    .order("snapshot_date", { ascending: true });

  if (error) throw new Error(`Failed to query snapshots: ${error.message}`);

  if (!snapshots || snapshots.length < 2) {
    return { project: params.project, trends: [], note: "Need at least 2 snapshots for trends" };
  }

  const latestSnapshot = snapshots[snapshots.length - 1];
  const previousIdx = Math.max(0, snapshots.length - 1 - periods);
  const previousSnapshot = snapshots[previousIdx];

  const extractGeoMetrics = (snap: Record<string, unknown>): Record<string, number> => {
    const data = snap.data as Record<string, unknown> | null;
    if (!data) return {};
    const metrics = (data.metrics as Record<string, Record<string, number | null>>) || {};
    const geoMetrics = metrics.geo || {};
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(geoMetrics)) {
      if (typeof value === "number") result[key] = value;
    }
    return result;
  };

  const latest = extractGeoMetrics(latestSnapshot);
  const previous = extractGeoMetrics(previousSnapshot);

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
    latest_snapshot: (latestSnapshot.snapshot_date as string),
    previous_snapshot: (previousSnapshot.snapshot_date as string),
    trends,
  };
}
