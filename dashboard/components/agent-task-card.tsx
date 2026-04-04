"use client";

import type { AgentTaskData } from "@/lib/types";

const priorityColorMap: Record<AgentTaskData["priority"], string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#3b82f6",
  low: "#6b7280",
};

interface AgentTaskCardProps {
  task: AgentTaskData;
  onClick?: () => void;
}

export default function AgentTaskCard({ task, onClick }: AgentTaskCardProps) {
  const borderColor = priorityColorMap[task.priority];

  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        padding: "12px",
        marginBottom: "8px",
        borderLeft: `3px solid ${borderColor}`,
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
        <span
          style={{
            textTransform: "uppercase",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.05em",
            background: borderColor,
            padding: "1px 6px",
            borderRadius: "4px",
            color: "#fff",
          }}
        >
          {task.priority}
        </span>

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
          <span
            style={{
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.05em",
              background: "#ef4444",
              padding: "1px 6px",
              borderRadius: "4px",
              color: "#fff",
            }}
          >
            ERR {task.retries > 0 ? `(${task.retries})` : ""}
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
