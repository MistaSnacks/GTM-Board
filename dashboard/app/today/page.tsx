import { getProjects, getActiveProject } from "@/lib/config";
import { listOpenItems } from "@/lib/items";
import PageShell from "@/components/page-shell";
import TodayClient from "./today-client";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const projects = await getProjects();
  const activeProject = await getActiveProject();

  let items: Awaited<ReturnType<typeof listOpenItems>> = [];
  let loadError: string | null = null;
  try {
    items = await listOpenItems();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <TodayClient items={items} loadError={loadError} nowIso={new Date().toISOString()} />
    </PageShell>
  );
}
