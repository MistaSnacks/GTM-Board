import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getMetrics, getChannelHistory, getFilteredCards, buildChartData } from "@/lib/data";
import PageShell from "@/components/page-shell";
import GoogleAdsClient from "./google-ads-client";

export const dynamic = "force-dynamic";

export default async function GoogleAdsPage() {
  const projects = getProjects();
  const activeProject = await getActiveProject();
  const config = getConfig(activeProject);
  const metrics = getMetrics(activeProject);
  const adMetrics = metrics.channels.google_ads;
  const history = getChannelHistory(activeProject, "google_ads", 14);
  const chartData = buildChartData(history, ["google_ad_spend", "google_ad_clicks", "google_ad_conversions", "google_ad_cpa", "google_ad_ctr"]);
  const adCards = getFilteredCards(activeProject, { channel: "google" });

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
