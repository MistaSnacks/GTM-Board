import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Connector, ProjectConfig, ChannelMetrics } from "./types.ts";

export class GA4Connector implements Connector {
  name = "ga4";
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  async refresh(project: ProjectConfig): Promise<ChannelMetrics> {
    const propertyId = project.connectors.ga4?.property_id as string | undefined;
    const serviceAccountPath = project.env.GOOGLE_SERVICE_ACCOUNT_PATH;

    if (!propertyId || !serviceAccountPath) {
      return {
        channel: "ga4",
        updated_at: new Date().toISOString(),
        metrics: {
          total_sessions: null,
          organic_sessions: null,
          referral_sessions: null,
          utm_reddit: null,
          utm_linkedin: null,
        },
        raw: {
          error: "Missing property_id in config or GOOGLE_SERVICE_ACCOUNT_PATH in .env. " +
            "GA4 requires a service account with GA4 Data API enabled.",
        },
      };
    }

    // TODO: Implement with googleapis package (GA4 Data API)
    // 1. Load service account credentials
    // 2. Create BetaAnalyticsDataClient
    // 3. Run reports for sessions by source/medium
    // 4. Filter for UTM parameters (reddit, linkedin)

    return {
      channel: "ga4",
      updated_at: new Date().toISOString(),
      metrics: {
        total_sessions: null,
        organic_sessions: null,
        referral_sessions: null,
        utm_reddit: null,
        utm_linkedin: null,
      },
      raw: { status: "stub", message: "GA4 connector requires googleapis package" },
    };
  }
}
