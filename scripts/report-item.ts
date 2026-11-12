/**
 * Lets an agent report the result of a Today item from a shell.
 *
 *   tsx scripts/report-item.ts <item-id> <done|returned|failed> <note>
 *
 * It does the same as the MCP tool gtm_report_item. The dispatcher puts this command in the
 * task it gives to Hermes, because a long-lived agent can hold a tool server that started
 * before the tool existed.
 */
import { parseReportArgs } from "../server/src/dispatch/report.ts";

async function main() {
  const { id, outcome, note } = parseReportArgs(process.argv.slice(2));
  const { itemStore } = await import("../server/src/items/default-store.ts");
  const item = await itemStore.reportItem(id, outcome, note);
  console.log(`Reported ${outcome} for item ${item.id}. The board has it.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
