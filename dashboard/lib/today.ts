import { isAlive, sendTarget } from "../../server/src/items/runners.ts";
import { delegationOf } from "../../server/src/items/delegation.ts";
import type { DelegationState, Item, ItemStatus, Priority, Runner } from "../../server/src/items/types.ts";

export type SectionId = "now" | "agents" | "seo" | "code" | "followups" | "later";

export interface SectionDef {
  id: SectionId;
  title: string;
  hint: string;
  collapsed?: boolean;
  groupByProject?: boolean;
  matches: (item: Item, now: Date) => boolean;
}

export function isOverdueAgentItem(item: Item, now: Date): boolean {
  return item.owner === "agent" && item.due_at !== null && Date.parse(item.due_at) < now.getTime();
}

/** The delegation states in which an item is with an agent, or came back from one and waits for a person. */
const AGENT_STATES: ReadonlySet<DelegationState> = new Set(["queued", "running", "returned", "failed"]);

export function isWithAgent(item: Item): boolean {
  const delegation = delegationOf(item);
  return delegation !== null && AGENT_STATES.has(delegation.state);
}

/** Items that an agent holds now: sent and not yet reported. */
export function countWithAgents(items: Item[]): number {
  return items.filter((i) => {
    const state = delegationOf(i)?.state;
    return state === "queued" || state === "running";
  }).length;
}

/**
 * The one table from kind and owner to section. The first match wins, and the last row
 * matches everything, so every open item lands in exactly one section.
 */
export const SECTIONS: readonly SectionDef[] = [
  {
    id: "now",
    title: "Needs you now",
    hint: "You own it, and it is priority 0 or 1",
    matches: (i) => i.owner === "camren" && i.priority <= 1 && !isWithAgent(i),
  },
  {
    id: "agents",
    title: "Agents",
    hint: "Sent to an agent, waiting for input, failed, or overdue",
    matches: (i, now) => isWithAgent(i) || i.kind === "agent_needs_input" || i.kind === "agent_failed" || isOverdueAgentItem(i, now),
  },
  { id: "seo", title: "SEO", hint: "Daily and weekly SEO tasks", groupByProject: true, matches: (i) => i.kind === "seo_task" },
  { id: "code", title: "Code", hint: "Repos and pull requests", matches: (i) => i.kind === "repo_attention" || i.kind === "pr_attention" },
  { id: "followups", title: "Follow-ups", hint: "Things to chase", matches: (i) => i.kind === "follow_up" },
  { id: "later", title: "Later", hint: "Everything else", collapsed: true, matches: () => true },
];

export function sectionOf(item: Item, now: Date): SectionId {
  return (SECTIONS.find((s) => s.matches(item, now)) as SectionDef).id;
}

export interface SectionGroup {
  label: string | null;
  items: Item[];
}

export interface SectionView {
  def: SectionDef;
  count: number;
  groups: SectionGroup[];
}

const GENERAL = "General";

/** Items arrive sorted. Each section keeps that order. A grouped section splits by project, General last. */
export function buildSections(items: Item[], now: Date): SectionView[] {
  const bySection = new Map<SectionId, Item[]>(SECTIONS.map((s) => [s.id, []]));
  for (const item of items) bySection.get(sectionOf(item, now))?.push(item);

  return SECTIONS.map((def) => {
    const own = bySection.get(def.id) ?? [];
    if (!def.groupByProject) return { def, count: own.length, groups: own.length ? [{ label: null, items: own }] : [] };
    const projects = new Map<string, Item[]>();
    for (const item of own) projects.set(item.project ?? GENERAL, [...(projects.get(item.project ?? GENERAL) ?? []), item]);
    const labels = [...projects.keys()].sort((a, b) => (a === GENERAL ? 1 : b === GENERAL ? -1 : a.localeCompare(b)));
    return { def, count: own.length, groups: labels.map((label) => ({ label, items: projects.get(label) ?? [] })) };
  });
}

export type ItemAction = "done" | "snooze-1d" | "snooze-1w" | "dismiss";

