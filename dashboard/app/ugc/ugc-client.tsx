"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "@/components/page-header";
import MetricCard from "@/components/charts/metric-card";
import DataTable from "@/components/charts/data-table";
import BarChartCard from "@/components/charts/bar-chart";
import CardDetailModal from "@/components/card-detail-modal";
import type { UGCBrief, UGCPipelineStats, CardData } from "@/lib/types";

interface UGCClientProps {
  briefs: UGCBrief[];
  stats: UGCPipelineStats;
  ugcCards: CardData[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "var(--amber)",
  submitted: "var(--channel-linkedin)",
  approved: "var(--mint)",
  rejected: "var(--red)",
};

function StatusDot({ status }: { status: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: STATUS_COLORS[status] || "var(--text-muted)",
        }}
      />
      <span style={{ textTransform: "uppercase" }}>{status}</span>
    </span>
  );
}

export default function UGCClient({ briefs, stats, ugcCards }: UGCClientProps) {
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const hasData = stats.total > 0;

  return (
    <div>
      <PageHeader title="UGC Pipeline" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        <MetricCard label="Draft" value={stats.draft} index={0} />
        <MetricCard label="Submitted" value={stats.submitted} index={1} />
        <MetricCard label="Approved" value={stats.approved} index={2} />
        <MetricCard label="Rejected" value={stats.rejected} index={3} />
      </div>

      {/* Pipeline flow */}
      {hasData && (
        <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "20px", marginTop: "24px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "16px" }}>
            Pipeline Flow
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", height: "32px" }}>
            {(["draft", "submitted", "approved", "rejected"] as const).map((stage) => {
              const count = stats[stage];
              const width = stats.total > 0 ? Math.max((count / stats.total) * 100, count > 0 ? 8 : 0) : 0;
              if (width === 0) return null;
              return (
                <motion.div
                  key={stage}
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  style={{
                    height: "100%",
                    backgroundColor: STATUS_COLORS[stage],
                    borderRadius: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--bg-deep)",
                    fontWeight: 600,
                    minWidth: count > 0 ? "32px" : 0,
                  }}
                >
                  {count}
                </motion.div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
            {(["draft", "submitted", "approved", "rejected"] as const).map((stage) => (
              <div key={stage} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: STATUS_COLORS[stage] }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  {stage} ({stats[stage]})
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Briefs table */}
      <div style={{ marginTop: "24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
          Active Briefs
        </div>
        {briefs.length > 0 ? (
          <DataTable
            columns={[
              { key: "creator", label: "Creator", mono: true },
              { key: "type", label: "Type", mono: true },
              {
                key: "approvalStatus",
                label: "Status",
                mono: true,
                render: (value) => <StatusDot status={value as string} />,
              },
              { key: "dueDate", label: "Due", mono: true },
              { key: "channel", label: "Channel", mono: true },
            ]}
            data={briefs.map((b) => ({
              id: b.id,
              creator: b.creator,
              type: b.type,
              approvalStatus: b.approvalStatus,
              dueDate: b.dueDate ?? "--",
              channel: b.channel?.toUpperCase() ?? "--",
            }))}
            onRowClick={(row) => {
              const card = ugcCards.find((c) => c.id === row.id);
              if (card) setSelectedCard(card);
            }}
          />
        ) : (
          <div className="empty-state">
            <div style={{ fontSize: "16px" }}>No UGC briefs yet</div>
            <div className="empty-state-hint">Create UGC briefs via gtm_create_ugc_brief</div>
          </div>
        )}
      </div>

      {/* Charts */}
      {hasData && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "24px" }}>
          <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} style={{ padding: "20px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
              Briefs by Type
            </div>
            <BarChartCard
              data={Object.entries(stats.byType).map(([name, value]) => ({ name, value }))}
              dataKey="value"
              height={180}
              color="var(--turquoise)"
            />
          </motion.div>
          <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} style={{ padding: "20px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
              Creator Activity
            </div>
            <BarChartCard
              data={Object.entries(stats.byCreator).map(([name, data]) => ({ name, value: data.total }))}
              dataKey="value"
              height={180}
              color="var(--mint)"
              layout="vertical"
            />
          </motion.div>
        </div>
      )}

      {/* Approved content */}
      {briefs.filter((b) => b.approvalStatus === "approved").length > 0 && (
        <div style={{ marginTop: "24px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            Approved Content
          </div>
          <DataTable
            columns={[
              { key: "title", label: "Title" },
              { key: "creator", label: "Creator", mono: true },
              { key: "assetUrl", label: "Asset", mono: true },
              { key: "dueDate", label: "Date", mono: true },
            ]}
            data={briefs
              .filter((b) => b.approvalStatus === "approved")
              .map((b) => ({
                id: b.id,
                title: b.title,
                creator: b.creator,
                assetUrl: b.assetUrl || b.paperArtboard || "--",
                dueDate: b.dueDate ?? "--",
              }))}
            onRowClick={(row) => {
              const card = ugcCards.find((c) => c.id === row.id);
              if (card) setSelectedCard(card);
            }}
          />
        </div>
      )}

      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
    </div>
  );
}
