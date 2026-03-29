"use client";

import { useState } from "react";
import PageHeader from "@/components/page-header";
import MetricCard from "@/components/charts/metric-card";
import DataTable from "@/components/charts/data-table";
import CardDetailModal from "@/components/card-detail-modal";
import type { CardData } from "@/lib/types";

interface BacklinksClientProps {
  cards: CardData[];
}

export default function BacklinksClient({ cards }: BacklinksClientProps) {
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const liveCount = cards.filter((c) => c.column === "live" || c.column === "done").length;

  return (
    <div>
      <PageHeader title="Backlinks" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        <MetricCard label="Total Backlinks" value="--" index={0} />
        <MetricCard label="Referring Domains" value="--" index={1} />
        <MetricCard label="Domain Authority" value="--" index={2} />
        <MetricCard label="Outreach Pipeline" value={cards.length} index={3} />
      </div>

      {/* Growth chart placeholder */}
      <div className="empty-state" style={{ marginTop: "24px" }}>
        <div style={{ fontSize: "16px" }}>Backlink tracking coming soon</div>
        <div className="empty-state-hint">Connect a backlink data source (Ahrefs, Moz) or add manually via MCP tools</div>
      </div>

      {/* Link building pipeline */}
      {cards.length > 0 && (
        <div style={{ marginTop: "24px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            Link Building Pipeline
          </div>
          <DataTable
            columns={[
              { key: "title", label: "Target Site" },
              { key: "column", label: "Status", mono: true },
              { key: "type", label: "Type", mono: true },
              { key: "target_date", label: "Date", mono: true },
            ]}
            data={cards.map((c) => ({
              title: c.title,
              column: c.column.toUpperCase(),
              type: c.type,
              target_date: c.target_date ?? c.created,
            }))}
            onRowClick={(_row, idx) => setSelectedCard(cards[idx])}
          />
        </div>
      )}

      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />

      {cards.length === 0 && (
        <div
          className="card"
          style={{
            marginTop: "24px",
            padding: "20px",
            borderStyle: "dashed",
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: "var(--font-inter)", fontSize: "13px", color: "var(--text-muted)" }}>
            Add backlinks manually via <code style={{ fontFamily: "var(--font-mono)", color: "var(--mint)" }}>gtm_update_card</code> with metrics: {"{"} backlinks: N, referring_domains: N {"}"}
          </div>
        </div>
      )}
    </div>
  );
}
