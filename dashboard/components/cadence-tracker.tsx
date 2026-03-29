"use client";

import type { CadenceDay } from "@/lib/types";

interface CadenceTrackerProps {
  linkedinPosts: CadenceDay[];
  linkedinPostsDone: number;
  linkedinPostsTarget: number;
  linkedinCommentsDone: number;
  linkedinCommentsTarget: number;
  redditCommentsDone: number;
  redditCommentsTarget: number;
}

function getDotStyle(day: CadenceDay): React.CSSProperties {
  if (day.done) {
    return {
      backgroundColor: "color-mix(in srgb, var(--mint) 20%, transparent)",
      border: "1px solid var(--mint)",
      color: "var(--mint)",
    };
  }

  // Determine if the day is in the past (missed) by comparing day labels
  const today = new Date();
  const dayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(day.day);
  const currentDayIndex = (today.getDay() + 6) % 7; // Convert Sun=0 to Mon=0 based

  const isPast = dayIndex >= 0 && dayIndex < currentDayIndex;

  if (isPast) {
    return {
      backgroundColor: "color-mix(in srgb, var(--red) 20%, transparent)",
      border: "1px solid var(--red)",
      color: "var(--red)",
    };
  }

  return {
    backgroundColor: "var(--bg-card-raised)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
  };
}

function CountSpan({ done, target }: { done: number; target: number }) {
  const atTarget = done >= target;
  return (
    <span style={{ color: atTarget ? "var(--mint)" : "var(--red)" }}>
      {done}/{target}
    </span>
  );
}

export default function CadenceTracker({
  linkedinPosts,
  linkedinPostsDone,
  linkedinPostsTarget,
  linkedinCommentsDone,
  linkedinCommentsTarget,
  redditCommentsDone,
  redditCommentsTarget,
}: CadenceTrackerProps) {
  return (
    <div>
      {/* Day dots */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        {linkedinPosts.map((day, index) => (
          <div
            key={`${day.day}-${index}`}
            title={`${day.day}: ${day.type}`}
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 600,
              cursor: "default",
              flexShrink: 0,
              ...getDotStyle(day),
            }}
          >
            {day.day.slice(0, 2)}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "var(--text-muted)",
          marginTop: "12px",
        }}
      >
        <CountSpan done={linkedinPostsDone} target={linkedinPostsTarget} /> posts
        {" \u2022 "}
        <CountSpan done={linkedinCommentsDone} target={linkedinCommentsTarget} /> LI comments
        {" \u2022 "}
        <CountSpan done={redditCommentsDone} target={redditCommentsTarget} /> reddit comments
      </div>
    </div>
  );
}
