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

const COLUMNS: { key: Column; label: string; cloth: string }[] = [
  { key: "backlog", label: "BACKLOG", cloth: "tan" },
  { key: "preparing", label: "PREPARING", cloth: "mustard" },
  { key: "live", label: "LIVE", cloth: "scarlet" },
  { key: "measuring", label: "MEASURING", cloth: "denim" },
  { key: "done", label: "DONE", cloth: "olive" },
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
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: "12px",
        }}
      >
        {COLUMNS.map((col) => (
          <div key={col.key} className="kanban-column" style={{ padding: "12px", minHeight: 200 }}>
            <ColumnHeader label={col.label} cloth={col.cloth} count={board.columns[col.key]?.length ?? 0} />
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
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
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
                  <ColumnHeader label={col.label} cloth={col.cloth} count={cards.length} />
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
      <CardDetailModal card={selectedCard} project={project} onClose={() => setSelectedCard(null)} />
    </DragDropContext>
  );
}

function ColumnHeader({ label, count, cloth }: { label: string; count: number; cloth: string }) {
  return (
    <div className={`pill pill-${cloth} column-head`}>
      {label}
      <span className="column-head__count">{count}</span>
    </div>
  );
}
