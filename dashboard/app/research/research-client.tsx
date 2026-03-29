"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "@/components/page-header";
import DataTable from "@/components/charts/data-table";
import CardDetailModal from "@/components/card-detail-modal";
import type { ResearchEntry, CardData } from "@/lib/types";

interface ResearchClientProps {
  research: ResearchEntry[];
  researchCards: CardData[];
}

export default function ResearchClient({ research, researchCards }: ResearchClientProps) {
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = research[selectedIndex];

  return (
    <div>
      <PageHeader title="Research & Intelligence" />

      {research.length > 0 ? (
        <>
          {/* Research runs table */}
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
              Research Runs
            </div>
            <DataTable
              columns={[
                { key: "date", label: "Date", mono: true },
                { key: "findingsCount", label: "Findings", mono: true },
                { key: "cardsCreated", label: "Cards Created", mono: true },
                {
                  key: "date",
                  label: "",
                  sortable: false,
                  render: (_value, row) => (
                    <button
                      onClick={() => {
                        const idx = research.findIndex((r) => r.date === row.date);
                        if (idx >= 0) setSelectedIndex(idx);
                      }}
                      style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        padding: "2px 8px",
                        cursor: "pointer",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        color: "var(--mint)",
                      }}
                    >
                      VIEW
                    </button>
                  ),
                },
              ]}
              data={research.map((r) => ({ date: r.date, findingsCount: r.findingsCount, cardsCreated: r.cardsCreated }))}
            />
          </div>

          {/* Selected research detail */}
          {selected && (
            <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "20px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
                Research Detail — {selected.date}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-inter)",
                  fontSize: "13px",
                  lineHeight: "20px",
                  color: "var(--text-primary)",
                  whiteSpace: "pre-wrap",
                  maxHeight: "400px",
                  overflowY: "auto",
                }}
              >
                {selected.content || "No content available"}
              </div>
            </motion.div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <div style={{ fontSize: "16px" }}>No research runs yet</div>
          <div className="empty-state-hint">Run gtm_research_run to generate market intelligence</div>
        </div>
      )}

      {/* Research-sourced cards */}
      {researchCards.length > 0 && (
        <div style={{ marginTop: "24px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
            Research-sourced Kanban Cards
          </div>
          <DataTable
            columns={[
              { key: "title", label: "Title" },
              { key: "channel", label: "Channel", mono: true },
              { key: "column", label: "Status", mono: true },
              { key: "created", label: "Created", mono: true },
            ]}
            data={researchCards.map((c) => ({ title: c.title, channel: c.channel.toUpperCase(), column: c.column.toUpperCase(), created: c.created }))}
            onRowClick={(_row, idx) => setSelectedCard(researchCards[idx])}
          />
        </div>
      )}

      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
    </div>
  );
}
