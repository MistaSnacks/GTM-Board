export function validateReferenceUrl(url: string): boolean {
  if (!url || !url.trim()) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return true;
  if (trimmed.startsWith("mailto:")) return true;
  if (trimmed.startsWith("/")) return true;
  return false;
}

export function generateReferenceId(): string {
  // crypto.randomUUID is available in Node 19+ and all modern browsers
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (shouldn't be hit in target environments)
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
