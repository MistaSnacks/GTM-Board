"use client";

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const CHART_THEME = {
  grid: "rgba(255,255,255,0.04)",
  axis: "#64748B",
  tooltip: { bg: "#1A1A25", border: "rgba(255,255,255,0.08)" },
};

interface LineSeriesConfig {
  dataKey: string;
  color: string;
  name?: string;
  strokeDasharray?: string;
}

interface LineChartProps {
  data: Record<string, unknown>[];
  series: LineSeriesConfig[];
  xKey?: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  yFormatter?: (value: number) => string;
  showDots?: boolean;
}

export default function LineChartCard({
  data,
  series,
  xKey = "date",
  height = 200,
  showGrid = true,
  showLegend = false,
  yFormatter,
  showDots = true,
}: LineChartProps) {
  if (!data.length) {
    return (
      <div className="empty-state" style={{ minHeight: height }}>
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        {showGrid && (
          <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" vertical={false} />
        )}
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
        {showLegend && (
          <Legend
            wrapperStyle={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: CHART_THEME.axis,
            }}
          />
        )}
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            stroke={s.color}
            strokeWidth={2}
            name={s.name ?? s.dataKey}
            dot={showDots ? { r: 3, fill: s.color, strokeWidth: 0 } : false}
            strokeDasharray={s.strokeDasharray}
            animationDuration={800}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
