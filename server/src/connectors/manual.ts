import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Connector, ProjectConfig, ChannelMetrics } from "./types.ts";

export class ManualConnector implements Connector {
  name = "manual";
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  async refresh(project: ProjectConfig): Promise<ChannelMetrics> {
    const metricsDir = path.join(project.dataDir, "metrics");
    const manualFiles = ["linkedin.md", "backlinks.md"];
    const allMetrics: Record<string, number | null> = {};

    for (const file of manualFiles) {
      const filePath = path.join(metricsDir, file);
      if (!fs.existsSync(filePath)) continue;
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = matter(raw);
        const data = parsed.data as Record<string, unknown>;
        for (const [key, value] of Object.entries(data)) {
          if (key === "channel" || key === "updated_at") continue;
          allMetrics[key] = typeof value === "number" ? value : null;
        }
      } catch {
        // skip unparseable files
      }
    }

    return {
      channel: "manual",
      updated_at: new Date().toISOString(),
      metrics: allMetrics,
    };
  }
}
