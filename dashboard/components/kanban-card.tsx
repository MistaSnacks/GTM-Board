"use client";

import { Draggable, type DraggableProvided, type DraggableStateSnapshot } from "@hello-pangea/dnd";
import type { CardData, Channel } from "@/lib/types";

const channelColorMap: Record<Channel, string> = {
  reddit: "var(--channel-reddit)",
  linkedin: "var(--channel-linkedin)",
  meta: "var(--channel-meta)",
  google: "var(--channel-google)",
  seo: "var(--channel-seo)",
  email: "var(--text-muted)",
  ugc: "var(--amber)",
  other: "var(--text-muted)",
};

function formatMetricValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  if (value < 1 && value > 0) return `${(value * 100).toFixed(1)}%`;
  return value.toLocaleString();
}

function formatMetricKey(key: string): string {
  const abbrevs: Record<string, string> = {
    impressions: "impr",
    engagement: "eng",
    clicks: "clk",
    conversions: "conv",
    reach: "reach",
    spend: "spend",
    ctr: "CTR",
    cpc: "CPC",
    cpm: "CPM",
    roas: "ROAS",
  };
  return abbrevs[key.toLowerCase()] ?? key.slice(0, 4);
}

function renderMetrics(metrics: Record<string, number | null>): string | null {
  const entries = Object.entries(metrics).filter(
    (entry): entry is [string, number] => entry[1] !== null
  );
  if (entries.length === 0) return null;
  return entries
    .slice(0, 3)
    .map(([key, val]) => `${formatMetricValue(val)} ${formatMetricKey(key)}`)
    .join(" \u2022 ");
}

interface KanbanCardProps {
  card: CardData;
  index: number;
  onCardClick?: (card: CardData) => void;
}

export default function KanbanCard({ card, index, onCardClick }: KanbanCardProps) {
  const borderColor = channelColorMap[card.channel];
  const metricsText = card.metrics ? renderMetrics(card.metrics) : null;
  const hasDetails = !!(card.description || card.body?.trim());

  return (
    <Draggable draggableId={card.id} index={index}>
      {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className="card"
          onClick={() => onCardClick?.(card)}
          style={{
            ...provided.draggableProps.style,
            padding: "12px",
            marginBottom: "8px",
            borderLeft: `3px solid ${borderColor}`,
            borderColor: snapshot.isDragging ? "var(--mint)" : undefined,
            boxShadow: snapshot.isDragging
              ? "0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px var(--mint)"
              : undefined,
            cursor: "pointer",
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
            {card.title}
          </div>

          {/* Description preview */}
          {card.description && (
            <div
              style={{
                fontFamily: "var(--font-inter)",
                fontSize: "11px",
                color: "var(--text-muted)",
                marginTop: "4px",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                lineHeight: "16px",
              }}
            >
              {card.description}
            </div>
          )}

          {/* Meta row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "4px",
            }}
          >
            <span
              style={{
                textTransform: "uppercase",
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.05em",
                background: "var(--bg-card-raised)",
                padding: "1px 6px",
                borderRadius: "4px",
                color: "var(--text-muted)",
              }}
            >
              {card.type}
            </span>
            {card.target_date && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                }}
              >
                {card.target_date}
              </span>
            )}
            {hasDetails && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                  opacity: 0.6,
                }}
              >
                &#8599;
              </span>
            )}
          </div>

          {/* Metrics row */}
          {metricsText && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                color: "var(--mint)",
                marginTop: "6px",
              }}
            >
              {metricsText}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}
