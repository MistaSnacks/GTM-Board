"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  DragDropContext,
  Droppable,
  type DropResult,
  type DroppableProvided,
} from "@hello-pangea/dnd";
import type { BoardData, CardData, Column } from "@/lib/types";
import KanbanCard from "./kanban-card";
import CardDetailModal from "./card-detail-modal";

const COLUMNS: { key: Column; label: string }[] = [
  { key: "backlog", label: "BACKLOG" },
  { key: "preparing", label: "PREPARING" },
  { key: "live", label: "LIVE" },
  { key: "measuring", label: "MEASURING" },
  { key: "done", label: "DONE" },
];

interface KanbanBoardProps {
  board: BoardData;
  project: string;
  onMoveCard: (cardId: string, fromColumn: Column, toColumn: Column) => void;
}

export default function KanbanBoard({ board, project, onMoveCard }: KanbanBoardProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { draggableId, source, destination } = result;
      if (!destination) return;
      if (source.droppableId === destination.droppableId && source.index === destination.index)
        return;

      onMoveCard(
        draggableId,
        source.droppableId as Column,
        destination.droppableId as Column
      );
    },
    [onMoveCard]
  );

  if (!mounted) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "12px",
        }}
      >
        {COLUMNS.map((col) => (
          <div key={col.key} className="kanban-column" style={{ padding: "12px", minHeight: 200 }}>
            <ColumnHeader label={col.label} count={board.columns[col.key]?.length ?? 0} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "12px",
        }}
      >
        {COLUMNS.map((col) => {
          const cards = board.columns[col.key] ?? [];
          return (
            <Droppable droppableId={col.key} key={col.key}>
              {(provided: DroppableProvided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="kanban-column"
                  style={{ padding: "12px", minHeight: 200 }}
                >
                  <ColumnHeader label={col.label} count={cards.length} />
                  {cards.map((card, idx) => (
                    <KanbanCard key={card.id} card={card} index={idx} onCardClick={setSelectedCard} />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
    </DragDropContext>
  );
}

function ColumnHeader({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "12px",
      }}
    >
      {/* Status dot */}
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: count > 0 ? "var(--mint)" : "var(--text-muted)",
          flexShrink: 0,
        }}
      />
      {/* Column name */}
      <span
        style={{
          textTransform: "uppercase",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
        }}
      >
        {label}
      </span>
      {/* Count badge */}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          background: "var(--bg-card-raised)",
          borderRadius: "9999px",
          padding: "2px 8px",
          color: "var(--text-muted)",
        }}
      >
        {count}
      </span>
    </div>
  );
}
