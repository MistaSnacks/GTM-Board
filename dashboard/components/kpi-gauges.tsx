"use client";

import { motion } from "framer-motion";
import type { KPIData } from "@/lib/types";
import CircularGauge from "./circular-gauge";
import StatusBadge from "./status-badge";

interface KPIGaugesProps {
  kpis: KPIData[];
}

export default function KPIGauges({ kpis }: KPIGaugesProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "16px",
      }}
    >
      {kpis.map((kpi, index) => (
        <motion.div
          key={kpi.label}
          className="card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.35,
            delay: index * 0.05,
            ease: "easeOut",
          }}
          style={{ padding: "20px" }}
        >
          <CircularGauge
            value={kpi.value}
            max={kpi.target > 0 ? Math.max(kpi.target * 1.2, kpi.value) : 100}
            label={kpi.label}
            target={kpi.target}
            unit={kpi.unit}
          />

          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "13px",
              color: "var(--text-muted)",
              textAlign: "center",
              marginTop: "8px",
            }}
          >
            target: {kpi.target}
            {kpi.unit ?? ""}
          </div>

          {kpi.status === "critical" && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: "8px" }}>
              <StatusBadge status="critical" />
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
