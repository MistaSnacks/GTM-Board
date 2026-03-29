"use client";

import type { StatusLevel } from "@/lib/types";

interface StatusBadgeProps {
  status: StatusLevel;
  label?: string;
}

const badgeClassMap: Record<StatusLevel, string> = {
  active: "badge badge-active",
  critical: "badge badge-critical",
  pending: "badge badge-pending",
  stable: "badge badge-stable",
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const displayLabel = label ?? status.toUpperCase();
  const className = badgeClassMap[status];

  return (
    <span className={className}>
      {status === "critical" && (
        <span
          className="animate-pulse"
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "var(--red)",
            flexShrink: 0,
          }}
        />
      )}
      {status === "active" && (
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "var(--mint)",
            flexShrink: 0,
          }}
        />
      )}
      {displayLabel}
    </span>
  );
}
