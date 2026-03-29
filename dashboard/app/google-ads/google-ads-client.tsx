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

interface GoogleAdsClientProps {
  metrics: Record<string, number | null>;
  updatedAt: string;
  chartData: Record<string, unknown>[];
  adCards: CardData[];
}

function fmt(v: number | null, prefix = ""): string {
  if (v == null) return "--";
  return prefix + v.toLocaleString();
}

export default function GoogleAdsClient({ metrics, updatedAt, chartData, adCards }: GoogleAdsClientProps) {
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const isEmpty = Object.values(metrics).every((v) => v == null || v === 0);

  return (
    <div>
      <PageHeader title="Google Ads" subtitle={updatedAt ? `Last updated ${updatedAt}` : undefined} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        <MetricCard label="Spend" value={fmt(metrics.google_ad_spend ?? null, "$")} index={0} />
        <MetricCard label="Clicks" value={metrics.google_ad_clicks ?? 0} index={1} />
        <MetricCard label="Conversions" value={metrics.google_ad_conversions ?? 0} index={2} />
        <MetricCard label="CPA" value={metrics.google_ad_cpa != null ? `$${Number(metrics.google_ad_cpa).toFixed(2)}` : "--"} index={3} />
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
                  { dataKey: "google_ad_spend", color: "var(--channel-google)", name: "Spend" },
                  { dataKey: "google_ad_conversions", color: "var(--mint)", name: "Conversions" },
                ]}
                height={200}
                showLegend
              />
            </motion.div>
            <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} style={{ padding: "20px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
                CPA Trend
              </div>
              <LineChartCard
                data={chartData}
                series={[{ dataKey: "google_ad_cpa", color: "var(--amber)", name: "CPA" }]}
                height={200}
                yFormatter={(v) => `$${v}`}
              />
            </motion.div>
          </div>

          <div style={{ marginTop: "16px" }}>
            <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} style={{ padding: "20px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
                Click-Through Rate Trend
              </div>
              <AreaChartCard data={chartData} dataKey="google_ad_ctr" height={180} color="var(--channel-google)" />
            </motion.div>
          </div>
        </>
      )}

      {adCards.length > 0 && (
        <div style={{ marginTop: "24px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            Google Ads Kanban Cards
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
          <div style={{ fontSize: "16px" }}>Google Ads not running yet</div>
          <div className="empty-state-hint">Connect Google Ads in config.yaml to see campaign data</div>
        </div>
      )}
    </div>
  );
}
