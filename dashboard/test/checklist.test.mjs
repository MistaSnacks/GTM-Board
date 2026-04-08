import test from "node:test";
import assert from "node:assert/strict";
import { parseChecklist, toggleChecklistLine } from "../lib/checklist.ts";

test("parseChecklist returns empty for body without checklists", () => {
  assert.deepEqual(parseChecklist(""), []);
  assert.deepEqual(parseChecklist("just some prose\nmore prose"), []);
});

test("parseChecklist parses unchecked items", () => {
  const items = parseChecklist("- [ ] one\n- [ ] two");
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { lineIndex: 0, checked: false, text: "one" });
  assert.deepEqual(items[1], { lineIndex: 1, checked: false, text: "two" });
});

test("parseChecklist parses checked items (lower and upper x)", () => {
  const items = parseChecklist("- [x] done\n- [X] also done");
  assert.equal(items.length, 2);
  assert.equal(items[0].checked, true);
  assert.equal(items[1].checked, true);
});

test("parseChecklist preserves line indices through mixed content", () => {
  const body = "## Header\n\n- [ ] first\nplain line\n- [x] second";
  const items = parseChecklist(body);
  assert.equal(items.length, 2);
  assert.equal(items[0].lineIndex, 2);
  assert.equal(items[1].lineIndex, 4);
});

test("toggleChecklistLine flips an unchecked item to checked", () => {
  const body = "- [ ] task";
  assert.equal(toggleChecklistLine(body, 0), "- [x] task");
});

test("toggleChecklistLine flips a checked item to unchecked", () => {
  const body = "- [x] task";
  assert.equal(toggleChecklistLine(body, 0), "- [ ] task");
});

test("toggleChecklistLine leaves other lines untouched", () => {
  const body = "## Header\n- [ ] one\n- [ ] two";
  assert.equal(toggleChecklistLine(body, 1), "## Header\n- [x] one\n- [ ] two");
});

test("toggleChecklistLine throws on out-of-range index", () => {
  assert.throws(() => toggleChecklistLine("- [ ] one", 5), /out of range/);
});

test("toggleChecklistLine throws when target line is not a checklist", () => {
  assert.throws(() => toggleChecklistLine("plain text", 0), /not a checklist/);
});
