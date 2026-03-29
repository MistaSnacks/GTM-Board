import slugify from "slugify";

export function generateCardId(title: string): string {
  const slug = slugify(title, { lower: true, strict: true });
  const suffix = Date.now().toString(16).slice(-4);
  return `${slug}-${suffix}`;
}
