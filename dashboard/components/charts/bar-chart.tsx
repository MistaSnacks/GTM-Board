"use client";

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const CHART_THEME = {
  grid: "rgba(255,255,255,0.04)",
  axis: "#64748B",
  tooltip: { bg: "#1A1A25", border: "rgba(255,255,255,0.08)" },
};

interface BarChartProps {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  color?: string;
  height?: number;
  showGrid?: boolean;
  yFormatter?: (value: number) => string;
  barSize?: number;
  layout?: "horizontal" | "vertical";
}

export default function BarChartCard({
  data,
  dataKey,
  xKey = "name",
  color = "var(--mint)",
  height = 200,
  showGrid = true,
  yFormatter,
  barSize = 24,
  layout = "horizontal",
}: BarChartProps) {
  if (!data.length) {
    return (
      <div className="empty-state" style={{ minHeight: height }}>
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={data} layout={layout === "vertical" ? "vertical" : "horizontal"} margin={{ top: 4, right: 4, bottom: 0, left: layout === "vertical" ? 60 : 0 }}>
        {showGrid && (
          <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" vertical={false} />
        )}
        {layout === "vertical" ? (
          <>
            <XAxis
              type="number"
              tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={yFormatter}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: CHART_THEME.axis, fontSize: 11, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={yFormatter}
              width={40}
            />
          </>
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
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
        />
        <Bar
          dataKey={dataKey}
          fill={color}
          radius={[4, 4, 0, 0]}
          barSize={barSize}
          animationDuration={800}
        />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
