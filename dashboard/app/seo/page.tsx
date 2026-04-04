import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getMetrics, getChannelHistory, getFilteredCards, buildChartData } from "@/lib/data";
import PageShell from "@/components/page-shell";
import SEOClient from "./seo-client";

export const dynamic = "force-dynamic";

export default async function SEOPage() {
  const projects = await getProjects();
  const activeProject = await getActiveProject();
  const config = await getConfig(activeProject);
  const metrics = await getMetrics(activeProject);
  const seoMetrics = metrics.channels["search-console"] || metrics.channels["google_search_console"];
  const history = await getChannelHistory(activeProject, "search-console", 30);
  const chartData = buildChartData(history, ["organic_clicks", "branded_search_volume", "avg_position", "total_impressions"]);
  const seoCards = await getFilteredCards(activeProject, { channel: "seo" });

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <SEOClient
        metrics={seoMetrics?.metrics ?? {}}
        updatedAt={seoMetrics?.updated_at ?? ""}
        chartData={chartData}
        seoCards={seoCards}
      />
    </PageShell>
  );
}
