import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getMetrics, getChannelHistory, getFilteredCards, getCadenceWithStreak, buildChartData } from "@/lib/data";
import PageShell from "@/components/page-shell";
import SocialsClient from "./socials-client";

export const dynamic = "force-dynamic";

export default async function SocialsPage() {
  const projects = getProjects();
  const activeProject = await getActiveProject();
  const config = getConfig(activeProject);
  const metrics = getMetrics(activeProject);
  const linkedinMetrics = metrics.channels.linkedin;
  const redditMetrics = metrics.channels.reddit;
  const linkedinHistory = getChannelHistory(activeProject, "linkedin", 14);
  const redditHistory = getChannelHistory(activeProject, "reddit", 14);
  const linkedinChart = buildChartData(linkedinHistory, ["impressions", "engagement_rate", "followers"]);
  const redditChart = buildChartData(redditHistory, ["karma", "avg_upvotes", "referral_clicks"]);
  const cadenceData = getCadenceWithStreak(activeProject);
  const socialCards = getFilteredCards(activeProject, { channel: ["linkedin", "reddit"] });

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <SocialsClient
        linkedinMetrics={linkedinMetrics?.metrics ?? {}}
        redditMetrics={redditMetrics?.metrics ?? {}}
        linkedinChart={linkedinChart}
        redditChart={redditChart}
        cadence={cadenceData.cadence}
        streak={cadenceData.streak}
        socialCards={socialCards}
      />
    </PageShell>
  );
}
