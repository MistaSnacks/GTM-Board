"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

interface CardDetailModalProps {
  card: CardData | null;
  onClose: () => void;
}

function renderMarkdownLine(line: string, index: number) {
  // Heading
  if (line.startsWith("## ")) {
    return (
      <h3
        key={index}
        style={{
          fontFamily: "var(--font-outfit)",
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--text-primary)",
          marginTop: index > 0 ? "16px" : "0",
          marginBottom: "8px",
        }}
      >
        {line.slice(3)}
      </h3>
    );
  }
  // Checklist item
  if (line.startsWith("- [x] ") || line.startsWith("- [X] ")) {
    return (
      <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
        <span style={{ color: "var(--mint)", fontSize: "14px", lineHeight: "20px", flexShrink: 0 }}>&#10003;</span>
        <span style={{ fontFamily: "var(--font-inter)", fontSize: "13px", color: "var(--text-muted)", textDecoration: "line-through" }}>
          {line.slice(6)}
        </span>
      </div>
    );
  }
  if (line.startsWith("- [ ] ")) {
    return (
      <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
        <span
          style={{
            width: "14px",
            height: "14px",
            border: "1.5px solid var(--text-muted)",
            borderRadius: "3px",
            flexShrink: 0,
            marginTop: "3px",
          }}
        />
        <span style={{ fontFamily: "var(--font-inter)", fontSize: "13px", color: "var(--text-primary)" }}>
          {line.slice(6)}
        </span>
      </div>
    );
  }
  // Bullet point
  if (line.startsWith("- ")) {
    return (
      <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
        <span style={{ color: "var(--text-muted)", flexShrink: 0, lineHeight: "20px" }}>&bull;</span>
        <span style={{ fontFamily: "var(--font-inter)", fontSize: "13px", color: "var(--text-primary)", lineHeight: "20px" }}>
          {line.slice(2)}
        </span>
      </div>
    );
  }
  // Empty line
  if (line.trim() === "") {
    return <div key={index} style={{ height: "8px" }} />;
  }
  // Regular text
  return (
    <p
      key={index}
      style={{
        fontFamily: "var(--font-inter)",
        fontSize: "13px",
        color: "var(--text-primary)",
        lineHeight: "20px",
        marginBottom: "4px",
      }}
    >
      {line}
    </p>
  );
}

function formatMetricValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  if (value < 1 && value > 0) return `${(value * 100).toFixed(1)}%`;
  return value.toLocaleString();
}

export default function CardDetailModal({ card, onClose }: CardDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!card) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [card, onClose]);

  return (
    <AnimatePresence>
      {card && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => {
            if (e.target === overlayRef.current) onClose();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="card"
            style={{
              width: "100%",
              maxWidth: "520px",
              maxHeight: "80vh",
              overflow: "auto",
              padding: "24px",
              borderLeft: `4px solid ${channelColorMap[card.channel]}`,
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
              <h2
                style={{
                  fontFamily: "var(--font-outfit)",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  lineHeight: 1.3,
                }}
              >
                {card.title}
              </h2>
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "18px",
                  lineHeight: 1,
                  padding: "4px",
                  flexShrink: 0,
                }}
              >
                &#10005;
              </button>
            </div>

            {/* Tags row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "12px" }}>
              <span
                style={{
                  textTransform: "uppercase",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em",
                  background: `color-mix(in srgb, ${channelColorMap[card.channel]} 15%, transparent)`,
                  color: channelColorMap[card.channel],
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontWeight: 600,
                }}
              >
                {card.channel}
              </span>
              <span
                style={{
                  textTransform: "uppercase",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em",
                  background: "var(--bg-card-raised)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  color: "var(--text-muted)",
                }}
              >
                {card.type}
              </span>
              <span
                style={{
                  textTransform: "uppercase",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em",
                  background: "var(--bg-card-raised)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  color: "var(--text-muted)",
                }}
              >
                {card.column}
              </span>
              {card.tags?.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.05em",
                    background: "var(--bg-card-raised)",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    color: "var(--text-muted)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Dates */}
            <div style={{ display: "flex", gap: "16px", marginTop: "12px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>
                Created {card.created}
              </div>
              {card.target_date && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--amber)" }}>
                  Target {card.target_date}
                </div>
              )}
            </div>

            {/* Description */}
            {card.description && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  background: "var(--bg-card-raised)",
                  borderRadius: "8px",
                  fontFamily: "var(--font-inter)",
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  lineHeight: "20px",
                }}
              >
                {card.description}
              </div>
            )}

            {/* Metrics */}
            {card.metrics && Object.keys(card.metrics).length > 0 && (
              <div style={{ marginTop: "16px" }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: "8px",
                  }}
                >
                  Metrics
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {Object.entries(card.metrics)
                    .filter((entry): entry is [string, number] => entry[1] !== null)
                    .map(([key, val]) => (
                      <div
                        key={key}
                        style={{
                          background: "var(--bg-card-raised)",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                        }}
                      >
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                          {key}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 500, color: "var(--mint)" }}>
                          {formatMetricValue(val)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Body content */}
            {card.body && card.body.trim() !== "" && (
              <div
                style={{
                  marginTop: "16px",
                  paddingTop: "16px",
                  borderTop: "1px solid var(--border)",
                }}
              >
                {card.body
                  .split("\n")
                  .map((line, i) => renderMarkdownLine(line, i))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
