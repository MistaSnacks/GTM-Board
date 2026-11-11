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

/** Done is olive felt, missed is scarlet, still to come is cream. */
function dayCloth(day: CadenceDay): string {
  if (day.done) return "olive";

  // Determine if the day is in the past (missed) by comparing day labels
  const today = new Date();
  const dayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(day.day);
  const currentDayIndex = (today.getDay() + 6) % 7; // Convert Sun=0 to Mon=0 based

  const isPast = dayIndex >= 0 && dayIndex < currentDayIndex;

  return isPast ? "scarlet" : "cream";
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
            className={`felt-tile felt-tile--${dayCloth(day)}`}
            style={{ width: "28px", height: "28px", fontFamily: "var(--font-mono)", fontSize: "10px", cursor: "default" }}
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
