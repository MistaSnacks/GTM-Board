import { REPORT_OUTCOMES, type ReportOutcome } from "../items/store.ts";

export interface ReportArgs {
  id: string;
  outcome: ReportOutcome;
  note: string;
}

export const REPORT_USAGE = `Usage: report-item <item-id> <${REPORT_OUTCOMES.join("|")}> <note>`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An agent types this command, so every word after the outcome is the note, quoted or not. */
export function parseReportArgs(argv: string[]): ReportArgs {
  const [id, outcome, ...words] = argv;
  if (!id || !UUID.test(id)) throw new Error(`The first argument must be the item id. ${REPORT_USAGE}`);
  if (!(REPORT_OUTCOMES as readonly string[]).includes(outcome)) {
    throw new Error(`The outcome must be one of ${REPORT_OUTCOMES.join(", ")}. ${REPORT_USAGE}`);
  }
  const note = words.join(" ").trim();
  if (!note) throw new Error(`A report needs a note. ${REPORT_USAGE}`);
  return { id, outcome: outcome as ReportOutcome, note };
}
