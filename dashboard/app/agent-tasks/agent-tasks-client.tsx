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
import CardDetailModal from "@/components/card-detail-modal";
import { moveAgentTaskAction } from "@/app/actions";
import type { AgentBoardData, AgentTaskColumn, AgentTaskData, CardData } from "@/lib/types";

const COLUMNS: { id: AgentTaskColumn; label: string; cloth: string }[] = [
  { id: "queued", label: "QUEUED", cloth: "tan" },
  { id: "in_progress", label: "IN PROGRESS", cloth: "mustard" },
  { id: "blocked", label: "BLOCKED", cloth: "scarlet" },
  { id: "review", label: "REVIEW", cloth: "denim" },
  { id: "done", label: "DONE", cloth: "olive" },
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
  const [selectedTask, setSelectedTask] = useState<AgentTaskData | null>(null);

  // Convert an AgentTaskData to a minimal CardData shape so it can render
  // in the shared modal. The agent-task-specific metadata is passed via the
  // `agentTask` prop.
  const selectedAsCard: CardData | null = selectedTask
    ? {
        id: selectedTask.id,
        title: selectedTask.title,
        type: "initiative",
        channel: "other",
        column: "backlog",
        created: selectedTask.created_at,
        description: undefined,
        tags: selectedTask.tags,
        body: selectedTask.body,
        references: selectedTask.references,
        progress: selectedTask.progress,
      }
    : null;

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


  // Pre-mount: static columns without DnD
  if (!mounted) {
    return (
      <div>
        <PageHeader title="Agent Tasks" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px" }}>
          {COLUMNS.map((col) => (
            <div key={col.id} className="kanban-column" style={{ padding: "12px", minHeight: 200 }}>
              <ColumnHeader label={col.label} cloth={col.cloth} count={filteredBoard.columns[col.id]?.length ?? 0} />
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
              className="pill pill-tan"
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
              className="pill pill-tan"
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
                    <ColumnHeader label={col.label} cloth={col.cloth} count={tasks.length} />
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
                            <AgentTaskCard task={task} onClick={() => setSelectedTask(task)} />
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
      <CardDetailModal
        card={selectedAsCard}
        agentTask={selectedTask}
        project={project}
        onClose={() => setSelectedTask(null)}
      />
    </div>
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
