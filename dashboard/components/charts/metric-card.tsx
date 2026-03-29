"use client";

import { motion } from "framer-motion";
import Sparkline from "@/components/sparkline";

interface MetricCardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  prefix?: string;
  suffix?: string;
  sparklineData?: number[];
  sparklineColor?: string;
  index?: number;
}

export default function MetricCard({
  label,
  value,
  delta,
  deltaLabel,
  prefix,
  suffix,
  sparklineData,
  sparklineColor = "var(--mint)",
  index = 0,
}: MetricCardProps) {
  const isPositive = delta != null && delta >= 0;
  const deltaColor = delta == null ? "var(--text-muted)" : isPositive ? "var(--mint)" : "var(--red)";

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: "easeOut" }}
      style={{ padding: "20px" }}
    >
      <div
        style={{
          fontFamily: "var(--font-inter)",
          fontSize: "11px",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          marginBottom: "8px",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span
          style={{
            fontFamily: "var(--font-outfit)",
            fontWeight: 700,
            fontSize: "28px",
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
          }}
        >
          {prefix}
          {typeof value === "number" ? value.toLocaleString() : value}
          {suffix}
        </span>
        {delta != null && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              fontWeight: 500,
              color: deltaColor,
              display: "inline-flex",
              alignItems: "center",
              gap: "2px",
            }}
          >
            {isPositive ? "\u2191" : "\u2193"}
            {Math.abs(delta).toFixed(delta % 1 === 0 ? 0 : 1)}
            {deltaLabel ?? "%"}
          </span>
        )}
      </div>
      {sparklineData && sparklineData.length >= 2 && (
        <div style={{ marginTop: "10px" }}>
          <Sparkline data={sparklineData} color={sparklineColor} height={28} />
        </div>
      )}
    </motion.div>
  );
}
