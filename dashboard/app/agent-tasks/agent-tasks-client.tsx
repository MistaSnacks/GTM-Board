"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DroppableProvided,
  type DraggableProvided,
  type DraggableStateSnapshot,
} from "@hello-pangea/dnd";
import PageHeader from "@/components/page-header";
import AgentTaskCard from "@/components/agent-task-card";
import { moveAgentTaskAction } from "@/app/actions";
import type { AgentBoardData, AgentTaskColumn, AgentTaskData } from "@/lib/types";

const COLUMNS: { id: AgentTaskColumn; label: string }[] = [
  { id: "queued", label: "QUEUED" },
  { id: "in_progress", label: "IN PROGRESS" },
  { id: "blocked", label: "BLOCKED" },
  { id: "review", label: "REVIEW" },
  { id: "done", label: "DONE" },
];

interface AgentTasksClientProps {
  board: AgentBoardData;
  project: string;
}

export default function AgentTasksClient({ board, project }: AgentTasksClientProps) {
  const [mounted, setMounted] = useState(false);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [optimisticBoard, setOptimisticBoard] = useState<AgentBoardData>(board);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOptimisticBoard(board);
  }, [board]);

  // Collect unique agents for filter dropdown
  const allTasks = Object.values(optimisticBoard.columns).flat();
  const agents: string[] = Array.from(
    new Set(allTasks.map((t) => t.assigned_agent).filter(Boolean) as string[])
  ).sort();

  const priorities: AgentTaskData["priority"][] = ["critical", "high", "medium", "low"];

  // Apply filters
  const filterTask = (task: AgentTaskData): boolean => {
    if (agentFilter !== "all" && task.assigned_agent !== agentFilter) return false;
    if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
    return true;
  };

  const filteredBoard: AgentBoardData = {
    columns: Object.fromEntries(
      COLUMNS.map((col) => [col.id, (optimisticBoard.columns[col.id] ?? []).filter(filterTask)])
    ) as Record<AgentTaskColumn, AgentTaskData[]>,
  };

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { draggableId, source, destination } = result;
      if (!destination) return;
      if (source.droppableId === destination.droppableId && source.index === destination.index)
        return;

      const fromCol = source.droppableId as AgentTaskColumn;
      const toCol = destination.droppableId as AgentTaskColumn;

      // Optimistic update
      setOptimisticBoard((prev) => {
        const next = { columns: { ...prev.columns } };
        const fromTasks = [...(next.columns[fromCol] ?? [])];
        const taskIndex = fromTasks.findIndex((t) => t.id === draggableId);
        if (taskIndex === -1) return prev;

        const [moved] = fromTasks.splice(taskIndex, 1);
        const updated = { ...moved, column: toCol };
        next.columns[fromCol] = fromTasks;

        const toTasks = [...(next.columns[toCol] ?? [])];
        toTasks.splice(destination.index, 0, updated);
        next.columns[toCol] = toTasks;

        return next;
      });

      moveAgentTaskAction(project, draggableId, fromCol, toCol);
    },
    [project]
  );

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

  // Pre-mount: static columns without DnD
  if (!mounted) {
    return (
      <div>
        <PageHeader title="Agent Tasks" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px" }}>
          {COLUMNS.map((col) => (
            <div key={col.id} className="kanban-column" style={{ padding: "12px", minHeight: 200 }}>
              <ColumnHeader label={col.label} count={filteredBoard.columns[col.id]?.length ?? 0} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Agent Tasks"
        actions={
          <div style={{ display: "flex", gap: "8px" }}>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All Agents</option>
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a.toUpperCase()}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All Priorities</option>
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px" }}>
          {COLUMNS.map((col) => {
            const tasks = filteredBoard.columns[col.id] ?? [];
            return (
              <Droppable droppableId={col.id} key={col.id}>
                {(provided: DroppableProvided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="kanban-column"
                    style={{ padding: "12px", minHeight: 200 }}
                  >
                    <ColumnHeader label={col.label} count={tasks.length} />
                    {tasks.map((task, idx) => (
                      <Draggable draggableId={task.id} index={idx} key={task.id}>
                        {(dragProvided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={{
                              ...dragProvided.draggableProps.style,
                              opacity: snapshot.isDragging ? 0.85 : 1,
                            }}
                          >
                            <AgentTaskCard task={task} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
    </div>
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
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: count > 0 ? "var(--mint)" : "var(--text-muted)",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          textTransform: "uppercase",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          background: "var(--mint)",
          borderRadius: "9999px",
          padding: "2px 8px",
          color: "var(--bg-card)",
          fontWeight: 600,
        }}
      >
        {count}
      </span>
    </div>
  );
}
