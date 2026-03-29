import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Connector, ProjectConfig, ChannelMetrics } from "./types.ts";

/**
 * Google Search Console connector — pulls search analytics via OAuth2 refresh token.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 * Required config:
 *   connectors.google_search_console.site_url
 */

async function getAccessToken(env: Record<string, string>): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OAuth token refresh failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export class GoogleSearchConsoleConnector implements Connector {
  name = "google_search_console";
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  async refresh(project: ProjectConfig): Promise<ChannelMetrics> {
    const siteUrl = project.connectors.google_search_console?.site_url as string | undefined;
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = project.env;

    if (!siteUrl || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
      return {
        channel: "google_search_console",
        updated_at: new Date().toISOString(),
        metrics: {
          organic_clicks: null,
          impressions: null,
          avg_position: null,
          branded_search_volume: null,
        },
        raw: {
          error:
            "Missing site_url in config or GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN in .env.",
        },
      };
    }

    try {
      const accessToken = await getAccessToken(project.env);

      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 28);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);

      // Fetch overall search analytics (last 28 days)
      const encodedSite = encodeURIComponent(siteUrl);
      const analyticsUrl = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;

      const overallRes = await fetch(analyticsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: startStr,
          endDate: endStr,
          dimensions: [],
          rowLimit: 1,
        }),
      });

      if (!overallRes.ok) {
        const body = await overallRes.text();
        throw new Error(`GSC API error: ${overallRes.status} ${body}`);
      }

      const overallData = (await overallRes.json()) as {
        rows?: Array<{ clicks: number; impressions: number; position: number }>;
      };

      let totalClicks = 0;
      let totalImpressions = 0;
      let avgPosition: number | null = null;

      if (overallData.rows && overallData.rows.length > 0) {
        totalClicks = overallData.rows[0].clicks;
        totalImpressions = overallData.rows[0].impressions;
        avgPosition = Math.round(overallData.rows[0].position * 10) / 10;
      }

      // Fetch branded search volume — queries containing brand name
      const brandName = project.name?.toLowerCase() || "tailor";
      const brandRes = await fetch(analyticsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: startStr,
          endDate: endStr,
          dimensions: ["query"],
          dimensionFilterGroups: [
            {
              filters: [
                {
                  dimension: "query",
                  operator: "contains",
                  expression: brandName,
                },
              ],
            },
          ],
          rowLimit: 100,
        }),
      });

      let brandedVolume = 0;
      if (brandRes.ok) {
        const brandData = (await brandRes.json()) as {
          rows?: Array<{ keys: string[]; clicks: number; impressions: number }>;
        };
        if (brandData.rows) {
          brandedVolume = brandData.rows.reduce((sum, r) => sum + r.impressions, 0);
        }
      }

      // Fetch top queries for raw data
      const topRes = await fetch(analyticsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: startStr,
          endDate: endStr,
          dimensions: ["query"],
          rowLimit: 20,
          orderBy: { fieldName: "clicks", sortOrder: "DESCENDING" },
        }),
      });

      let topQueries: Array<{ query: string; clicks: number; impressions: number; position: number }> = [];
      if (topRes.ok) {
        const topData = (await topRes.json()) as {
          rows?: Array<{ keys: string[]; clicks: number; impressions: number; position: number }>;
        };
        if (topData.rows) {
          topQueries = topData.rows.map((r) => ({
            query: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            position: Math.round(r.position * 10) / 10,
          }));
        }
      }

      const metrics: Record<string, number | null> = {
        organic_clicks: totalClicks,
        impressions: totalImpressions,
        avg_position: avgPosition,
        branded_search_volume: brandedVolume,
      };

      // Write metrics to file
      const metricsPath = path.join(project.dataDir, "metrics", "google-search-console.md");
      const metricsDir = path.dirname(metricsPath);
      if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });

      const topQueriesTable = topQueries
        .map((q) => `| ${q.query} | ${q.clicks} | ${q.impressions} | ${q.position} |`)
        .join("\n");

      const output = matter.stringify(
        `\n## Google Search Console (Last 28 Days)\n\n` +
          `| Metric | Value |\n|--------|-------|\n` +
          `| Clicks | ${totalClicks} |\n` +
          `| Impressions | ${totalImpressions} |\n` +
          `| Avg Position | ${avgPosition} |\n` +
          `| Branded Impressions | ${brandedVolume} |\n\n` +
          `### Top Queries\n\n| Query | Clicks | Impressions | Position |\n|-------|--------|-------------|----------|\n${topQueriesTable}\n`,
        {
          channel: "google_search_console",
          updated_at: new Date().toISOString(),
          date_range: { start: startStr, end: endStr },
          ...metrics,
        }
      );
      fs.writeFileSync(metricsPath, output, "utf-8");

      return {
        channel: "google_search_console",
        updated_at: new Date().toISOString(),
        metrics,
        raw: {
          date_range: { start: startStr, end: endStr },
          top_queries: topQueries,
        },
      };
    } catch (err) {
      return {
        channel: "google_search_console",
        updated_at: new Date().toISOString(),
        metrics: {
          organic_clicks: null,
          impressions: null,
          avg_position: null,
          branded_search_volume: null,
        },
        raw: { error: String(err) },
      };
    }
  }
}
