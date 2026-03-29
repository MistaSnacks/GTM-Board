import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Connector, ProjectConfig, ChannelMetrics } from "./types.ts";

export class RedditConnector implements Connector {
  name = "reddit";
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  async refresh(project: ProjectConfig): Promise<ChannelMetrics> {
    const clientId = project.env.REDDIT_CLIENT_ID;
    const clientSecret = project.env.REDDIT_CLIENT_SECRET;
    const username = project.env.REDDIT_USERNAME;
    const password = project.env.REDDIT_PASSWORD;

    if (!clientId || !clientSecret || !username || !password) {
      return {
        channel: "reddit",
        updated_at: new Date().toISOString(),
        metrics: {
          post_karma: null,
          comment_karma: null,
          referral_clicks: null,
        },
        raw: { error: "Missing Reddit credentials in .env" },
      };
    }

    try {
      // Reddit OAuth: script-type grant
      const authResponse = await fetch("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "gtm-board/0.1.0",
        },
        body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
      });

      if (!authResponse.ok) {
        throw new Error(`Reddit auth failed: ${authResponse.status}`);
      }

      const authData = (await authResponse.json()) as { access_token: string };
      const token = authData.access_token;

      // Get user info for karma
      const meResponse = await fetch("https://oauth.reddit.com/api/v1/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "gtm-board/0.1.0",
        },
      });

      if (!meResponse.ok) {
        throw new Error(`Reddit /me failed: ${meResponse.status}`);
      }

      const meData = (await meResponse.json()) as {
        link_karma: number;
        comment_karma: number;
        total_karma: number;
      };

      const metrics: Record<string, number | null> = {
        post_karma: meData.link_karma,
        comment_karma: meData.comment_karma,
        total_karma: meData.total_karma,
        referral_clicks: null, // requires UTM tracking via GA4
      };

      // Write metrics file
      const metricsPath = path.join(project.dataDir, "metrics", "reddit.md");
      const metricsDir = path.dirname(metricsPath);
      if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });

      const output = matter.stringify("\n", {
        channel: "reddit",
        updated_at: new Date().toISOString(),
        ...metrics,
      });
      fs.writeFileSync(metricsPath, output, "utf-8");

      return {
        channel: "reddit",
        updated_at: new Date().toISOString(),
        metrics,
        raw: { username: meData },
      };
    } catch (err) {
      return {
        channel: "reddit",
        updated_at: new Date().toISOString(),
        metrics: {
          post_karma: null,
          comment_karma: null,
          referral_clicks: null,
        },
        raw: { error: String(err) },
      };
    }
  }
}
