"use client";

import { useState } from "react";
import PageHeader from "@/components/page-header";
import TodayItemRow from "@/components/today-item-row";
import type { Item } from "../../../server/src/items/types.ts";
import { ageLabel, buildSections, type SectionView } from "@/lib/today";

interface TodayClientProps {
  items: Item[];
  loadError: string | null;
  nowIso: string;
}

function Section({ view, now, open, onToggle }: { view: SectionView; now: Date; open: boolean; onToggle: () => void }) {
  const { def, count, groups } = view;
  const collapsible = def.collapsed === true;
  return (
    <section className="today-section" aria-label={def.title}>
      <button type="button" className="today-section-head" onClick={collapsible ? onToggle : undefined} disabled={!collapsible} aria-expanded={collapsible ? open : undefined}>
        <span className="today-section-title">{def.title}</span>
        <span className="today-section-count">{count}</span>
        <span className="today-section-hint">{def.hint}</span>
        {collapsible && <span className="today-section-caret">{open ? "−" : "+"}</span>}
      </button>
      {open &&
        groups.map((group) => (
          <div key={group.label ?? "all"}>
            {group.label && <div className="today-group-label">{group.label}</div>}
            <div className="today-list">
              {group.items.map((item) => (
                <TodayItemRow key={`${item.id}:${item.updated_at}`} item={item} now={now} showProject={def.id !== "seo"} />
              ))}
            </div>
          </div>
        ))}
    </section>
  );
}

export default function TodayClient({ items, loadError, nowIso }: TodayClientProps) {
  const now = new Date(nowIso);
  const [laterOpen, setLaterOpen] = useState(false);
  const sections = buildSections(items, now).filter((s) => s.count > 0);
  const needsYou = sections.find((s) => s.def.id === "now")?.count ?? 0;

  const collectorSeen = items
    .filter((i) => i.source.startsWith("collector:"))
    .map((i) => Date.parse(i.last_seen_at))
    .sort((a, b) => b - a)[0];
  const subtitle = [
    `${items.length} open`,
    `${needsYou} need you now`,
    collectorSeen ? `collectors last saw data ${ageLabel(new Date(collectorSeen).toISOString(), now)} ago` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <PageHeader title="Today" subtitle={loadError ? "All projects" : `All projects · ${subtitle}`} />

      {loadError && (
        <div role="alert" className="card today-load-error">
          <div className="today-title">Could not load items</div>
          <div className="today-why">{loadError}</div>
          {/schema cache|does not exist/i.test(loadError) && (
            <div className="today-why">The table may be missing. Apply supabase/migrations/20261106_002_gtm_items.sql to the board database.</div>
          )}
        </div>
      )}

      {!loadError && items.length === 0 && (
        <div className="empty-state">
          <div>Nothing needs attention.</div>
          <div className="empty-state-hint">Collectors run every 15 minutes. Run `npm run collect -- all` in server/ to fill this page now.</div>
        </div>
      )}

      {sections.map((view) => (
        <Section key={view.def.id} view={view} now={now} open={view.def.collapsed ? laterOpen : true} onToggle={() => setLaterOpen((v) => !v)} />
      ))}
    </div>
  );
}
