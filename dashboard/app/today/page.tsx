import { getProjects, getActiveProject } from "@/lib/config";
import { listOpenItems, listRunners } from "@/lib/items";
import PageShell from "@/components/page-shell";
import TodayClient from "./today-client";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const projects = await getProjects();
  const activeProject = await getActiveProject();

  const [itemsRead, runnersRead] = await Promise.allSettled([listOpenItems(), listRunners()]);
  const reason = (r: PromiseRejectedResult) => (r.reason instanceof Error ? r.reason.message : String(r.reason));
  const items = itemsRead.status === "fulfilled" ? itemsRead.value : [];
  const loadError = itemsRead.status === "rejected" ? reason(itemsRead) : null;
  const runners = runnersRead.status === "fulfilled" ? runnersRead.value : null;
  const runnersError = runnersRead.status === "rejected" ? reason(runnersRead) : null;

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <TodayClient items={items} runners={runners} runnersError={runnersError} loadError={loadError} nowIso={new Date().toISOString()} />
    </PageShell>
  );
}
