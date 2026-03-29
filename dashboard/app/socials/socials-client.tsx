"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "@/components/page-header";
import MetricCard from "@/components/charts/metric-card";
import AreaChartCard from "@/components/charts/area-chart";
import LineChartCard from "@/components/charts/line-chart";
import DataTable from "@/components/charts/data-table";
import CadenceTracker from "@/components/cadence-tracker";
import CardDetailModal from "@/components/card-detail-modal";
import type { CardData, CadenceData } from "@/lib/types";

interface SocialsClientProps {
  linkedinMetrics: Record<string, number | null>;
  redditMetrics: Record<string, number | null>;
  linkedinChart: Record<string, unknown>[];
  redditChart: Record<string, unknown>[];
  cadence: CadenceData;
  streak: number;
  socialCards: CardData[];
}

export default function SocialsClient({
  linkedinMetrics,
  redditMetrics,
  linkedinChart,
  redditChart,
  cadence,
  streak,
  socialCards,
}: SocialsClientProps) {
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);

  return (
    <div>
      <PageHeader title="Social Media" subtitle="LinkedIn + Reddit" />

      {/* Cadence Tracker — expanded */}
      <motion.div className="card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: "20px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
            Cadence Tracker
          </span>
          {streak > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--mint)" }}>
              {streak} week streak
            </span>
          )}
        </div>
        <CadenceTracker
          linkedinPosts={cadence.linkedin.posts}
          linkedinPostsDone={cadence.linkedin.posts_done}
          linkedinPostsTarget={cadence.linkedin.posts_target}
          linkedinCommentsDone={cadence.linkedin.comments_done}
          linkedinCommentsTarget={cadence.linkedin.comments_target}
          redditCommentsDone={cadence.reddit.comments_done}
          redditCommentsTarget={cadence.reddit.comments_target}
        />
      </motion.div>

      {/* Two-column: LinkedIn + Reddit metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }} style={{ padding: "20px" }}>
          <div style={{ fontFamily: "var(--font-outfit)", fontSize: "16px", fontWeight: 600, color: "var(--channel-linkedin)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--channel-linkedin)" }} />
            LinkedIn
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { k: "followers", l: "Followers" },
              { k: "engagement_rate", l: "Engagement", fmt: (v: number) => `${v.toFixed(1)}%` },
              { k: "impressions", l: "Impressions" },
              { k: "posts", l: "Posts this month" },
            ].map(({ k, l, fmt: fmtFn }) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-inter)", fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{l}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                  {linkedinMetrics[k] != null ? (fmtFn ? fmtFn(linkedinMetrics[k] as number) : Number(linkedinMetrics[k]).toLocaleString()) : "--"}
                </span>
              </div>
            ))}
          </div>
          {linkedinChart.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <AreaChartCard data={linkedinChart} dataKey="impressions" height={120} color="var(--channel-linkedin)" showXAxis={false} />
            </div>
          )}
        </motion.div>

        <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} style={{ padding: "20px" }}>
          <div style={{ fontFamily: "var(--font-outfit)", fontSize: "16px", fontWeight: 600, color: "var(--channel-reddit)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--channel-reddit)" }} />
            Reddit
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { k: "karma", l: "Karma" },
              { k: "avg_upvotes", l: "Avg Upvotes" },
              { k: "referral_clicks", l: "Referral Clicks" },
              { k: "posts", l: "Posts this month" },
            ].map(({ k, l }) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-inter)", fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{l}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                  {redditMetrics[k] != null ? Number(redditMetrics[k]).toLocaleString() : "--"}
                </span>
              </div>
            ))}
          </div>
          {redditChart.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <AreaChartCard data={redditChart} dataKey="karma" height={120} color="var(--channel-reddit)" showXAxis={false} />
            </div>
          )}
        </motion.div>
      </div>

      {/* Follower + Engagement charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
        <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} style={{ padding: "20px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            Follower Growth
          </div>
          <LineChartCard
            data={linkedinChart.length > 0 ? linkedinChart : redditChart}
            series={[
              ...(linkedinChart.length > 0 ? [{ dataKey: "followers", color: "var(--channel-linkedin)", name: "LinkedIn" }] : []),
            ]}
            height={180}
            showLegend
          />
        </motion.div>
        <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} style={{ padding: "20px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            Engagement Rate
          </div>
          <LineChartCard
            data={linkedinChart}
            series={[{ dataKey: "engagement_rate", color: "var(--channel-linkedin)", name: "LinkedIn %" }]}
            height={180}
            yFormatter={(v) => `${v}%`}
          />
        </motion.div>
      </div>

      {socialCards.length > 0 && (
        <div style={{ marginTop: "24px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            Social Kanban Cards
          </div>
          <DataTable
            columns={[
              { key: "channel", label: "Platform", mono: true },
              { key: "title", label: "Title" },
              { key: "column", label: "Status", mono: true },
              { key: "type", label: "Type", mono: true },
            ]}
            data={socialCards.map((c) => ({ channel: c.channel.toUpperCase(), title: c.title, column: c.column.toUpperCase(), type: c.type }))}
            onRowClick={(_row, idx) => setSelectedCard(socialCards[idx])}
          />
        </div>
      )}

      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
    </div>
  );
}
