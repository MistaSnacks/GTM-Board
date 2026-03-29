"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "@/components/page-header";
import MetricCard from "@/components/charts/metric-card";
import AreaChartCard from "@/components/charts/area-chart";
import DataTable from "@/components/charts/data-table";
import CardDetailModal from "@/components/card-detail-modal";
import type { CardData } from "@/lib/types";

interface SEOClientProps {
  metrics: Record<string, number | null>;
  updatedAt: string;
  chartData: Record<string, unknown>[];
  seoCards: CardData[];
}

export default function SEOClient({ metrics, updatedAt, chartData, seoCards }: SEOClientProps) {
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const metricCards = [
    { label: "Organic Clicks", value: metrics.organic_clicks ?? 0 },
    { label: "Branded Search Vol", value: metrics.branded_search_volume ?? 0 },
    { label: "Avg Position", value: metrics.avg_position != null ? Number(metrics.avg_position.toFixed(1)) : 0, suffix: "" },
    { label: "Total Impressions", value: metrics.total_impressions ?? 0 },
  ];

  return (
    <div>
      <PageHeader title="SEO & Organic Search" subtitle={updatedAt ? `Last updated ${updatedAt}` : undefined} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        {metricCards.map((m, i) => (
          <MetricCard key={m.label} label={m.label} value={m.value} index={i} suffix={m.suffix} />
        ))}
      </div>

      <div style={{ marginTop: "24px" }}>
        <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "20px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            Organic Traffic Trend
          </div>
          <AreaChartCard data={chartData} dataKey="organic_clicks" height={220} color="var(--channel-seo)" />
        </motion.div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
        <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} style={{ padding: "20px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            Branded Search Trend
          </div>
          <AreaChartCard data={chartData} dataKey="branded_search_volume" height={180} color="var(--turquoise)" />
        </motion.div>
        <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} style={{ padding: "20px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            Avg Position Trend
          </div>
          <AreaChartCard data={chartData} dataKey="avg_position" height={180} color="var(--amber)" />
        </motion.div>
      </div>

      {seoCards.length > 0 && (
        <div style={{ marginTop: "24px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            SEO Kanban Cards
          </div>
          <DataTable
            columns={[
              { key: "title", label: "Title" },
              { key: "column", label: "Status", mono: true },
              { key: "target_date", label: "Target", mono: true },
              { key: "type", label: "Type", mono: true },
            ]}
            data={seoCards.map((c) => ({ title: c.title, column: c.column.toUpperCase(), target_date: c.target_date ?? "--", type: c.type }))}
            onRowClick={(_row, idx) => setSelectedCard(seoCards[idx])}
          />
        </div>
      )}

      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />

      {!chartData.length && Object.values(metrics).every((v) => v == null || v === 0) && (
        <div className="empty-state" style={{ marginTop: "24px" }}>
          <div style={{ fontSize: "16px" }}>No SEO data yet</div>
          <div className="empty-state-hint">Connect Google Search Console to see organic metrics</div>
        </div>
      )}
    </div>
  );
}
