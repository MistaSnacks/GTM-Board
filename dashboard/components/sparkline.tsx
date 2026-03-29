"use client";

import { motion } from "framer-motion";
import { useId, useMemo } from "react";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}

function buildPath(
  data: number[],
  viewWidth: number,
  viewHeight: number
): { linePath: string; areaPath: string } {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;
  const usableHeight = viewHeight - padding * 2;
  const step = viewWidth / (data.length - 1);

  const points = data.map((v, i) => ({
    x: i * step,
    y: padding + usableHeight - ((v - min) / range) * usableHeight,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${viewHeight} L ${points[0].x} ${viewHeight} Z`;

  return { linePath, areaPath };
}

export default function Sparkline({
  data,
  color = "var(--mint)",
  height = 40,
  width,
}: SparklineProps) {
  const reactId = useId();
  const gradientId = `sparkline-grad-${reactId.replace(/:/g, "")}`;

  const viewWidth = 200;

  const paths = useMemo(() => {
    if (data.length < 2) return null;
    return buildPath(data, viewWidth, height);
  }, [data, height]);

  if (!data.length || !paths) return null;

  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${height}`}
      width={width ?? "100%"}
      height={height}
      preserveAspectRatio="none"
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={paths.areaPath} fill={`url(#${gradientId})`} />

      {/* Animated line */}
      <motion.path
        d={paths.linePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
    </svg>
  );
}
