"use client";

import { useState, useCallback } from "react";
import PageHeader from "@/components/page-header";
import KanbanBoard from "@/components/kanban-board";
import { moveCardAction } from "@/app/actions";
import type { BoardData, Column, Channel, CardType } from "@/lib/types";

interface KanbanClientProps {
  board: BoardData;
  project: string;
}

export default function KanbanClient({ board, project }: KanbanClientProps) {
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const handleMoveCard = useCallback(
    (cardId: string, fromColumn: Column, toColumn: Column) => {
      moveCardAction(project, cardId, fromColumn, toColumn);
    },
    [project]
  );

  // Apply filters
  const filteredBoard: BoardData = {
    columns: {
      backlog: board.columns.backlog.filter(
        (c) => (channelFilter === "all" || c.channel === channelFilter) && (typeFilter === "all" || c.type === typeFilter)
      ),
      preparing: board.columns.preparing.filter(
        (c) => (channelFilter === "all" || c.channel === channelFilter) && (typeFilter === "all" || c.type === typeFilter)
      ),
      live: board.columns.live.filter(
        (c) => (channelFilter === "all" || c.channel === channelFilter) && (typeFilter === "all" || c.type === typeFilter)
      ),
      measuring: board.columns.measuring.filter(
        (c) => (channelFilter === "all" || c.channel === channelFilter) && (typeFilter === "all" || c.type === typeFilter)
      ),
      done: board.columns.done.filter(
        (c) => (channelFilter === "all" || c.channel === channelFilter) && (typeFilter === "all" || c.type === typeFilter)
      ),
    },
  };

  const channels: (Channel | "all")[] = ["all", "reddit", "linkedin", "seo", "meta", "google", "ugc", "other"];
  const types: (CardType | "all")[] = ["all", "ad", "post", "outreach", "seo", "initiative", "ugc"];

  const selectStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    color: "var(--mint)",
    backgroundColor: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "6px 12px",
    outline: "none",
    cursor: "pointer",
    textTransform: "uppercase",
    appearance: "none",
    WebkitAppearance: "none",
  };

  return (
    <div>
      <PageHeader
        title="Kanban Board"
        actions={
          <div style={{ display: "flex", gap: "8px" }}>
            <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} style={selectStyle}>
              {channels.map((ch) => (
                <option key={ch} value={ch}>
                  {ch === "all" ? "All Channels" : ch.toUpperCase()}
                </option>
              ))}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t === "all" ? "All Types" : t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div style={{ minHeight: "calc(100vh - 120px)" }}>
        <KanbanBoard board={filteredBoard} project={project} onMoveCard={handleMoveCard} />
      </div>
    </div>
  );
}
