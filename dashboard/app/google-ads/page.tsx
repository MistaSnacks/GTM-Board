import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getMetrics, getChannelHistory, getFilteredCards, buildChartData } from "@/lib/data";
import PageShell from "@/components/page-shell";
import GoogleAdsClient from "./google-ads-client";

export const dynamic = "force-dynamic";

export default async function GoogleAdsPage() {
  const projects = await getProjects();
  const activeProject = await getActiveProject();
  const config = await getConfig(activeProject);
  const metrics = await getMetrics(activeProject);
  const adMetrics = metrics.channels.google_ads;
  const history = await getChannelHistory(activeProject, "google_ads", 14);
  const chartData = buildChartData(history, ["google_ad_spend", "google_ad_clicks", "google_ad_conversions", "google_ad_cpa", "google_ad_ctr"]);
  const adCards = await getFilteredCards(activeProject, { channel: "google" });

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <GoogleAdsClient
        metrics={adMetrics?.metrics ?? {}}
        updatedAt={adMetrics?.updated_at ?? ""}
        chartData={chartData}
        adCards={adCards}
      />
    </PageShell>
  );
}
