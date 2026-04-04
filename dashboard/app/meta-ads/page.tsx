import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getMetrics, getChannelHistory, getFilteredCards, buildChartData } from "@/lib/data";
import PageShell from "@/components/page-shell";
import MetaAdsClient from "./meta-ads-client";

export const dynamic = "force-dynamic";

export default async function MetaAdsPage() {
  const projects = await getProjects();
  const activeProject = await getActiveProject();
  const config = await getConfig(activeProject);
  const metrics = await getMetrics(activeProject);
  const adMetrics = metrics.channels.meta_ads;
  const history = await getChannelHistory(activeProject, "meta_ads", 14);
  const chartData = buildChartData(history, ["meta_ad_spend", "meta_ad_impressions", "meta_ad_conversions", "meta_ad_cpa", "meta_ad_cpm"]);
  const adCards = await getFilteredCards(activeProject, { channel: "meta" });

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <MetaAdsClient
        metrics={adMetrics?.metrics ?? {}}
        updatedAt={adMetrics?.updated_at ?? ""}
        chartData={chartData}
        adCards={adCards}
      />
    </PageShell>
  );
}