export interface ActionPatch {
  status: ItemStatus;
  snoozed_until?: string;
}

const DAY_MS = 86_400_000;

/** What each row button writes. Snooze times come from the server clock. */
export const ACTION_PATCHES: Record<ItemAction, (now: Date) => ActionPatch> = {
  done: () => ({ status: "done" }),
  dismiss: () => ({ status: "dismissed" }),
  "snooze-1d": (now) => ({ status: "snoozed", snoozed_until: new Date(now.getTime() + DAY_MS).toISOString() }),
  "snooze-1w": (now) => ({ status: "snoozed", snoozed_until: new Date(now.getTime() + 7 * DAY_MS).toISOString() }),
};

export interface AgentView {
  badge: { text: string; className: string } | null;
  sentAgo: string | null;
  /** A line under the title: the runner is offline. */
  warning: string | null;
  /** The agent's note on a returned or failed item, as "<label>: <note>". */
  note: string | null;
  /** The send button. Null when the row offers none. */
  send: { label: string; enabled: boolean; title: string } | null;
  canRecall: boolean;
}

/** Everything the row shows about an agent, derived in one place so the row only renders it. */
export function agentView(item: Item, runners: Runner[] | null, now: Date): AgentView {
  const delegation = delegationOf(item);
  const state = delegation?.state ?? null;
  const target = runners ? sendTarget(item.project, runners, now) : ({ kind: "none" } as const);
  const holder = delegation ? runners?.find((r) => r.name === delegation.runner) : undefined;
  const label = holder?.label ?? delegation?.runner ?? "";
  const held = state === "queued" || state === "running";
  const again = state === "returned" || state === "failed";

  const lastSeen = (runner: Runner) => `${runner.label} is offline. It last checked in ${ageLabel(runner.last_seen_at, now)} ago.`;
  let warning: string | null = null;
  if (held && holder && !isAlive(holder, now)) warning = lastSeen(holder);
  else if (held && runners && !holder) warning = `${label} is not registered on this board.`;
  else if (!held && target.kind === "offline") warning = lastSeen(target.runner);

  let send: AgentView["send"] = null;
  if (!held && target.kind === "ready") {
    send = { label: again ? "Send again" : `Send to ${target.runner.label}`, enabled: true, title: `Send this item to ${target.runner.label}` };
  } else if (!held && target.kind === "offline") {
    send = { label: again ? "Send again" : `Send to ${target.runner.label}`, enabled: false, title: lastSeen(target.runner) };
  } else if (!held && target.kind === "unserved") {
    send = {
      label: `No agent for ${target.project}`,
      enabled: false,
      title: `No agent serves ${target.project}. Install the dispatcher on the machine that serves it.`,
    };
  }

  const badges: Partial<Record<DelegationState, { text: string; className: string }>> = {
    queued: { text: `QUEUED · ${label.toUpperCase()}`, className: "badge badge-denim" },
    running: { text: `${label.toUpperCase()} WORKING`, className: "badge badge-active" },
    returned: { text: "RETURNED", className: "badge badge-pending" },
    failed: { text: "FAILED", className: "badge badge-critical" },
  };

  return {
    badge: (delegation && badges[delegation.state]) || null,
    sentAgo: delegation && held ? `sent ${ageLabel(delegation.at, now)} ago` : null,
    warning,
    note: delegation && again && delegation.note ? `${label}: ${delegation.note}` : null,
    send,
    canRecall: held || again,
  };
}

export function isItemAction(value: string): value is ItemAction {
  return Object.hasOwn(ACTION_PATCHES, value);
}

export const PRIORITY_LABEL: Record<Priority, string> = { 0: "NOW", 1: "TODAY", 2: "WEEK", 3: "LATER" };

export function ageLabel(fromIso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(fromIso)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/** Only web, file and board-relative links become an href. */
export function safeHref(link: string | null): string | null {
  return link && /^(https?:\/\/|file:\/\/|\/)/.test(link) ? link : null;
}
