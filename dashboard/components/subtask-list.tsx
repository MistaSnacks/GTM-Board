"use client";

import { useState, useTransition } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DroppableProvided,
  type DraggableProvided,
} from "@hello-pangea/dnd";
import {
  addSubtaskAction,
  updateSubtaskAction,
  deleteSubtaskAction,
  reorderSubtasksAction,
} from "@/app/actions";
import type { SubtaskData, SubtaskStatus } from "@/lib/types";

interface SubtaskListProps {
  project: string;
  cardSlug: string;
  initialSubtasks: SubtaskData[];
}

const STATUS_OPTIONS: { value: SubtaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

export default function SubtaskList({ project, cardSlug, initialSubtasks }: SubtaskListProps) {
  const [subtasks, setSubtasks] = useState<SubtaskData[]>(initialSubtasks);
  const [newTitle, setNewTitle] = useState("");
  const [, startTransition] = useTransition();

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    const created = await addSubtaskAction(project, cardSlug, title);
    if (created) setSubtasks((prev) => [...prev, created]);
  };

  const handleUpdate = (id: string, patch: Partial<Pick<SubtaskData, "title" | "status" | "assignee">>) => {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    startTransition(() => {
      updateSubtaskAction(id, patch);
    });
  };

  const handleDelete = (id: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
    startTransition(() => {
      deleteSubtaskAction(id);
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(subtasks);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setSubtasks(reordered);
    startTransition(() => {
      reorderSubtasksAction(project, cardSlug, reordered.map((s) => s.id));
    });
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: "8px",
  };

  return (
    <div style={{ marginTop: "16px" }}>
      <div style={labelStyle}>Subtasks</div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="subtasks">
          {(dropProvided: DroppableProvided) => (
            <div ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
              {subtasks.map((subtask, index) => (
                <Draggable draggableId={subtask.id} index={index} key={subtask.id}>
                  {(dragProvided: DraggableProvided) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      style={{
                        ...dragProvided.draggableProps.style,
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px 8px",
                        marginBottom: "4px",
                        background: "var(--bg-card-raised)",
                        borderRadius: "6px",
                      }}
                    >
                      <span
                        {...dragProvided.dragHandleProps}
                        style={{
                          cursor: "grab",
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          userSelect: "none",
                        }}
                        aria-label="Drag to reorder"
                      >
                        ⋮⋮
                      </span>
                      <select
                        value={subtask.status}
                        onChange={(e) => handleUpdate(subtask.id, { status: e.target.value as SubtaskStatus })}
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          background: "var(--bg-card)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          padding: "2px 4px",
                        }}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={subtask.title}
                        onChange={(e) => setSubtasks((prev) => prev.map((s) => (s.id === subtask.id ? { ...s, title: e.target.value } : s)))}
                        onBlur={(e) => handleUpdate(subtask.id, { title: e.target.value })}
                        style={{
                          flex: 1,
                          background: "transparent",
                          border: "none",
                          outline: "none",
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-inter)",
                          fontSize: "13px",
                          textDecoration: subtask.status === "done" ? "line-through" : "none",
                          opacity: subtask.status === "done" ? 0.6 : 1,
                        }}
                      />
                      <input
                        type="text"
                        value={subtask.assignee ?? ""}
                        placeholder="assignee"
                        onChange={(e) => setSubtasks((prev) => prev.map((s) => (s.id === subtask.id ? { ...s, assignee: e.target.value } : s)))}
                        onBlur={(e) => handleUpdate(subtask.id, { assignee: e.target.value || null })}
                        style={{
                          width: "90px",
                          background: "transparent",
                          border: "none",
                          outline: "none",
                          color: "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                        }}
                      />
                      <button
                        onClick={() => handleDelete(subtask.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: "14px",
                        }}
                        aria-label="Delete subtask"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add new subtask */}
      <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
        <input
          type="text"
          value={newTitle}
          placeholder="Add a subtask..."
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          style={{
            flex: 1,
            padding: "6px 8px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-inter)",
            fontSize: "13px",
          }}
        />
        <button
          onClick={handleAdd}
          style={{
            padding: "6px 12px",
            background: "var(--mint)",
            color: "var(--bg-card)",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 600,
          }}
        >
          ADD
        </button>
      </div>
    </div>
  );
}
