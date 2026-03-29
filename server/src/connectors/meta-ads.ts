import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Connector, ProjectConfig, ChannelMetrics } from "./types.ts";

/**
 * Meta Ads connector — pulls Facebook/Instagram ad campaign data via Meta Marketing API.
 *
 * API version: v21.0
 * Base URL: https://graph.facebook.com/v21.0
 *
 * Required env vars:
 *   META_ACCESS_TOKEN — Long-lived access token with ads_read permission
 *   META_AD_ACCOUNT_ID — Ad account ID (without "act_" prefix)
 */

const BASE_URL = "https://graph.facebook.com/v21.0";

export class MetaAdsConnector implements Connector {
  name = "meta_ads";
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  async refresh(project: ProjectConfig): Promise<ChannelMetrics> {
    const token = project.env.META_ACCESS_TOKEN;
    const accountId = project.env.META_AD_ACCOUNT_ID;

    if (!token || !accountId) {
      return {
        channel: "meta_ads",
        updated_at: new Date().toISOString(),
        metrics: {},
        raw: {
          error: "Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID in .env",
          setup: "Add META_ACCESS_TOKEN and META_AD_ACCOUNT_ID to your project .env",
        },
      };
    }

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    try {
      // Fetch account-level insights for last 30 days
      const insightsFields = "spend,impressions,reach,clicks,actions,cost_per_action_type,cpc,ctr";
      const insightsUrl =
        `${BASE_URL}/act_${accountId}/insights` +
        `?fields=${insightsFields}` +
        `&time_range={"since":"${startStr}","until":"${endStr}"}` +
        `&access_token=${token}`;

      const insightsRes = await fetch(insightsUrl);
      const insightsData = (await insightsRes.json()) as {
        data?: Array<Record<string, unknown>>;
        error?: { message: string; code: number };
      };

      if (insightsData.error) {
        throw new Error(
          `Meta API error: ${insightsData.error.message} (code: ${insightsData.error.code})`
        );
      }

      const row = insightsData.data?.[0] as Record<string, unknown> | undefined;

      // Fetch campaign list for count and per-campaign breakdown
      const campaignsFields = "id,name,status,objective,daily_budget,lifetime_budget";
      const campaignsInsights = "impressions,spend,clicks,reach,actions,cpc,ctr";
      const campaignsUrl =
        `${BASE_URL}/act_${accountId}/campaigns` +
        `?fields=${campaignsFields},insights.time_range({"since":"${startStr}","until":"${endStr}"}){${campaignsInsights}}` +
        `&limit=50` +
        `&access_token=${token}`;

      const campaignsRes = await fetch(campaignsUrl);
      const campaignsData = (await campaignsRes.json()) as {
        data?: Array<Record<string, unknown>>;
        error?: { message: string; code: number };
      };

      if (campaignsData.error) {
        throw new Error(
          `Meta API error: ${campaignsData.error.message} (code: ${campaignsData.error.code})`
        );
      }

      const campaigns = campaignsData.data || [];

      // Parse account-level totals
      const totalSpend = row ? parseFloat(row.spend as string) || 0 : 0;
      const totalImpressions = row ? parseInt(row.impressions as string, 10) || 0 : 0;
      const totalReach = row ? parseInt(row.reach as string, 10) || 0 : 0;
      const totalClicks = row ? parseInt(row.clicks as string, 10) || 0 : 0;
      const ctr = row ? parseFloat(row.ctr as string) || 0 : 0;
      const cpc = row ? parseFloat(row.cpc as string) || 0 : 0;

      // Extract conversions from actions array
      const actions = (row?.actions || []) as Array<{ action_type: string; value: string }>;
      const conversions = actions.reduce((sum, a) => {
        if (
          a.action_type === "offsite_conversion.fb_pixel_lead" ||
          a.action_type === "lead" ||
          a.action_type === "complete_registration" ||
          a.action_type === "offsite_conversion.fb_pixel_complete_registration"
        ) {
          return sum + (parseInt(a.value, 10) || 0);
        }
        return sum;
      }, 0);

      const cpa = conversions > 0 ? Math.round((totalSpend / conversions) * 100) / 100 : null;

      // Build per-campaign summary for raw output
      const campaignSummaries = campaigns.map((c) => {
        const insights = c.insights as { data?: Array<Record<string, unknown>> } | undefined;
        const ci = insights?.data?.[0];
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          objective: c.objective,
          daily_budget: c.daily_budget
            ? parseFloat(c.daily_budget as string) / 100
            : null,
          impressions: ci ? parseInt(ci.impressions as string, 10) || 0 : 0,
          clicks: ci ? parseInt(ci.clicks as string, 10) || 0 : 0,
          spend: ci ? parseFloat(ci.spend as string) || 0 : 0,
          reach: ci ? parseInt(ci.reach as string, 10) || 0 : 0,
          cpc: ci ? parseFloat(ci.cpc as string) || null : null,
          ctr: ci ? parseFloat(ci.ctr as string) || null : null,
        };
      });

      const metrics: Record<string, number | null> = {
        meta_ad_campaigns: campaigns.length,
        meta_ad_spend: Math.round(totalSpend * 100) / 100,
        meta_ad_impressions: totalImpressions,
        meta_ad_reach: totalReach,
        meta_ad_clicks: totalClicks,
        meta_ad_conversions: conversions,
        meta_ad_cpa: cpa,
        meta_ad_cpc: Math.round(cpc * 100) / 100 || null,
        meta_ad_ctr: Math.round(ctr * 100) / 100 || null,
      };

      // Write metrics to file
      const metricsPath = path.join(project.dataDir, "metrics", "meta_ads.md");
      const metricsDir = path.dirname(metricsPath);
      if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });

      const output = matter.stringify(
        `\n## Meta Ads (Last 30 Days)\n\nCampaigns: ${campaigns.length}\nSpend: $${metrics.meta_ad_spend}\nImpressions: ${totalImpressions}\nClicks: ${totalClicks}\n`,
        {
          channel: "meta_ads",
          updated_at: new Date().toISOString(),
          date_range: { start: startStr, end: endStr },
          ...metrics,
        }
      );
      fs.writeFileSync(metricsPath, output, "utf-8");

      return {
        channel: "meta_ads",
        updated_at: new Date().toISOString(),
        metrics,
        raw: {
          date_range: { start: startStr, end: endStr },
          campaigns_count: campaigns.length,
          campaigns: campaignSummaries,
        },
      };
    } catch (err) {
      return {
        channel: "meta_ads",
        updated_at: new Date().toISOString(),
        metrics: {
          meta_ad_spend: null,
          meta_ad_impressions: null,
          meta_ad_clicks: null,
          meta_ad_cpa: null,
          meta_ad_conversions: null,
        },
        raw: { error: String(err) },
      };
    }
  }
}
