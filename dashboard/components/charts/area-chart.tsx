"use client";

import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const CHART_THEME = {
  grid: "rgba(255,255,255,0.04)",
  axis: "#64748B",
  tooltip: { bg: "#1A1A25", border: "rgba(255,255,255,0.08)" },
};

interface AreaChartProps {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  color?: string;
  height?: number;
  showXAxis?: boolean;
  showYAxis?: boolean;
  yFormatter?: (value: number) => string;
}

export default function AreaChartCard({
  data,
  dataKey,
  xKey = "date",
  color = "var(--mint)",
  height = 200,
  showXAxis = true,
  showYAxis = false,
  yFormatter,
}: AreaChartProps) {
  if (!data.length) {
    return (
      <div className="empty-state" style={{ minHeight: height }}>
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {showXAxis && (
          <XAxis
            dataKey={xKey}
            tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
          />
        )}
        {showYAxis && (
          <YAxis
            tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={yFormatter}
            width={40}
          />
        )}
        <Tooltip
          contentStyle={{
            background: CHART_THEME.tooltip.bg,
            border: `1px solid ${CHART_THEME.tooltip.border}`,
            borderRadius: "8px",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            color: "#FAFAFA",
          }}
          labelStyle={{ color: CHART_THEME.axis, fontSize: "11px" }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-${dataKey})`}
          dot={false}
          animationDuration={800}
        />
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}
