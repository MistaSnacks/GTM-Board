"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import Link from "next/link";
import type { ChannelMetricsData } from "@/lib/types";
import Sparkline from "./sparkline";

interface ChannelCardsProps {
  channels: Record<string, ChannelMetricsData>;
  sparklines: Record<string, Record<string, number[]>>;
  channelLinks?: Record<string, string>;
}

interface CardConfig {
  key: string;
  name: string;
  colorVar: string;
  initial: string;
  metricKeys: string[];
  metricLabels: Record<string, string>;
  targets?: Record<string, number>;
}

const CARD_CONFIGS: CardConfig[] = [
  {
    key: "reddit",
    name: "Reddit",
    colorVar: "var(--channel-reddit)",
    initial: "R",
    metricKeys: ["karma", "avg_upvotes", "referral_clicks", "posts"],
    metricLabels: {
      karma: "KARMA",
      avg_upvotes: "AVG UPVOTES",
      referral_clicks: "REFERRAL CLICKS",
      posts: "POSTS",
    },
    targets: { karma: 500, avg_upvotes: 10, referral_clicks: 50 },
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    colorVar: "var(--channel-linkedin)",
    initial: "L",
    metricKeys: ["followers", "engagement_rate", "impressions", "posts"],
    metricLabels: {
      followers: "FOLLOWERS",
      engagement_rate: "ENGAGEMENT RATE",
      impressions: "IMPRESSIONS",
      posts: "POSTS",
    },
    targets: { followers: 1000, engagement_rate: 3, impressions: 5000 },
  },
  {
    key: "search-console",
    name: "SEO",
    colorVar: "var(--channel-seo)",
    initial: "S",
    metricKeys: ["organic_clicks", "branded_search_volume", "avg_position", "total_impressions"],
    metricLabels: {
      organic_clicks: "ORGANIC CLICKS",
      branded_search_volume: "BRANDED SEARCH",
      avg_position: "AVG POSITION",
      total_impressions: "IMPRESSIONS",
    },
    targets: { organic_clicks: 500, branded_search_volume: 200, avg_position: 20 },
  },
  {
    key: "google_ads",
    name: "Google Ads",
    colorVar: "var(--channel-google)",
    initial: "G",
    metricKeys: ["google_ad_spend", "google_ad_clicks", "google_ad_conversions", "google_ad_cpa"],
    metricLabels: {
      google_ad_spend: "SPEND",
      google_ad_clicks: "CLICKS",
      google_ad_conversions: "CONVERSIONS",
      google_ad_cpa: "CPA",
    },
    targets: { google_ad_conversions: 50, google_ad_cpa: 10 },
  },
  {
    key: "meta_ads",
    name: "Meta Ads",
    colorVar: "var(--channel-meta)",
    initial: "M",
    metricKeys: ["meta_ad_spend", "meta_ad_impressions", "meta_ad_conversions", "meta_ad_cpa"],
    metricLabels: {
      meta_ad_spend: "SPEND",
      meta_ad_impressions: "IMPRESSIONS",
      meta_ad_conversions: "CONVERSIONS",
      meta_ad_cpa: "CPA",
    },
    targets: { meta_ad_conversions: 20, meta_ad_cpa: 8 },
  },
];


function formatMetricValue(key: string, value: number | null): string {
  if (value == null) return "--";
  if (key === "engagement_rate") return `${value.toFixed(1)}%`;
  if (key === "cpa" || key === "google_ad_cpa" || key === "meta_ad_cpa") return `$${value.toFixed(2)}`;
  if (key === "spend" || key === "google_ad_spend" || key === "meta_ad_spend") return `$${value.toLocaleString()}`;
  if (key === "roas") return `${value.toFixed(1)}x`;
  if (key === "avg_position") return value.toFixed(1);
  return value.toLocaleString();
}

function getValueColor(
  key: string,
  value: number | null,
  targets?: Record<string, number>
): string {
  if (value == null) return "var(--text-muted)";
  if (!targets || !(key in targets)) return "var(--text-primary)";
  const target = targets[key];
  // For avg_position and cpa variants, lower is better
  if (key === "avg_position" || key === "cpa" || key === "google_ad_cpa" || key === "meta_ad_cpa") {
    return value <= target ? "var(--mint)" : "var(--red)";
  }
  return value >= target ? "var(--mint)" : "var(--red)";
}

function isChannelEmpty(channelData: ChannelMetricsData | undefined): boolean {
  if (!channelData) return true;
  const metrics = channelData.metrics;
  if (!metrics || Object.keys(metrics).length === 0) return true;
  return Object.values(metrics).every((v) => v == null);
}

export default function ChannelCards({ channels, sparklines, channelLinks }: ChannelCardsProps) {
  const sparklineDataMap = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const config of CARD_CONFIGS) {
      const primaryMetric = config.metricKeys[0];
      map[config.key] = sparklines[config.key]?.[primaryMetric] ?? [];
    }
    return map;
  }, [sparklines]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: "16px",
      }}
    >
      {CARD_CONFIGS.map((config, index) => {
        const channelData = channels[config.key];
        const showPlaceholder = (config.key === "google_ads" || config.key === "meta_ads") && isChannelEmpty(channelData);
        const linkHref = channelLinks?.[config.key];

        const cardContent = (
          <motion.div
            key={config.key}
            className="card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.05, ease: "easeOut" }}
            style={
              showPlaceholder
                ? { padding: "20px", borderStyle: "dashed" }
                : { padding: "20px" }
            }
          >
            {showPlaceholder ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  minHeight: "180px",
                  gap: "12px",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "8px",
                      backgroundColor: `color-mix(in srgb, ${config.colorVar} 15%, transparent)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-outfit)",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: config.colorVar,
                    }}
                  >
                    {config.initial}
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-outfit)",
                      fontSize: "16px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {config.name}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    letterSpacing: "0.05em",
                  }}
                >
                  NOT RUNNING
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "8px",
                      backgroundColor: `color-mix(in srgb, ${config.colorVar} 15%, transparent)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-outfit)",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: config.colorVar,
                    }}
                  >
                    {config.initial}
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-outfit)",
                      fontSize: "16px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {config.name}
                  </span>
                </div>

                {/* Metrics rows */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {config.metricKeys.map((metricKey) => {
                    const value = channelData?.metrics?.[metricKey] ?? null;
                    return (
                      <div
                        key={metricKey}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-inter)",
                            fontSize: "12px",
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {config.metricLabels[metricKey]}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "14px",
                            fontWeight: 500,
                            color: getValueColor(metricKey, value, config.targets),
                          }}
                        >
                          {formatMetricValue(metricKey, value)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Sparkline */}
                <div style={{ marginTop: "2px" }}>
                  <Sparkline
                    data={sparklineDataMap[config.key]}
                    color={config.colorVar}
                    height={32}
                  />
                </div>
              </div>
            )}
          </motion.div>
        );

        if (linkHref) {
          return (
            <Link key={config.key} href={linkHref} style={{ textDecoration: "none", display: "block" }}>
              {cardContent}
            </Link>
          );
        }
        return cardContent;
      })}
    </div>
  );
}
