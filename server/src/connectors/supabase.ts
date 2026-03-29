import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Connector, ProjectConfig, ChannelMetrics } from "./types.ts";

export class SupabaseConnector implements Connector {
  name = "supabase";
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  async refresh(project: ProjectConfig): Promise<ChannelMetrics> {
    const supabaseUrl = project.env.SUPABASE_URL;
    const supabaseKey = project.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        channel: "supabase",
        updated_at: new Date().toISOString(),
        metrics: {
          total_signups: null,
          paid_users: null,
          mrr: null,
          free_to_paid_pct: null,
        },
        raw: { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env" },
      };
    }

    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Count total users (profiles table)
      const { count: totalSignups } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // Count paid users
      const { count: paidUsers } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_paid", true);

      const metrics: Record<string, number | null> = {
        total_signups: totalSignups ?? null,
        paid_users: paidUsers ?? null,
        free_to_paid_pct:
          totalSignups && paidUsers ? Number((paidUsers / totalSignups).toFixed(4)) : null,
        mrr: null, // requires pricing info
      };

      // Write to metrics file
      const metricsPath = path.join(project.dataDir, "metrics", "supabase.md");
      const metricsDir = path.dirname(metricsPath);
      if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });

      const output = matter.stringify("\n", {
        channel: "supabase",
        updated_at: new Date().toISOString(),
        ...metrics,
      });
      fs.writeFileSync(metricsPath, output, "utf-8");

      return {
        channel: "supabase",
        updated_at: new Date().toISOString(),
        metrics,
      };
    } catch (err) {
      return {
        channel: "supabase",
        updated_at: new Date().toISOString(),
        metrics: {
          total_signups: null,
          paid_users: null,
          mrr: null,
          free_to_paid_pct: null,
        },
        raw: { error: String(err) },
      };
    }
  }
}
