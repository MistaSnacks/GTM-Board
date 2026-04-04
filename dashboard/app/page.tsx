import { getBoard, getKPIs, getCadence, getMetrics, getSparklineData } from "@/lib/data";
import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const projects = await getProjects();
  const activeProject = await getActiveProject();
  const config = await getConfig(activeProject);
  const board = await getBoard(activeProject);
  const kpis = await getKPIs(activeProject);
  const cadence = await getCadence(activeProject);
  const metrics = await getMetrics(activeProject);
  const sparklines = await getSparklineData(activeProject);

  return (
    <DashboardClient
      projects={projects}
      activeProject={activeProject}
      projectName={config.name}
      board={board}
      kpis={kpis}
      cadence={cadence}
      channels={metrics.channels}
      sparklines={sparklines}
    />
  );
}
