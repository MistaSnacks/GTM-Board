"use client";

import { useState } from "react";
import { itemAction } from "@/app/today/actions";
import type { Item, Priority } from "../../server/src/items/types.ts";
import { ageLabel, isOverdueAgentItem, PRIORITY_LABEL, safeHref, type ItemAction } from "@/lib/today";

const ACTIONS: { action: ItemAction; label: string; failed: string; primary?: boolean }[] = [
  { action: "done", label: "Done", failed: "mark done", primary: true },
  { action: "snooze-1d", label: "Snooze 1d", failed: "snooze" },
  { action: "snooze-1w", label: "Snooze 1w", failed: "snooze" },
  { action: "dismiss", label: "Dismiss", failed: "dismiss" },
];

const PRIORITY_STYLE: Record<Priority, { badge: string; accent: string }> = {
  0: { badge: "badge badge-critical", accent: "var(--red)" },
  1: { badge: "badge badge-pending", accent: "var(--amber)" },
  2: { badge: "badge badge-stable", accent: "var(--silver)" },
  3: { badge: "badge badge-stable", accent: "var(--text-muted)" },
};

const MAX_EVIDENCE = 4;

export default function TodayItemRow({ item, now, showProject }: { item: Item; now: Date; showProject: boolean }) {
  const [pending, setPending] = useState<ItemAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  if (gone) return null;

  async function run(action: ItemAction, failed: string) {
    setPending(action);
    setError(null);
    try {
      const result = await itemAction(item.id, action);
      if (result.ok) setGone(true);
      else setError(`Could not ${failed}: ${result.error}`);
    } catch (err) {
      setError(`Could not ${failed}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPending(null);
    }
  }

  const href = safeHref(item.link);
  const evidence = item.evidence.slice(0, MAX_EVIDENCE);
  const style = PRIORITY_STYLE[item.priority];
  const overdue = isOverdueAgentItem(item, now);

  return (
    <div className="card today-row" style={{ borderLeft: `3px solid ${style.accent}` }}>
      <div className="today-row-head">
        <span className={style.badge}>{PRIORITY_LABEL[item.priority]}</span>
        {showProject && <span className="today-chip">{item.project ?? "general"}</span>}
        {item.owner === "agent" && <span className="today-chip">agent</span>}
        {overdue && <span className="badge badge-critical">OVERDUE</span>}
        <span className="today-age" title={`Created ${item.created_at}`}>
          {ageLabel(item.created_at, now)}
        </span>
      </div>

      <div className="today-title">{item.title}</div>
      {item.why && <div className="today-why">{item.why}</div>}

      {evidence.length > 0 && (
        <div className="today-evidence">
          {evidence.map((e, idx) => {
            const text = e.value === undefined ? e.label : `${e.label}: ${e.value}`;
            const link = safeHref(e.url ?? null);
            return link ? (
              <a key={idx} href={link} target="_blank" rel="noreferrer" className="today-chip today-chip-link">
                {text}
              </a>
            ) : (
              <span key={idx} className="today-chip">
                {text}
              </span>
            );
          })}
          {item.evidence.length > MAX_EVIDENCE && <span className="today-chip">+{item.evidence.length - MAX_EVIDENCE} more</span>}
        </div>
      )}

      <div className="today-actions">
        {ACTIONS.map(({ action, label, failed, primary }) => (
          <button
            key={action}
            type="button"
            className={`today-btn${primary ? " today-btn-primary" : ""}`}
            disabled={pending !== null}
            onClick={() => run(action, failed)}
          >
            {pending === action ? "…" : label}
          </button>
        ))}
        {href && (
          <a className="today-btn today-btn-link" href={href} target="_blank" rel="noreferrer">
            Open link
          </a>
        )}
      </div>

      {error && (
        <div role="alert" className="today-error">
          {error}
        </div>
      )}
    </div>
  );
}
