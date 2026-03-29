"use client";

import { motion } from "framer-motion";
import PageHeader from "@/components/page-header";
import DataTable from "@/components/charts/data-table";
import BarChartCard from "@/components/charts/bar-chart";
import type { FunnelData, WeeklyDelta } from "@/lib/types";

interface AnalyticsClientProps {
  funnel: FunnelData;
  deltas: WeeklyDelta[];
  channelCharts: Record<string, Record<string, unknown>[]>;
}

export default function AnalyticsClient({ funnel, deltas }: AnalyticsClientProps) {
  const hasFunnelData = funnel.stages.some((s) => s.value > 0);

  return (
    <div>
      <PageHeader title="Analytics & Funnels" />

      {/* Funnel */}
      <motion.div className="card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: "24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "16px" }}>
          Full Funnel Report
        </div>
        {hasFunnelData ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {funnel.stages.map((stage, i) => (
              <div key={stage.name} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-outfit)", fontSize: "24px", fontWeight: 700, color: "var(--text-primary)" }}>
                    {stage.value.toLocaleString()}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {stage.name}
                  </div>
                </div>
                {i < funnel.stages.length - 1 && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--mint)", padding: "0 4px" }}>
                    {funnel.stages[i + 1].conversionRate.toFixed(1)}% &rarr;
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-inter)", fontSize: "13px" }}>
            Funnel data will appear once ad and signup metrics are available
          </div>
        )}
      </motion.div>

      {/* Channel comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
        <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} style={{ padding: "20px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            Channel Performance
          </div>
          {deltas.length > 0 ? (
            <BarChartCard
              data={deltas.map((d) => ({ name: d.channel, value: d.current }))}
              dataKey="value"
              height={200}
              color="var(--mint)"
            />
          ) : (
            <div className="empty-state" style={{ minHeight: "200px" }}>Need at least 2 snapshots for comparison</div>
          )}
        </motion.div>
        <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} style={{ padding: "20px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            Week-over-Week Change
          </div>
          {deltas.length > 0 ? (
            <BarChartCard
              data={deltas.map((d) => ({ name: d.channel, value: Math.round(d.deltaPercent * 10) / 10 }))}
              dataKey="value"
              height={200}
              color="var(--turquoise)"
            />
          ) : (
            <div className="empty-state" style={{ minHeight: "200px" }}>Need at least 2 snapshots</div>
          )}
        </motion.div>
      </div>

      {/* Deltas table */}
      <div style={{ marginTop: "24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
          Week-over-Week Deltas
        </div>
        <DataTable
          columns={[
            { key: "channel", label: "Channel" },
            { key: "metric", label: "Metric" },
            { key: "current", label: "This Week", mono: true },
            { key: "previous", label: "Last Week", mono: true },
            {
              key: "deltaPercent",
              label: "\u0394",
              mono: true,
              render: (value) => {
                const v = value as number;
                const color = v >= 0 ? "var(--mint)" : "var(--red)";
                return (
                  <span style={{ color }}>
                    {v >= 0 ? "+" : ""}{v.toFixed(1)}%
                  </span>
                );
              },
            },
          ]}
          data={deltas.map((d) => ({ ...d } as Record<string, unknown>))}
          emptyMessage="Need at least 2 metric snapshots for delta analysis"
        />
      </div>
    </div>
  );
}
