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

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;
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
    const { data, error } = await supabase
      .from("gtm_metrics")
      .select("channel, data, fetched_at")
      .eq("project_id", projectId)
      .eq("channel", channel)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: `No metrics found for channel: ${channel}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      channel: data.channel,
      metrics: data.data,
      updated_at: data.fetched_at,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
