"use client";

import { useState } from "react";
import { delegateAction, itemAction, recallAction, type ActionResult } from "@/app/today/actions";
import type { Item, Priority, Runner } from "../../server/src/items/types.ts";
import { agentView, ageLabel, isOverdueAgentItem, PRIORITY_LABEL, safeHref, type ItemAction } from "@/lib/today";

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

type Pending = ItemAction | "send" | "recall";

export default function TodayItemRow({ item, now, runners, showProject }: { item: Item; now: Date; runners: Runner[] | null; showProject: boolean }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  if (gone) return null;

  /** `leaves` is true when the row goes away on success. Send and take back keep the row, and the page refresh moves it to its section. */
  async function run(key: Pending, failed: string, call: () => Promise<ActionResult>, leaves: boolean) {
    setPending(key);
    setError(null);
    try {
      const result = await call();
      if (result.ok) {
        if (leaves) setGone(true);
      } else setError(`Could not ${failed}: ${result.error}`);
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
  const agent = agentView(item, runners, now);

  return (
    <div className="card today-row" style={{ borderLeft: `3px solid ${style.accent}` }}>
      <div className="today-row-head">
        <span className={style.badge}>{PRIORITY_LABEL[item.priority]}</span>
        {agent.badge && <span className={agent.badge.className}>{agent.badge.text}</span>}
        {agent.sentAgo && <span className="today-chip">{agent.sentAgo}</span>}
        {showProject && <span className="today-chip">{item.project ?? "general"}</span>}
        {item.owner === "agent" && <span className="today-chip">agent</span>}
        {overdue && <span className="badge badge-critical">OVERDUE</span>}
        <span className="today-age" title={`Created ${item.created_at}`}>
          {ageLabel(item.created_at, now)}
        </span>
      </div>

      <div className="today-title">{item.title}</div>
      {item.why && <div className="today-why">{item.why}</div>}
      {agent.note && <div className="today-agent-note">{agent.note}</div>}
      {agent.warning && <div className="today-agent-warning">{agent.warning}</div>}

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
            onClick={() => run(action, failed, () => itemAction(item.id, action), true)}
          >
            {pending === action ? "…" : label}
          </button>
        ))}
        {href && (
          <a className="today-btn today-btn-link" href={href} target="_blank" rel="noreferrer">
            Open link
          </a>
        )}
        {(agent.send || agent.canRecall) && (
          <span className="today-actions-agent">
            {agent.send && (
              <button
                type="button"
                className="today-btn today-btn-agent"
                title={agent.send.title}
                aria-disabled={!agent.send.enabled || pending !== null}
                onClick={() => agent.send?.enabled && pending === null && run("send", "send", () => delegateAction(item.id), false)}
              >
                {pending === "send" ? "…" : agent.send.label}
              </button>
            )}
            {agent.canRecall && (
              <button
                type="button"
                className="today-btn"
                aria-disabled={pending !== null}
                onClick={() => pending === null && run("recall", "take back", () => recallAction(item.id), false)}
              >
                {pending === "recall" ? "…" : "Take back"}
              </button>
            )}
          </span>
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
