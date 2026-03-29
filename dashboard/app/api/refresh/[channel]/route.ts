import { NextResponse } from "next/server";
import { refreshChannel } from "../../../../../server/src/tools/metrics.ts";
import { getProjects } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;
  const projects = getProjects();
  const project = projects[0] || "tailor";

  try {
    const result = await refreshChannel({ project, channel });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
