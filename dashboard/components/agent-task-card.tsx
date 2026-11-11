"use client";

import type { AgentTaskData } from "@/lib/types";

const priorityPiece: Record<AgentTaskData["priority"], { cloth: string; badge: string }> = {
  critical: { cloth: "", badge: "badge-critical" },
  high: { cloth: " cloth-mustard", badge: "badge-ink" },
  medium: { cloth: " cloth-denim", badge: "badge-stable" },
  low: { cloth: "", badge: "badge-stable" },
};

interface AgentTaskCardProps {
  task: AgentTaskData;
  onClick?: () => void;
}

export default function AgentTaskCard({ task, onClick }: AgentTaskCardProps) {

  return (
    <div
      className={`card piece-sm${priorityPiece[task.priority].cloth}`}
      onClick={onClick}
      style={{
        padding: "13px 14px",
        marginBottom: "8px",
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      {/* Title */}
      <div
        style={{
          fontFamily: "var(--font-inter)",
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--text-primary)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {task.title}
      </div>

      {/* Badges row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginTop: "6px",
          flexWrap: "wrap",
        }}
      >
        {/* Priority badge */}
        <span className={`badge ${priorityPiece[task.priority].badge}`}>{task.priority}</span>

        {/* Assigned agent badge */}
        {task.assigned_agent && (
          <span
            style={{
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.05em",
              background: "var(--mint)",
              padding: "1px 6px",
              borderRadius: "4px",
              color: "var(--bg-card)",
            }}
          >
            {task.assigned_agent}
          </span>
        )}

        {/* Error indicator */}
        {task.error && (
          <span className="badge badge-critical">
            ERR {task.retries > 0 ? `(${task.retries})` : ""}
          </span>
        )}

        {task.progress && (task.progress.checklist.total + task.progress.subtasks.total) > 0 && (
          <span
            style={{
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.05em",
              background: "color-mix(in srgb, var(--mint) 12%, transparent)",
              color: "var(--mint)",
              padding: "1px 6px",
              borderRadius: "4px",
            }}
            title="Checklist + subtasks"
          >
            ✓ {task.progress.checklist.done + task.progress.subtasks.done}/
            {task.progress.checklist.total + task.progress.subtasks.total}
          </span>
        )}
      </div>

      {/* Tags row */}
      {task.tags.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            marginTop: "6px",
            flexWrap: "wrap",
          }}
        >
          {task.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                background: "var(--bg-card-raised)",
                padding: "1px 6px",
                borderRadius: "4px",
                color: "var(--text-muted)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
