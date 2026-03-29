import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Connector, ProjectConfig, ChannelMetrics } from "./types.ts";

/**
 * Zernio connector — reports scheduled/queued post counts on refresh.
 *
 * The scheduling/publishing functions live in zernio.ts (exported functions).
 * This class implements the Connector interface for the refresh pipeline.
 *
 * Required env vars:
 *   ZERNIO_API_KEY — API key (sk_ prefix)
 */

const BASE_URL = "https://zernio.com/api/v1";

export class ZernioConnector implements Connector {
  name = "zernio";
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  async refresh(project: ProjectConfig): Promise<ChannelMetrics> {
    const apiKey = project.env.ZERNIO_API_KEY;

    if (!apiKey) {
      return {
        channel: "zernio",
        updated_at: new Date().toISOString(),
        metrics: {},
        raw: {
          error: "Missing ZERNIO_API_KEY in .env",
          setup: "Add ZERNIO_API_KEY=sk_xxx to your project .env",
        },
      };
    }

    try {
      // Fetch scheduled posts
      const scheduledRes = await fetch(`${BASE_URL}/posts?status=scheduled&limit=100`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!scheduledRes.ok) {
        throw new Error(`Zernio API error: ${scheduledRes.status} ${scheduledRes.statusText}`);
      }

      const scheduledData = (await scheduledRes.json()) as {
        posts?: unknown[];
        data?: unknown[];
      };
      const scheduledPosts = scheduledData.posts || scheduledData.data || (Array.isArray(scheduledData) ? scheduledData : []);

      // Fetch published posts (last 30 days)
      const publishedRes = await fetch(`${BASE_URL}/posts?status=published&limit=100`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      let publishedPosts: unknown[] = [];
      if (publishedRes.ok) {
        const publishedData = (await publishedRes.json()) as {
          posts?: unknown[];
          data?: unknown[];
        };
        publishedPosts = publishedData.posts || publishedData.data || (Array.isArray(publishedData) ? publishedData : []);
      }

      // Count by platform
      const platformCounts: Record<string, number> = {};
      for (const post of [...scheduledPosts, ...publishedPosts] as Array<{
        platforms?: Array<{ platform: string }>;
      }>) {
        if (post.platforms) {
          for (const p of post.platforms) {
            platformCounts[p.platform] = (platformCounts[p.platform] || 0) + 1;
          }
        }
      }

      const metrics: Record<string, number | null> = {
        zernio_scheduled: scheduledPosts.length,
        zernio_published: publishedPosts.length,
        zernio_total: scheduledPosts.length + publishedPosts.length,
      };

      // Add per-platform counts
      for (const [platform, count] of Object.entries(platformCounts)) {
        metrics[`zernio_${platform}_posts`] = count;
      }

      // Write metrics to file
      const metricsPath = path.join(project.dataDir, "metrics", "zernio.md");
      const metricsDir = path.dirname(metricsPath);
      if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });

      const output = matter.stringify(
        `\n## Zernio (Social Scheduling)\n\nScheduled: ${scheduledPosts.length}\nPublished: ${publishedPosts.length}\n`,
        {
          channel: "zernio",
          updated_at: new Date().toISOString(),
          ...metrics,
        }
      );
      fs.writeFileSync(metricsPath, output, "utf-8");

      return {
        channel: "zernio",
        updated_at: new Date().toISOString(),
        metrics,
        raw: {
          scheduled_count: scheduledPosts.length,
          published_count: publishedPosts.length,
          platform_counts: platformCounts,
          scheduled_posts: scheduledPosts,
        },
      };
    } catch (err) {
      return {
        channel: "zernio",
        updated_at: new Date().toISOString(),
        metrics: {
          zernio_scheduled: null,
          zernio_published: null,
        },
        raw: { error: String(err) },
      };
    }
  }
}
