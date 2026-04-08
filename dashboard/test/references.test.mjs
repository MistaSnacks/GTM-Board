import test from "node:test";
import assert from "node:assert/strict";
import { validateReferenceUrl, generateReferenceId } from "../lib/references.ts";

test("validateReferenceUrl accepts http and https URLs", () => {
  assert.equal(validateReferenceUrl("https://example.com"), true);
  assert.equal(validateReferenceUrl("http://example.com/path"), true);
});

test("validateReferenceUrl accepts mailto", () => {
  assert.equal(validateReferenceUrl("mailto:foo@bar.com"), true);
});

test("validateReferenceUrl accepts repo-relative paths", () => {
  assert.equal(validateReferenceUrl("/docs/playbook.md"), true);
  assert.equal(validateReferenceUrl("/README.md"), true);
});

test("validateReferenceUrl rejects javascript: URLs", () => {
  assert.equal(validateReferenceUrl("javascript:alert(1)"), false);
});

test("validateReferenceUrl rejects empty string", () => {
  assert.equal(validateReferenceUrl(""), false);
  assert.equal(validateReferenceUrl("   "), false);
});

test("validateReferenceUrl rejects bare strings without scheme or leading slash", () => {
  assert.equal(validateReferenceUrl("example.com"), false);
  assert.equal(validateReferenceUrl("docs/foo.md"), false);
});

test("generateReferenceId returns a non-empty string", () => {
  const id = generateReferenceId();
  assert.equal(typeof id, "string");
  assert.ok(id.length > 0);
});

test("generateReferenceId returns unique values", () => {
  const a = generateReferenceId();
  const b = generateReferenceId();
  assert.notEqual(a, b);
});
