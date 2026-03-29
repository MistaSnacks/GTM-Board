import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Connector, ProjectConfig, ChannelMetrics } from "./types.ts";

/**
 * Metricool connector — pulls social media analytics across all connected platforms.
 *
 * Required .env vars:
 *   METRICOOL_USER_ID    — your Metricool user ID (from URL: userId=XXXXX)
 *   METRICOOL_BLOG_ID    — your brand ID (from URL: blogId=XXXXX)
 *   METRICOOL_USER_TOKEN — API token (Account Settings → API tab)
 *
 * Note: Metricool API requires Advanced plan ($22/mo) or Custom.
 *
 * To find your userId and blogId:
 *   1. Log into app.metricool.com
 *   2. Look at the URL: https://app.metricool.com/evolution/web?blogId=XXXXX&userId=YYYYYYY
 *   3. blogId and userId are right there
 *
 * To find your userToken:
 *   1. Account Settings → API tab → copy token
 */

const BASE_URL = "https://app.metricool.com/api";

interface MetricoolConfig {
  enabled: boolean;
  platforms?: string[]; // which platforms to pull: ["linkedin", "instagram", "tiktok", "facebook", "twitter"]
}

async function metricoolFetch(
  endpoint: string,
  userId: string,
  blogId: string,
  token: string,
  params?: Record<string, string>
): Promise<unknown> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set("userId", userId);
  url.searchParams.set("blogId", blogId);
  url.searchParams.set("integrationSource", "MCP");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      "X-Mc-Auth": token,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Metricool API error: ${response.status} ${response.statusText} ${body}`);
  }

  return response.json();
}

// Date range for last 30 days
function getDateRange(): { from: string; to: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export class MetricoolConnector implements Connector {
  name = "metricool";
  enabled: boolean;
  private platforms: string[];

  constructor(config: MetricoolConfig) {
    this.enabled = config.enabled;
    this.platforms = config.platforms || ["linkedin", "instagram", "tiktok", "facebook", "twitter"];
  }

  async refresh(project: ProjectConfig): Promise<ChannelMetrics> {
    const userId = project.env.METRICOOL_USER_ID;
    const blogId = project.env.METRICOOL_BLOG_ID;
    const token = project.env.METRICOOL_USER_TOKEN;

    if (!userId || !blogId || !token) {
      return {
        channel: "metricool",
        updated_at: new Date().toISOString(),
        metrics: {},
        raw: {
          error: "Missing METRICOOL_USER_ID, METRICOOL_BLOG_ID, or METRICOOL_USER_TOKEN in .env",
          setup_instructions: [
            "1. Sign up for Metricool Advanced plan ($22/mo) — free plan has no API",
            "2. Connect your social accounts in Metricool",
            "3. Get userId and blogId from the Metricool URL bar",
            "4. Get userToken from Account Settings → API tab",
            "5. Add to projects/<name>/.env:",
            "   METRICOOL_USER_ID=your_user_id",
            "   METRICOOL_BLOG_ID=your_blog_id",
            "   METRICOOL_USER_TOKEN=your_token",
          ],
        },
      };
    }

    const { from, to } = getDateRange();
    const allMetrics: Record<string, number | null> = {};
    const rawData: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    // Pull each platform's analytics using v2 endpoints
    for (const platform of this.platforms) {
      try {
        // Metricool v2 API: /v2/analytics/posts/{platform} for post-level data
        // Twitter uses legacy /stats/ endpoint
        const endpoint = platform === "twitter"
          ? `/stats/twitter/posts`
          : `/v2/analytics/posts/${platform}`;
        const dateParams: Record<string, string> = platform === "twitter"
          ? { start: from, end: to }
          : { from: `${from}T00:00:00`, to: `${to}T23:59:59` };

        const postsData = await metricoolFetch(
          endpoint,
          userId,
          blogId,
          token,
          dateParams
        );

        rawData[platform] = postsData;

        // v2 posts endpoint returns an array of post objects
        // Aggregate totals across all posts in the period
        const posts = Array.isArray(postsData) ? postsData : [];
        const postCount = posts.length;

        const sum = (key: string): number | null => {
          if (posts.length === 0) return null;
          let total = 0;
          for (const p of posts) {
            const v = (p as Record<string, unknown>)[key];
            if (typeof v === "number") total += v;
          }
          return total;
        };

        allMetrics[`${platform}_posts`] = postCount;

        if (platform === "linkedin") {
          allMetrics["linkedin_impressions"] = sum("impressions");
          allMetrics["linkedin_engagement"] = sum("engagement");
          allMetrics["linkedin_clicks"] = sum("clicks");
          allMetrics["linkedin_likes"] = sum("likes");
          allMetrics["linkedin_comments"] = sum("comments");
          allMetrics["linkedin_shares"] = sum("shares");
          allMetrics["linkedin_interactions"] = sum("interactions");
        } else if (platform === "instagram") {
          allMetrics["instagram_reach"] = sum("reach");
          allMetrics["instagram_impressions"] = sum("impressions");
          allMetrics["instagram_engagement"] = sum("engagement");
          allMetrics["instagram_likes"] = sum("likes");
          allMetrics["instagram_comments"] = sum("comments");
          allMetrics["instagram_saves"] = sum("saves");
          allMetrics["instagram_shares"] = sum("shares");
        } else if (platform === "tiktok") {
          allMetrics["tiktok_views"] = sum("views");
          allMetrics["tiktok_engagement"] = sum("engagement");
          allMetrics["tiktok_likes"] = sum("likes");
          allMetrics["tiktok_comments"] = sum("comments");
          allMetrics["tiktok_shares"] = sum("shares");
        } else if (platform === "facebook") {
          allMetrics["facebook_reach"] = sum("impressionsunique");
          allMetrics["facebook_impressions"] = sum("impressions");
          allMetrics["facebook_engagement"] = sum("engagement");
          allMetrics["facebook_clicks"] = sum("clicks");
          allMetrics["facebook_reactions"] = sum("reactions");
        } else if (platform === "twitter") {
          allMetrics["twitter_impressions"] = sum("twImpressions") ?? sum("impressions");
          allMetrics["twitter_engagement"] = sum("twEngagement") ?? sum("engagement");
          allMetrics["twitter_favorites"] = sum("twFavorites") ?? sum("likes");
        }
      } catch (err) {
        errors[platform] = String(err);
        // Set nulls for failed platforms
        const prefix = platform;
        allMetrics[`${prefix}_followers`] = null;
      }
    }

    // Write metrics to file
    const metricsPath = path.join(project.dataDir, "metrics", "metricool.md");
    const metricsDir = path.dirname(metricsPath);
    if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });

    const output = matter.stringify(
      `\n## Metricool Metrics (Last 30 Days)\n\nPlatforms: ${this.platforms.join(", ")}\n`,
      {
        channel: "metricool",
        updated_at: new Date().toISOString(),
        date_range: { from, to },
        ...allMetrics,
      }
    );
    fs.writeFileSync(metricsPath, output, "utf-8");

    return {
      channel: "metricool",
      updated_at: new Date().toISOString(),
      metrics: allMetrics,
      raw: { data: rawData, errors: Object.keys(errors).length > 0 ? errors : undefined },
    };
  }
}

/**
 * Try to extract a number from a Metricool response object.
 * Metricool's response shape varies — try multiple key paths.
 */
function extractNumber(data: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    // Check top level
    if (typeof data[key] === "number") return data[key] as number;
    // Check nested in a "data" or "summary" object
    if (data.data && typeof data.data === "object") {
      const nested = data.data as Record<string, unknown>;
      if (typeof nested[key] === "number") return nested[key] as number;
    }
    if (data.summary && typeof data.summary === "object") {
      const nested = data.summary as Record<string, unknown>;
      if (typeof nested[key] === "number") return nested[key] as number;
    }
  }
  return null;
}
