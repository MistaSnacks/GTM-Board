import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Connector, ProjectConfig, ChannelMetrics } from "./types.ts";

/**
 * Google Ads connector — pulls campaign data via direct Google Ads API v23.
 *
 * Required env vars:
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_CUSTOMER_ID
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REFRESH_TOKEN
 * Optional:
 *   GOOGLE_ADS_MANAGER_ID
 */

const BASE_URL = "https://googleads.googleapis.com/v23";

let cachedToken: { token: string; expiresAt: number } | null = null;

function stripDashes(id: string): string {
  return id.replace(/-/g, "");
}

async function refreshAccessToken(env: Record<string, string>): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google OAuth refresh failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

async function gaqlQuery(
  env: Record<string, string>,
  query: string
): Promise<Record<string, unknown>[]> {
  const customerId = stripDashes(env.GOOGLE_ADS_CUSTOMER_ID);
  const token = await refreshAccessToken(env);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN,
    "Content-Type": "application/json",
  };
  if (env.GOOGLE_ADS_MANAGER_ID) {
    headers["login-customer-id"] = stripDashes(env.GOOGLE_ADS_MANAGER_ID);
  }

  const response = await fetch(
    `${BASE_URL}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    }
  );

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(`Google Ads API returned non-JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }

  const batches = (await response.json()) as { results?: Record<string, unknown>[] }[];
  const rows: Record<string, unknown>[] = [];
  if (Array.isArray(batches)) {
    for (const batch of batches) {
      if (Array.isArray(batch.results)) {
        rows.push(...batch.results);
      }
    }
  }
  return rows;
}

export class GoogleAdsConnector implements Connector {
  name = "google_ads";
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  async refresh(project: ProjectConfig): Promise<ChannelMetrics> {
    const env = project.env;

    if (!env.GOOGLE_ADS_DEVELOPER_TOKEN || !env.GOOGLE_ADS_CUSTOMER_ID || !env.GOOGLE_CLIENT_ID) {
      return {
        channel: "google_ads",
        updated_at: new Date().toISOString(),
        metrics: {},
        raw: { error: "Missing Google Ads API credentials (GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, GOOGLE_CLIENT_ID)" },
      };
    }

    try {
      // Pull campaign-level metrics for the last 30 days
      const rows = await gaqlQuery(env, `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          campaign_budget.amount_micros,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.ctr,
          metrics.average_cpc
        FROM campaign
        WHERE campaign.status != 'REMOVED'
          AND segments.date DURING LAST_30_DAYS
        ORDER BY metrics.impressions DESC
        LIMIT 50
      `);

      const campaigns: Record<string, unknown>[] = [];
      let totalSpend = 0;
      let totalImpressions = 0;
      let totalClicks = 0;
      let totalConversions = 0;

      for (const row of rows) {
        const campaign = row.campaign as Record<string, unknown>;
        const m = row.metrics as Record<string, unknown>;
        const budget = row.campaignBudget as Record<string, unknown>;

        const spendMicros = Number(m?.costMicros || 0);
        const impressions = Number(m?.impressions || 0);
        const clicks = Number(m?.clicks || 0);
        const conversions = Number(m?.conversions || 0);

        totalSpend += spendMicros / 1_000_000;
        totalImpressions += impressions;
        totalClicks += clicks;
        totalConversions += conversions;

        campaigns.push({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          type: campaign.advertisingChannelType,
          budget_daily: budget?.amountMicros ? Number(budget.amountMicros) / 1_000_000 : null,
          impressions,
          clicks,
          spend: Math.round(spendMicros / 10_000) / 100,
          conversions,
          ctr: m?.ctr,
          avg_cpc: m?.averageCpc ? Number(m.averageCpc) / 1_000_000 : null,
        });
      }

      totalSpend = Math.round(totalSpend * 100) / 100;
      const cpa = totalConversions > 0 ? Math.round((totalSpend / totalConversions) * 100) / 100 : null;
      const cpc = totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : null;
      const ctr = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : null;

      const metrics: Record<string, number | null> = {
        google_ad_campaigns: campaigns.length,
        google_ad_spend: totalSpend,
        google_ad_impressions: totalImpressions,
        google_ad_clicks: totalClicks,
        google_ad_conversions: totalConversions,
        google_ad_cpa: cpa,
        google_ad_cpc: cpc,
        google_ad_ctr: ctr,
      };

      // Write metrics to file
      const metricsPath = path.join(project.dataDir, "metrics", "google_ads.md");
      const metricsDir = path.dirname(metricsPath);
      if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });

      const output = matter.stringify(
        `\n## Google Ads (Last 30 Days)\n\nCampaigns: ${campaigns.length}\nSpend: $${totalSpend}\nClicks: ${totalClicks}\nImpressions: ${totalImpressions}\n`,
        {
          channel: "google_ads",
          updated_at: new Date().toISOString(),
          ...metrics,
        }
      );
      fs.writeFileSync(metricsPath, output, "utf-8");

      return {
        channel: "google_ads",
        updated_at: new Date().toISOString(),
        metrics,
        raw: { campaigns_count: campaigns.length, campaigns },
      };
    } catch (err) {
      return {
        channel: "google_ads",
        updated_at: new Date().toISOString(),
        metrics: {
          google_ad_spend: null,
          google_ad_impressions: null,
          google_ad_clicks: null,
          google_ad_cpa: null,
          google_ad_conversions: null,
        },
        raw: { error: String(err) },
      };
    }
  }
}
