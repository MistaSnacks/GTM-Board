"use client";

import { motion } from "framer-motion";
import PageHeader from "@/components/page-header";
import MetricCard from "@/components/charts/metric-card";
import AreaChartCard from "@/components/charts/area-chart";
import LineChartCard from "@/components/charts/line-chart";
import BarChartCard from "@/components/charts/bar-chart";

interface RevenueClientProps {
  stripeMetrics: Record<string, number | null>;
  supabaseMetrics: Record<string, number | null>;
  chartData: Record<string, unknown>[];
}

export default function RevenueClient({ stripeMetrics, supabaseMetrics, chartData }: RevenueClientProps) {
  const mrr = stripeMetrics.mrr ?? 0;
  const activeSubs = stripeMetrics.active_subscriptions ?? 0;
  const trialingSubs = stripeMetrics.trialing_subscriptions ?? 0;
  const churned = stripeMetrics.churned_30d ?? 0;
  const totalSignups = supabaseMetrics.total_signups ?? 0;
  const freeToPaid = (supabaseMetrics.free_to_paid_pct ?? 0) * 100;
  const arr = mrr * 12;
  const arrTarget = 60000;
  const arrProgress = arrTarget > 0 ? Math.min((arr / arrTarget) * 100, 100) : 0;

  const isEmpty = mrr === 0 && activeSubs === 0;

  return (
    <div>
      <PageHeader title="Revenue & Subscriptions" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        <MetricCard label="MRR" value={`$${mrr.toLocaleString()}`} index={0} />
        <MetricCard label="Active Subs" value={activeSubs} index={1} />
        <MetricCard label="Trialing" value={trialingSubs} index={2} />
        <MetricCard label="Churned (30d)" value={churned} index={3} />
      </div>

      {!isEmpty && (
        <>
          <div style={{ marginTop: "24px" }}>
            <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "20px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
                MRR Growth
              </div>
              <AreaChartCard data={chartData} dataKey="mrr" height={220} color="var(--mint)" yFormatter={(v) => `$${v}`} showYAxis />
            </motion.div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
            <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} style={{ padding: "20px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
                Subscription Growth
              </div>
              <LineChartCard
                data={chartData}
                series={[
                  { dataKey: "active_subscriptions", color: "var(--mint)", name: "Active" },
                  { dataKey: "trialing_subscriptions", color: "var(--turquoise)", name: "Trialing" },
                ]}
                height={180}
                showLegend
              />
            </motion.div>
            <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} style={{ padding: "20px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px" }}>
                Signup Funnel
              </div>
              <BarChartCard
                data={[
                  { name: "Signups", value: totalSignups },
                  { name: "Trialing", value: trialingSubs },
                  { name: "Paid", value: activeSubs },
                ]}
                dataKey="value"
                height={180}
                color="var(--mint)"
              />
            </motion.div>
          </div>
        </>
      )}

      {/* ARR Projection */}
      <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} style={{ padding: "20px", marginTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
            ARR Projection
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-primary)" }}>
            ${arr.toLocaleString()} / ${arrTarget.toLocaleString()}
          </span>
        </div>
        <div style={{ width: "100%", height: "8px", background: "var(--bg-card-raised)", borderRadius: "4px", overflow: "hidden" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${arrProgress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              height: "100%",
              background: `linear-gradient(90deg, var(--mint), var(--turquoise))`,
              borderRadius: "4px",
            }}
          />
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
          {arrProgress.toFixed(1)}% to target
        </div>
      </motion.div>

      {isEmpty && (
        <div className="empty-state" style={{ marginTop: "24px" }}>
          <div style={{ fontSize: "16px" }}>No revenue data yet</div>
          <div className="empty-state-hint">Connect Stripe to see subscription and revenue metrics</div>
        </div>
      )}

      {/* Conversion rate */}
      {totalSignups > 0 && (
        <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} style={{ padding: "20px", marginTop: "16px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "8px" }}>
            Free → Paid Conversion
          </div>
          <span style={{ fontFamily: "var(--font-outfit)", fontSize: "28px", fontWeight: 700, color: freeToPaid >= 5 ? "var(--mint)" : "var(--amber)" }}>
            {freeToPaid.toFixed(1)}%
          </span>
        </motion.div>
      )}
    </div>
  );
}
