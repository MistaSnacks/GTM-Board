import { NextResponse } from "next/server";
import { refreshAll, snapshot } from "../../../../server/src/tools/metrics.ts";
import { getProjects } from "@/lib/config";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const GTM_HOME = process.env.GTM_HOME || "/Users/admin/gtm-board";

export async function POST() {
  const projects = getProjects();
  const project = projects[0] || "tailor";

  try {
    const { results, errors } = await refreshAll({ project });

    // Auto-snapshot if none exists for today
    let snapshotCreated = false;
    const today = new Date().toISOString().slice(0, 10);
    const snapshotPath = path.join(GTM_HOME, "projects", project, "metrics", "snapshots", `${today}.md`);
    if (!fs.existsSync(snapshotPath)) {
      snapshot({ project });
      snapshotCreated = true;
    }

    return NextResponse.json({
      ok: true,
      refreshed: results.map((r) => r.channel),
      errors: errors.map((e) => ({ channel: e.channel, error: e.error })),
      snapshotCreated,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
