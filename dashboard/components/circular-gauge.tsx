"use client";

import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
} from "framer-motion";

interface CircularGaugeProps {
  value: number;
  max: number;
  label: string;
  target: number;
  color?: string;
  unit?: string;
}

function resolveColor(value: number, target: number, colorProp?: string): string {
  if (colorProp) return colorProp;
  if (value >= target) return "var(--mint)";
  if (value < target * 0.5) return "var(--red)";
  return "var(--amber)";
}

export default function CircularGauge({
  value,
  max,
  label,
  target,
  color,
  unit,
}: CircularGaugeProps) {
  const resolvedColor = resolveColor(value, target, color);
  const percentage = Math.min(value / max, 1);
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - percentage);

  const motionValue = useMotionValue(0);
  const displayValue = useTransform(motionValue, (v) => Math.round(v));
  const textRef = useRef<SVGTextElement>(null);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.8,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [motionValue, value]);

  useEffect(() => {
    const unsubscribe = displayValue.on("change", (v) => {
      if (textRef.current) {
        textRef.current.textContent = `${v}${unit ?? ""}`;
      }
    });
    return () => unsubscribe();
  }, [displayValue, unit]);

  const filterId = `glow-${label.replace(/\s+/g, "-")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg viewBox="0 0 120 120" width={120} height={120}>
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="3"
              floodColor={resolvedColor}
              floodOpacity="0.5"
            />
          </filter>
        </defs>

        {/* Background track */}
        <circle
          cx={60}
          cy={60}
          r={radius}
          fill="none"
          stroke="var(--bg-card-raised)"
          strokeWidth={6}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
        />

        {/* Animated fill track */}
        <motion.circle
          cx={60}
          cy={60}
          r={radius}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          transform="rotate(-90 60 60)"
          filter={`url(#${filterId})`}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />

        {/* Value text */}
        <text
          ref={textRef}
          x={60}
          y={58}
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fontFamily: "var(--font-outfit)",
            fontWeight: 700,
            fontSize: "36px",
            fill: "var(--text-primary)",
          }}
        >
          0{unit ?? ""}
        </text>

        {/* Label */}
        <text
          x={60}
          y={80}
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fontFamily: "var(--font-inter)",
            fontWeight: 500,
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fill: "var(--text-muted)",
          }}
        >
          {label}
        </text>
      </svg>

      {/* Target text below SVG */}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "var(--text-muted)",
          marginTop: "4px",
        }}
      >
        Target: {target}
        {unit ?? ""}
      </span>
    </div>
  );
}
