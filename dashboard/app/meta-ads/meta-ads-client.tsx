"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "@/components/page-header";
import MetricCard from "@/components/charts/metric-card";
import LineChartCard from "@/components/charts/line-chart";
import AreaChartCard from "@/components/charts/area-chart";
import DataTable from "@/components/charts/data-table";
import CardDetailModal from "@/components/card-detail-modal";
import type { CardData } from "@/lib/types";

interface MetaAdsClientProps {
  metrics: Record<string, number | null>;
  updatedAt: string;
  chartData: Record<string, unknown>[];
  adCards: CardData[];
}

function fmt(v: number | null, prefix = ""): string {
  if (v == null) return "--";
  return prefix + v.toLocaleString();
}

export default function MetaAdsClient({ metrics, updatedAt, chartData, adCards }: MetaAdsClientProps) {
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const isEmpty = Object.values(metrics).every((v) => v == null || v === 0);

  return (
    <div>
      <PageHeader title="Meta Ads" subtitle={updatedAt ? `Last updated ${updatedAt}` : "Facebook / Instagram"} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        <MetricCard label="Spend" value={fmt(metrics.meta_ad_spend ?? null, "$")} index={0} />
        <MetricCard label="Impressions" value={metrics.meta_ad_impressions ?? 0} index={1} />
        <MetricCard label="Conversions" value={metrics.meta_ad_conversions ?? 0} index={2} />
        <MetricCard label="CPA" value={metrics.meta_ad_cpa != null ? `$${Number(metrics.meta_ad_cpa).toFixed(2)}` : "--"} index={3} />
      </div>

      {!isEmpty && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "24px" }}>
            <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "20px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
                Spend vs Conversions
              </div>
              <LineChartCard
                data={chartData}
                series={[
                  { dataKey: "meta_ad_spend", color: "var(--channel-meta)", name: "Spend" },
                  { dataKey: "meta_ad_conversions", color: "var(--mint)", name: "Conversions" },
                ]}
                height={200}
                showLegend
              />
            </motion.div>
            <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} style={{ padding: "20px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
                CPM / CPA Trend
              </div>
              <LineChartCard
                data={chartData}
                series={[
                  { dataKey: "meta_ad_cpa", color: "var(--amber)", name: "CPA" },
                  { dataKey: "meta_ad_cpm", color: "var(--turquoise)", name: "CPM" },
                ]}
                height={200}
                showLegend
                yFormatter={(v) => `$${v}`}
              />
            </motion.div>
          </div>

          <div style={{ marginTop: "16px" }}>
            <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} style={{ padding: "20px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
                Impressions Trend
              </div>
              <AreaChartCard data={chartData} dataKey="meta_ad_impressions" height={180} color="var(--channel-meta)" />
            </motion.div>
          </div>
        </>
      )}

      {adCards.length > 0 && (
        <div style={{ marginTop: "24px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            Meta Ads Kanban Cards
          </div>
          <DataTable
            columns={[
              { key: "title", label: "Title" },
              { key: "column", label: "Status", mono: true },
              { key: "type", label: "Type", mono: true },
              { key: "target_date", label: "Target", mono: true },
            ]}
            data={adCards.map((c) => ({ title: c.title, column: c.column.toUpperCase(), type: c.type, target_date: c.target_date ?? "--" }))}
            onRowClick={(_row, idx) => setSelectedCard(adCards[idx])}
          />
        </div>
      )}

      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />

      {isEmpty && !adCards.length && (
        <div className="empty-state" style={{ marginTop: "24px" }}>
          <div style={{ fontSize: "16px" }}>Meta Ads not running yet</div>
          <div className="empty-state-hint">Connect Meta Ads in config.yaml to see campaign data</div>
        </div>
      )}
    </div>
  );
}
