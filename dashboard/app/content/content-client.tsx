"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "@/components/page-header";
import MetricCard from "@/components/charts/metric-card";
import DataTable from "@/components/charts/data-table";
import CardDetailModal from "@/components/card-detail-modal";
import type { ContentPipelineStats, CardData, CadenceData } from "@/lib/types";

interface ContentClientProps {
  stats: ContentPipelineStats;
  postCards: CardData[];
  cadence: CadenceData;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ContentClient({ stats, postCards, cadence }: ContentClientProps) {
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  // Build posting calendar from cadence schedule
  const scheduledByDay: Record<string, string[]> = {};
  for (const post of cadence.linkedin.posts) {
    const dayFull = DAY_LABELS.find((d) => d.startsWith(post.day)) || post.day;
    if (!scheduledByDay[dayFull]) scheduledByDay[dayFull] = [];
    scheduledByDay[dayFull].push("LI");
  }

  return (
    <div>
      <PageHeader title="Content Queue & Scheduling" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        <MetricCard label="Scheduled" value={stats.scheduled} index={0} />
        <MetricCard label="In Prep" value={stats.preparing} index={1} />
        <MetricCard label="Live This Week" value={stats.liveThisWeek} index={2} />
        <MetricCard label="Done This Month" value={stats.doneThisMonth} index={3} />
      </div>

      {/* Content Pipeline Cards */}
      <div style={{ marginTop: "24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
          Content Pipeline
        </div>
        {postCards.length > 0 ? (
          <DataTable
            columns={[
              { key: "title", label: "Title" },
              { key: "channel", label: "Channel", mono: true },
              { key: "column", label: "Status", mono: true },
              { key: "target_date", label: "Target", mono: true },
            ]}
            data={postCards.map((c) => ({
              title: c.title,
              channel: c.channel.toUpperCase(),
              column: c.column.toUpperCase(),
              target_date: c.target_date ?? "--",
            }))}
            onRowClick={(_row, idx) => setSelectedCard(postCards[idx])}
          />
        ) : (
          <div className="empty-state">
            <div style={{ fontSize: "16px" }}>No content posts in pipeline</div>
            <div className="empty-state-hint">Create post cards via gtm_add_card with type: post</div>
          </div>
        )}
      </div>

      {/* Weekly Calendar */}
      <div style={{ marginTop: "24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
          Posting Calendar
        </div>
        <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px" }}>
            {DAY_LABELS.map((day) => (
              <div key={day} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase" }}>
                  {day}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", minHeight: "40px" }}>
                  {(scheduledByDay[day] || []).map((platform, i) => (
                    <span
                      key={i}
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "9px",
                        fontWeight: 600,
                        fontFamily: "var(--font-mono)",
                        backgroundColor: platform === "LI" ? "rgba(10, 102, 194, 0.15)" : "rgba(255, 69, 0, 0.15)",
                        color: platform === "LI" ? "var(--channel-linkedin)" : "var(--channel-reddit)",
                        border: `1px solid ${platform === "LI" ? "var(--channel-linkedin)" : "var(--channel-reddit)"}`,
                      }}
                    >
                      {platform}
                    </span>
                  ))}
                  {!scheduledByDay[day] && (
                    <span style={{ width: "28px", height: "28px", borderRadius: "50%", border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
    </div>
  );
}
