export interface ChecklistItem {
  lineIndex: number;
  checked: boolean;
  text: string;
}

const CHECKLIST_RE = /^\s*-\s\[( |x|X)\]\s(.*)$/;

export function parseChecklist(body: string): ChecklistItem[] {
  if (!body) return [];
  const lines = body.split("\n");
  const items: ChecklistItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CHECKLIST_RE);
    if (m) {
      items.push({
        lineIndex: i,
        checked: m[1] !== " ",
        text: m[2],
      });
    }
  }
  return items;
}

export function toggleChecklistLine(body: string, lineIndex: number): string {
  const lines = body.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) {
    throw new Error(`Line index ${lineIndex} out of range`);
  }
  const m = lines[lineIndex].match(CHECKLIST_RE);
  if (!m) {
    throw new Error(`Line ${lineIndex} is not a checklist item`);
  }
  const wasChecked = m[1] !== " ";
  const newBox = wasChecked ? "[ ]" : "[x]";
  lines[lineIndex] = lines[lineIndex].replace(/\[( |x|X)\]/, newBox);
  return lines.join("\n");
}
