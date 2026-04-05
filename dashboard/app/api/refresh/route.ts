import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getProjects } from "@/lib/config";

export const dynamic = "force-dynamic";

async function getProjectId(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from("gtm_projects")
    .select("id")
    .eq("slug", slug)
    .single();
  return data?.id ?? null;
}

export async function POST() {
  const projects = await getProjects();
  const project = projects[0] || "tailor";
  const projectId = await getProjectId(project);

  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: `Project "${project}" not found` },
      { status: 404 }
    );
  }

  try {
    // Read current metrics from Supabase
    const { data: metricsRows, error: metricsError } = await supabase
      .from("gtm_metrics")
      .select("channel, data, fetched_at")
      .eq("project_id", projectId);

    if (metricsError) {
      throw new Error(`Failed to read metrics: ${metricsError.message}`);
    }

    const channels = (metricsRows || []).map((r) => r.channel as string);

    // Auto-snapshot if none exists for today
    let snapshotCreated = false;
    const today = new Date().toISOString().slice(0, 10);

    const { data: existing } = await supabase
      .from("gtm_snapshots")
      .select("id")
      .eq("project_id", projectId)
      .eq("snapshot_date", today)
      .single();

    if (!existing) {
      const metricsMap: Record<string, Record<string, number | null>> = {};
      for (const row of metricsRows || []) {
        metricsMap[row.channel as string] = (row.data || {}) as Record<string, number | null>;
      }

      const { error: snapError } = await supabase
        .from("gtm_snapshots")
        .upsert(
          {
            project_id: projectId,
            snapshot_date: today,
            data: { date: today, project, metrics: metricsMap },
          },
          { onConflict: "project_id,snapshot_date" }
        );

      if (snapError) {
        throw new Error(`Failed to create snapshot: ${snapError.message}`);
      }
      snapshotCreated = true;
    }

    return NextResponse.json({
      ok: true,
      refreshed: channels,
      errors: [],
      snapshotCreated,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
