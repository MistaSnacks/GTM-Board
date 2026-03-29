import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getFunnelData, getWeeklyDeltas, getChannelHistory, buildChartData } from "@/lib/data";
import PageShell from "@/components/page-shell";
import AnalyticsClient from "./analytics-client";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const projects = getProjects();
  const activeProject = await getActiveProject();
  const config = getConfig(activeProject);
  const funnel = getFunnelData(activeProject);
  const deltas = getWeeklyDeltas(activeProject);

  // Build multi-channel chart data
  const channels = ["linkedin", "reddit", "search-console", "google_ads", "meta_ads"];
  const allChartData: Record<string, Record<string, unknown>[]> = {};
  for (const ch of channels) {
    const history = getChannelHistory(activeProject, ch, 8);
    const primaryKeys: Record<string, string[]> = {
      linkedin: ["impressions"],
      reddit: ["karma"],
      "search-console": ["organic_clicks"],
      google_ads: ["google_ad_conversions"],
      meta_ads: ["meta_ad_conversions"],
    };
    allChartData[ch] = buildChartData(history, primaryKeys[ch] || []);
  }

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <AnalyticsClient funnel={funnel} deltas={deltas} channelCharts={allChartData} />
    </PageShell>
  );
}
