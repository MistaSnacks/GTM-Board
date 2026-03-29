import { getBoard, getKPIs, getCadence, getMetrics, getSparklineData } from "@/lib/data";
import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const projects = getProjects();
  const activeProject = await getActiveProject();
  const config = getConfig(activeProject);
  const board = getBoard(activeProject);
  const kpis = getKPIs(activeProject);
  const cadence = getCadence(activeProject);
  const metrics = getMetrics(activeProject);
  const sparklines = getSparklineData(activeProject);

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
