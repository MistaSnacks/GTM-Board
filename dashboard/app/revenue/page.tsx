import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getMetrics, getChannelHistory, buildChartData } from "@/lib/data";
import PageShell from "@/components/page-shell";
import RevenueClient from "./revenue-client";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const projects = await getProjects();
  const activeProject = await getActiveProject();
  const config = await getConfig(activeProject);
  const metrics = await getMetrics(activeProject);
  const stripeMetrics = metrics.channels.stripe;
  const supabaseMetrics = metrics.channels.supabase;
  const stripeHistory = await getChannelHistory(activeProject, "stripe", 30);
  const stripeChart = buildChartData(stripeHistory, ["mrr", "active_subscriptions", "trialing_subscriptions", "churned_30d"]);

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <RevenueClient
        stripeMetrics={stripeMetrics?.metrics ?? {}}
        supabaseMetrics={supabaseMetrics?.metrics ?? {}}
        chartData={stripeChart}
      />
    </PageShell>
  );
}
